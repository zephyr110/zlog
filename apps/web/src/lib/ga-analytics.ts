import { createSign } from "node:crypto"
import {
  Agent,
  ProxyAgent,
  Socks5ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici"
import {
  isCachedProxyEquivalent,
  isSocksProxyUrl,
  proxyListenPort,
  socksUrlForHttpProxy,
} from "@/lib/proxy-dispatcher"
import {
  collectProxyCandidates,
  envLocalFilePaths,
  isDesktopAnalyticsProcess,
  isLoopbackProxyUrl,
  parseDotenvProxyValues,
  selectProxyUrl,
  trustedProxyUrls,
} from "@/lib/analytics-proxy-env"
import { readFileSync } from "node:fs"
import net from "node:net"
import { isPublicTrafficPath } from "@/lib/analytics-paths"
import { foldChinaRegions } from "@/lib/analytics-countries"
import {
  AnalyticsFetchError,
  type AnalyticsRange,
  type AnalyticsReport,
  type AnalyticsTimeoutHint,
} from "@/lib/analytics-shared"

export {
  AnalyticsFetchError,
  analyticsTimeoutI18nKeys,
  parseAnalyticsRange,
  parseAnalyticsSource,
  type AnalyticsRange,
  type AnalyticsReport,
  type AnalyticsSource,
  type AnalyticsTimeoutHint,
} from "@/lib/analytics-shared"

/**
 * 用 undici 官方代理 Agent（ProxyAgent / Socks5ProxyAgent）——手写 CONNECT
 * dispatcher 无法正确完成隧道 + TLS（见 proxy-dispatcher.ts 头部说明）。
 * 超时作为 Agent options 传入：undici 的 fetch 不读 connectTimeout/
 * headersTimeout/bodyTimeout（实测挂起 300s），必须配置在 Agent 上，
 * 否则半死代理会让仪表盘挂 5 分钟（沿用原实现的 8s/20s/30s 边界）。
 */
const PROXY_AGENT_TIMEOUTS = {
  connectTimeout: 8_000,
  headersTimeout: 20_000,
  bodyTimeout: 30_000,
}

/** 脱敏代理 URL（日志输出用：去掉 userinfo，避免凭据落日志）。 */
function redactProxyUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl)
    return `${u.protocol}//${u.host}`
  } catch {
    return "(invalid proxy url)"
  }
}

function createProxyDispatcher(proxyUrl: string): Dispatcher | undefined {
  if (isSocksProxyUrl(proxyUrl)) {
    const protocol = new URL(proxyUrl).protocol
    // undici Socks5ProxyAgent 只接受 socks5:/socks:；socks5h（远端 DNS）
    // 降级为 socks5（本地解析，语义差异可接受）；socks4/socks4a 不支持
    if (protocol === "socks4:" || protocol === "socks4a:") {
      console.warn(
        "[analytics] socks4 proxy not supported, running direct:",
        redactProxyUrl(proxyUrl)
      )
      return undefined
    }
    const normalized = proxyUrl.replace(/^socks5h:/i, "socks5:")
    // Socks5ProxyAgent 是 (proxyUrl, options) 两参数构造；ProxyAgent 是
    // 单参数 opts（string 或 { uri, ...AgentOptions }）——超时分别按各自
    // 签名传入，否则 Agent 默认 headers/body 超时 300s 会让半死代理
    // 把仪表盘挂 5 分钟
    return new Socks5ProxyAgent(normalized, PROXY_AGENT_TIMEOUTS)
  }
  return new ProxyAgent({ uri: proxyUrl, ...PROXY_AGENT_TIMEOUTS })
}

const RANGES: Record<AnalyticsRange, { startDate: string; endDate: string }> = {
  today: { startDate: "today", endDate: "today" },
  "7d": { startDate: "7daysAgo", endDate: "today" },
  "30d": { startDate: "30daysAgo", endDate: "today" },
}

const CACHE_TTL_MS = 10 * 60 * 1000
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"

type CacheEntry = { expires: number; report: AnalyticsReport }

const reportCache = new Map<AnalyticsRange, CacheEntry>()

type GaRow = {
  dimensionValues?: { value?: string | null }[] | null
  metricValues?: { value?: string | null }[] | null
}

type GaReport = { rows?: GaRow[] | null }

type BatchRunReportsResponse = { reports?: GaReport[] | null }

type RunReportRequest = {
  dateRanges: { startDate: string; endDate: string }[]
  metrics: { name: string }[]
  dimensions?: { name: string }[]
  orderBys?: { metric: { metricName: string }; desc?: boolean }[]
  /** GA REST encodes int64 limit as a string. */
  limit?: string
  dimensionFilter?: Record<string, unknown>
}

export function isGaConfigured(): boolean {
  return Boolean(
    process.env.GA_PROPERTY_ID?.trim() &&
      process.env.GA_CLIENT_EMAIL?.trim() &&
      process.env.GA_PRIVATE_KEY?.trim()
  )
}

function normalizePrivateKey(raw: string): string {
  // .env often stores PEM with literal \n; some editors paste real newlines.
  let key = raw.trim().replace(/^["']|["']$/g, "")
  key = key.replace(/\\n/g, "\n")
  if (!key.endsWith("\n")) key += "\n"
  return key
}

function metricValue(row: GaRow | null | undefined, index: number): number {
  const raw = row?.metricValues?.[index]?.value
  const n = Number(raw ?? 0)
  return Number.isFinite(n) ? n : 0
}

function dimValue(row: GaRow | null | undefined, index: number): string {
  return row?.dimensionValues?.[index]?.value?.trim() || "(not set)"
}

function classifyGaError(err: unknown): AnalyticsFetchError {
  const message = err instanceof Error ? err.message : String(err)
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : ""
  const status =
    typeof err === "object" && err && "status" in err
      ? String((err as { status: unknown }).status)
      : ""
  const cause =
    typeof err === "object" && err && "cause" in err
      ? String((err as { cause: unknown }).cause)
      : ""
  const blob = `${code} ${status} ${message} ${cause}`

  if (NETWORK_ERROR_RE.test(blob)) {
    return new AnalyticsFetchError(
      "timeout",
      "Cannot reach Google Analytics Data API (network timeout)",
      analyticsTimeoutHint(err)
    )
  }
  // OAuth token-exchange failures (rotated private key, wrong client
  // email) surface as 400 invalid_grant / 401 — a credential problem, not
  // a transient outage.
  if (
    (code === "400" || code === "401") &&
    /invalid_grant|unauthorized_client|invalid_client/i.test(blob)
  ) {
    return new AnalyticsFetchError(
      "permission",
      "Google Analytics credentials are invalid — check GA_PRIVATE_KEY and GA_CLIENT_EMAIL"
    )
  }
  // Includes SERVICE_DISABLED (“API has not been used in project…”) and
  // missing GA property Viewer — both surface as PERMISSION_DENIED / 403.
  if (
    code === "7" ||
    code === "403" ||
    status === "PERMISSION_DENIED" ||
    /PERMISSION_DENIED|SERVICE_DISABLED|has not been used in project|does not have sufficient permissions|Caller does not have|User does not have sufficient permissions/i.test(
      blob
    ) ||
    (/\b403\b/.test(blob) && /permission|denied|forbidden|disabled/i.test(blob))
  ) {
    return new AnalyticsFetchError(
      "permission",
      /SERVICE_DISABLED|has not been used in project/i.test(blob)
        ? "Enable Google Analytics Data API on the GCP project, then retry"
        : "Service account lacks access to this GA4 property"
    )
  }
  return new AnalyticsFetchError("unavailable", message.slice(0, 200))
}

/** Bracket access so Next/webpack cannot compile `process.env.HTTPS_PROXY`
 *  to `undefined` when the var was missing at bundling time. */
function envTrim(name: string): string | undefined {
  const raw = process.env[name]
  const url = typeof raw === "string" ? raw.trim() : ""
  return url || undefined
}

function readEnvLocalText(): string | undefined {
  for (const filePath of envLocalFilePaths(process.cwd())) {
    try {
      return readFileSync(filePath, "utf8")
    } catch {
      /* cwd 可能是仓库根、apps/web 或 .next */
    }
  }
  return undefined
}

function tcpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const socket = net.connect({ host, port })
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once("connect", () => done(true))
    socket.once("error", () => done(false))
  })
}

async function isUsableProxy(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    const port = proxyListenPort(parsed)
    if (!parsed.hostname || port <= 0) return false
    if (!isLoopbackProxyUrl(url)) return true
    return tcpReachable(parsed.hostname, port, 600)
  } catch {
    return false
  }
}

async function resolveProxyUrl(): Promise<string | undefined> {
  // Vercel production/preview can reach Google directly. A copied
  // HTTPS_PROXY=http://127.0.0.1:… from .env.local would point at the
  // serverless instance’s own loopback and only add timeouts.
  if (isHostedVercel()) return undefined
  const desktop = isDesktopAnalyticsProcess(process.env)
  const fileText = desktop ? undefined : readEnvLocalText()
  const fileUrls = fileText ? parseDotenvProxyValues(fileText) : []
  const candidates = collectProxyCandidates({
    env: process.env,
    fileText,
  })
  const chosen = await selectProxyUrl(
    candidates,
    trustedProxyUrls({ desktop, fileUrls, candidates }),
    isUsableProxy
  )
  if (!chosen && candidates.length > 0) {
    console.warn("[analytics] no usable proxy", {
      cwd: process.cwd(),
      fileFound: Boolean(fileText),
      candidateCount: candidates.length,
    })
  }
  return chosen
}

function isHostedVercel(): boolean {
  const env = envTrim("VERCEL_ENV")
  return env === "production" || env === "preview"
}

export function analyticsTimeoutHint(err: unknown): AnalyticsTimeoutHint {
  const proxyAttempted =
    typeof err === "object" &&
    err !== null &&
    "proxyAttempted" in err &&
    Boolean((err as { proxyAttempted?: unknown }).proxyAttempted)
  if (isHostedVercel()) return "hosted"
  return proxyAttempted ? "proxy" : "direct"
}

const NETWORK_ERROR_RE =
  /DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|ConnectTimeout|UND_ERR/i

function isNetworkFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : ""
  const cause =
    typeof err === "object" && err && "cause" in err
      ? String((err as { cause: unknown }).cause)
      : ""
  return NETWORK_ERROR_RE.test(`${code} ${message} ${cause}`)
}

/** Direct path: short connect so a blocked Google IP fails over quickly.
 *  autoSelectFamily prefers IPv4 when IPv6 is advertised but black-holed. */
const directAgent = new Agent({
  connectTimeout: 4_000,
  headersTimeout: 20_000,
  bodyTimeout: 30_000,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 300,
})

let cachedProxyAgent: Dispatcher | undefined
let cachedProxyUrl: string | undefined
let resolvedProxyUrl: string | undefined
let didResolveProxyUrl = false
let resolveProxyUrlInflight: Promise<string | undefined> | undefined

/** After a direct→proxy failover, prefer the proxy briefly so OAuth +
 *  batchRunReports don’t each burn connectTimeout on a blocked direct path. */
let preferProxyUntil = 0
const PREFER_PROXY_MS = 60_000

function socksFallbackUrl(proxyUrl: string | undefined): string | undefined {
  if (!proxyUrl || isSocksProxyUrl(proxyUrl)) return undefined
  return socksUrlForHttpProxy(proxyUrl)
}

async function resolveProxyUrlOnce(): Promise<string | undefined> {
  if (didResolveProxyUrl) return resolvedProxyUrl
  if (!resolveProxyUrlInflight) {
    resolveProxyUrlInflight = resolveProxyUrl().then((url) => {
      resolvedProxyUrl = url
      didResolveProxyUrl = true
      resolveProxyUrlInflight = undefined
      return url
    })
  }
  return resolveProxyUrlInflight
}

function cachedDispatcherMatches(proxyUrl: string): boolean {
  if (!cachedProxyAgent || !cachedProxyUrl) return false
  return isCachedProxyEquivalent(cachedProxyUrl, proxyUrl)
}

async function getProxyDispatcher(): Promise<Dispatcher | undefined> {
  const proxyUrl = await resolveProxyUrlOnce()
  if (!proxyUrl) {
    cachedProxyAgent = undefined
    cachedProxyUrl = undefined
    return undefined
  }
  if (cachedDispatcherMatches(proxyUrl)) return cachedProxyAgent
  try {
    cachedProxyUrl = proxyUrl
    cachedProxyAgent = createProxyDispatcher(proxyUrl)
    // createProxyDispatcher 可能返回 undefined（socks4 不支持等）：同样
    // 清空缓存，否则缓存永不匹配、每次 fetch 都重建 + 重复 warn
    if (!cachedProxyAgent) cachedProxyUrl = undefined
    return cachedProxyAgent
  } catch {
    // Bad HTTPS_PROXY (invalid URL etc.) — keep the original network error
    // instead of masking it with dispatcher construction failure.
    cachedProxyAgent = undefined
    cachedProxyUrl = undefined
    return undefined
  }
}

async function gaFetchOnce(
  input: string,
  init: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } | undefined,
  dispatcher: Dispatcher
): Promise<Response> {
  // 超时在 Agent 构造时配置（directAgent 与代理 Agent）——undici 的 fetch
  // 不读 connectTimeout/headersTimeout/bodyTimeout 选项
  return undiciFetch(input, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    dispatcher,
  }) as unknown as Response
}

function markProxyAttempted(err: unknown): never {
  const wrapped =
    typeof err === "object" && err !== null ? err : new Error(String(err))
  ;(wrapped as { proxyAttempted?: boolean }).proxyAttempted = true
  throw wrapped
}

/**
 * Direct first. If that fails with a network error and a system/env
 * HTTP proxy is available, retry once through it. Never a baked-in
 * localhost port — the URL comes from HTTPS_PROXY or the OS VPN proxy.
 */
export async function analyticsFetch(
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  }
): Promise<Response> {
  const proxy = await getProxyDispatcher()
  const preferProxy = Boolean(proxy && Date.now() < preferProxyUntil)

  if (preferProxy && proxy) {
    try {
      return await gaFetchOnce(input, init, proxy)
    } catch (proxyErr) {
      try {
        return await gaFetchOnce(input, init, directAgent)
      } catch {
        markProxyAttempted(proxyErr)
      }
    }
  }

  try {
    return await gaFetchOnce(input, init, directAgent)
  } catch (err) {
    if (!proxy || !isNetworkFailure(err)) throw err
    console.warn(
      "[analytics] direct Google request failed; retrying via HTTP/SOCKS proxy"
    )
    try {
      const res = await gaFetchOnce(input, init, proxy)
      preferProxyUntil = Date.now() + PREFER_PROXY_MS
      return res
    } catch (proxyErr) {
      const socksUrl = socksFallbackUrl(cachedProxyUrl)
      if (socksUrl) {
        try {
          const socks = createProxyDispatcher(socksUrl)
          if (socks) {
            const res = await gaFetchOnce(input, init, socks)
            cachedProxyUrl = socksUrl
            cachedProxyAgent = socks
            preferProxyUntil = Date.now() + PREFER_PROXY_MS
            return res
          }
        } catch {
          /* 继续抛出原代理错误 */
        }
      }
      cachedProxyAgent = undefined
      cachedProxyUrl = undefined
      markProxyAttempted(proxyErr)
    }
  }
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

/** Sign a service-account JWT locally (no network), then exchange below. */
function signServiceAccountAssertion(email: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" })
  const claim = base64UrlJson({
    iss: email,
    scope: GA_SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })
  const unsigned = `${header}.${claim}`
  const signer = createSign("RSA-SHA256")
  signer.update(unsigned)
  const signature = signer.sign(privateKey, "base64url")
  return `${unsigned}.${signature}`
}

/** Access tokens are valid for 1h — reuse one until ~10 min before expiry
 *  instead of re-signing the JWT and re-exchanging on every report fetch. */
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const email = process.env.GA_CLIENT_EMAIL!.trim()
  const privateKey = normalizePrivateKey(process.env.GA_PRIVATE_KEY!)
  const assertion = signServiceAccountAssertion(email, privateKey)

  const res = await analyticsFetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    cachedToken = null
    throw Object.assign(new Error(text.slice(0, 500)), {
      code: String(res.status),
    })
  }
  const json = JSON.parse(text) as { access_token?: string }
  if (!json.access_token) {
    cachedToken = null
    throw new AnalyticsFetchError("unavailable", "Failed to obtain Google access token")
  }
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + 50 * 60 * 1000, // 1h validity; refresh 10 min early
  }
  return json.access_token
}

/**
 * Call GA4 Data API over plain HTTPS JSON.
 * Direct first; falls back to the system/env HTTP proxy on network failure.
 * Avoids `@google-analytics/data` REST fallback, which throws
 * `toProto3JSON: don't know how to convert value 10` for int64 `limit`
 * on Vercel’s Node runtime.
 *
 * Each batchRunReports HTTP call allows at most 5 requests — chunk when
 * the dashboard asks for more panels (browsers / OS / …).
 */
const GA_BATCH_MAX = 5

async function batchRunReportsOnce(
  property: string,
  requests: RunReportRequest[]
): Promise<BatchRunReportsResponse> {
  const token = await getAccessToken()
  const res = await analyticsFetch(
    `https://analyticsdata.googleapis.com/v1beta/${property}:batchRunReports`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  )
  const text = await res.text()
  if (!res.ok) {
    let status = ""
    try {
      status = String((JSON.parse(text) as { error?: { status?: string } }).error?.status ?? "")
    } catch {
      /* ignore */
    }
    throw Object.assign(new Error(text.slice(0, 500)), {
      code: String(res.status),
      status,
    })
  }
  return JSON.parse(text) as BatchRunReportsResponse
}

async function batchRunReports(
  property: string,
  requests: RunReportRequest[]
): Promise<BatchRunReportsResponse> {
  if (requests.length <= GA_BATCH_MAX) {
    return batchRunReportsOnce(property, requests)
  }
  const chunks: RunReportRequest[][] = []
  for (let i = 0; i < requests.length; i += GA_BATCH_MAX) {
    chunks.push(requests.slice(i, i + GA_BATCH_MAX))
  }
  const parts = await Promise.all(
    chunks.map((chunk) => batchRunReportsOnce(property, chunk))
  )
  return { reports: parts.flatMap((p) => p.reports ?? []) }
}

/** Fetch GA4 report for a range (cached ~10 minutes). */
export async function fetchAnalyticsReport(
  range: AnalyticsRange
): Promise<AnalyticsReport> {
  const hit = reportCache.get(range)
  if (hit && hit.expires > Date.now()) return hit.report

  const propertyId = process.env.GA_PROPERTY_ID!.trim()
  const property = `properties/${propertyId}`
  const dateRange = RANGES[range]

  let batch: BatchRunReportsResponse
  try {
    batch = await batchRunReports(property, [
      {
        dateRanges: [dateRange],
        metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
      },
      {
        dateRanges: [dateRange],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        // Owner-only /admin and /admin/* — exact + slash prefix so public
        // paths like /administration are not dropped.
        dimensionFilter: {
          notExpression: {
            orGroup: {
              expressions: [
                {
                  filter: {
                    fieldName: "pagePath",
                    stringFilter: {
                      matchType: "EXACT",
                      value: "/admin",
                      caseSensitive: false,
                    },
                  },
                },
                {
                  filter: {
                    fieldName: "pagePath",
                    stringFilter: {
                      matchType: "BEGINS_WITH",
                      value: "/admin/",
                      caseSensitive: false,
                    },
                  },
                },
              ],
            },
          },
        },
        limit: "10",
      },
      {
        dateRanges: [dateRange],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: "10",
      },
      {
        dateRanges: [dateRange],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      },
      {
        dateRanges: [dateRange],
        dimensions: [{ name: "browser" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: "10",
      },
      {
        dateRanges: [dateRange],
        dimensions: [{ name: "operatingSystem" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: "10",
      },
      {
        dateRanges: [dateRange],
        dimensions: [{ name: "country" }, { name: "countryId" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: "10",
      },
    ])
  } catch (err) {
    throw classifyGaError(err)
  }

  const reports = batch.reports ?? []
  const totalsRow = reports[0]?.rows?.[0]
  const report: AnalyticsReport = {
    configured: true,
    source: "ga",
    range,
    totals: {
      activeUsers: metricValue(totalsRow, 0),
      screenPageViews: metricValue(totalsRow, 1),
    },
    topPages: (reports[1]?.rows ?? [])
      .map((row) => ({
        path: dimValue(row, 0),
        views: metricValue(row, 0),
      }))
      .filter((row) => isPublicTrafficPath(row.path))
      .slice(0, 10),
    sources: (reports[2]?.rows ?? []).map((row) => ({
      source: dimValue(row, 0),
      users: metricValue(row, 0),
    })),
    devices: (reports[3]?.rows ?? []).map((row) => ({
      device: dimValue(row, 0),
      users: metricValue(row, 0),
    })),
    browsers: (reports[4]?.rows ?? []).map((row) => ({
      browser: dimValue(row, 0),
      users: metricValue(row, 0),
    })),
    operatingSystems: (reports[5]?.rows ?? []).map((row) => ({
      os: dimValue(row, 0),
      users: metricValue(row, 0),
    })),
    countries: foldChinaRegions(
      (reports[6]?.rows ?? []).map((row) => ({
        country: dimValue(row, 0),
        countryId: dimValue(row, 1),
        users: metricValue(row, 0),
      }))
    ),
  }

  reportCache.set(range, { expires: Date.now() + CACHE_TTL_MS, report })
  return report
}
