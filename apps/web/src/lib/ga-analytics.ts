import { createSign } from "node:crypto"
import {
  Agent,
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici"
import { isPublicTrafficPath } from "@/lib/analytics-paths"
import { foldChinaRegions } from "@/lib/analytics-countries"

export type AnalyticsRange = "today" | "7d" | "30d"

/** Which backend powers the admin Traffic panels. */
export type AnalyticsSource = "ga" | "vercel"

export type AnalyticsReport = {
  configured: true
  source: AnalyticsSource
  range: AnalyticsRange
  totals: { activeUsers: number; screenPageViews: number }
  topPages: { path: string; views: number }[]
  sources: { source: string; users: number }[]
  devices: { device: string; users: number }[]
  browsers: { browser: string; users: number }[]
  operatingSystems: { os: string; users: number }[]
  countries: { country: string; countryId: string; users: number }[]
}

type AnalyticsFetchErrorKind = "timeout" | "permission" | "unavailable"

/** How to hint the admin empty-state when kind is timeout. */
export type AnalyticsTimeoutHint = "direct" | "proxy" | "hosted"

export class AnalyticsFetchError extends Error {
  kind: AnalyticsFetchErrorKind
  timeoutHint?: AnalyticsTimeoutHint
  constructor(
    kind: AnalyticsFetchErrorKind,
    message: string,
    timeoutHint?: AnalyticsTimeoutHint
  ) {
    super(message)
    this.kind = kind
    this.timeoutHint = timeoutHint
    this.name = "AnalyticsFetchError"
  }
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

export function parseAnalyticsRange(raw: string | null): AnalyticsRange {
  if (raw === "today" || raw === "7d" || raw === "30d") return raw
  // Legacy Traffic URL/cache used 28d — treat as the month window.
  if (raw === "28d") return "30d"
  return "7d"
}

export function parseAnalyticsSource(raw: string | null): AnalyticsSource {
  if (raw === "vercel" || raw === "ga") return raw
  return "vercel"
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
    const proxyAttempted =
      typeof err === "object" &&
      err !== null &&
      "proxyAttempted" in err &&
      Boolean((err as { proxyAttempted?: unknown }).proxyAttempted)
    const timeoutHint: AnalyticsTimeoutHint = process.env.VERCEL
      ? "hosted"
      : proxyAttempted
        ? "proxy"
        : "direct"
    return new AnalyticsFetchError(
      "timeout",
      "Cannot reach Google Analytics Data API (network timeout)",
      timeoutHint
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

function resolveProxyUrl(): string | undefined {
  return (
    envTrim("HTTPS_PROXY") ||
    envTrim("https_proxy") ||
    envTrim("HTTP_PROXY") ||
    envTrim("http_proxy") ||
    envTrim("ALL_PROXY") ||
    envTrim("all_proxy")
  )
}

const NETWORK_ERROR_RE =
  /DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|ConnectTimeout|UND_ERR/i

/** Direct path: short connect so a blocked Google IP fails over quickly.
 *  autoSelectFamily prefers IPv4 when IPv6 is advertised but black-holed. */
const directAgent = new Agent({
  connectTimeout: 4_000,
  headersTimeout: 20_000,
  bodyTimeout: 30_000,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 300,
})

let cachedProxyAgent: ProxyAgent | undefined
let cachedProxyUrl: string | undefined

function getProxyDispatcher(): ProxyAgent | undefined {
  const proxyUrl = resolveProxyUrl()
  if (!proxyUrl) {
    cachedProxyAgent = undefined
    cachedProxyUrl = undefined
    return undefined
  }
  if (cachedProxyAgent && cachedProxyUrl === proxyUrl) return cachedProxyAgent
  try {
    cachedProxyUrl = proxyUrl
    cachedProxyAgent = new ProxyAgent({
      uri: proxyUrl,
      connectTimeout: 8_000,
      headersTimeout: 20_000,
      bodyTimeout: 30_000,
    })
    return cachedProxyAgent
  } catch {
    // Bad HTTPS_PROXY (invalid URL etc.) — keep the original network error
    // instead of masking it with ProxyAgent construction failure.
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
  return undiciFetch(input, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    dispatcher,
  }) as unknown as Response
}

function markProxyAttempted(err: unknown): never {
  if (typeof err === "object" && err !== null) {
    ;(err as { proxyAttempted?: boolean }).proxyAttempted = true
  }
  throw err
}

/**
 * If HTTPS_PROXY is set, try that proxy first, then fall back to
 * direct. Direct-only when no proxy is configured — never a baked-in
 * localhost port.
 */
async function gaFetch(
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  }
): Promise<Response> {
  const proxy = getProxyDispatcher()
  if (proxy) {
    try {
      return await gaFetchOnce(input, init, proxy)
    } catch (proxyErr) {
      console.warn(
        "[analytics] HTTPS_PROXY failed; retrying Google request directly"
      )
      try {
        return await gaFetchOnce(input, init, directAgent)
      } catch {
        cachedProxyAgent = undefined
        cachedProxyUrl = undefined
        markProxyAttempted(proxyErr)
      }
    }
  }

  return gaFetchOnce(input, init, directAgent)
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

  const res = await gaFetch(OAUTH_TOKEN_URL, {
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
 * Uses HTTPS_PROXY first when set (local VPN), then direct.
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
  const res = await gaFetch(
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
