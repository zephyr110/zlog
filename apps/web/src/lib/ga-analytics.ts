import { createSign } from "node:crypto"
import {
  Agent,
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici"

export type AnalyticsRange = "today" | "7d" | "28d"

export type AnalyticsReport = {
  configured: true
  range: AnalyticsRange
  totals: { activeUsers: number; screenPageViews: number }
  topPages: { path: string; views: number }[]
  sources: { source: string; users: number }[]
  devices: { device: string; users: number }[]
  countries: { country: string; countryId: string; users: number }[]
}

export type AnalyticsFetchErrorKind = "timeout" | "permission" | "unavailable"

export class AnalyticsFetchError extends Error {
  kind: AnalyticsFetchErrorKind
  constructor(kind: AnalyticsFetchErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = "AnalyticsFetchError"
  }
}

const RANGES: Record<AnalyticsRange, { startDate: string; endDate: string }> = {
  today: { startDate: "today", endDate: "today" },
  "7d": { startDate: "7daysAgo", endDate: "today" },
  "28d": { startDate: "28daysAgo", endDate: "today" },
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
}

export function parseAnalyticsRange(raw: string | null): AnalyticsRange {
  if (raw === "today" || raw === "7d" || raw === "28d") return raw
  return "7d"
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

  if (
    /DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|network|fetch failed|ConnectTimeout|UND_ERR/i.test(
      blob
    )
  ) {
    return new AnalyticsFetchError(
      "timeout",
      "Cannot reach Google Analytics Data API (network timeout)"
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

/** Optional fallback proxy (Clash/V2Ray). Used only after a direct
 *  Google request fails — never forced on the first attempt. */
function resolveProxyUrl(): string | undefined {
  const raw =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy
  const url = raw?.trim()
  return url || undefined
}

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
  return /DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|network|fetch failed|ConnectTimeout|UND_ERR|ECONNREFUSED/i.test(
    `${code} ${message} ${cause}`
  )
}

/** Short connect budget so a blocked direct path fails over to the proxy
 *  quickly instead of hanging the admin dashboard. */
const directAgent = new Agent({
  connectTimeout: 4_000,
  headersTimeout: 12_000,
  bodyTimeout: 20_000,
})

let cachedProxyAgent: ProxyAgent | undefined
let cachedProxyUrl: string | undefined

/** After a direct→proxy failover, prefer the proxy briefly so OAuth +
 *  batchRunReports (and rapid range switches) don’t each burn another
 *  connectTimeout on a blocked direct path. */
let preferProxyUntil = 0
const PREFER_PROXY_MS = 60_000

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

/**
 * Prefer a direct path to Google. If that fails with a network error and
 * HTTPS_PROXY (etc.) is set, retry once through the proxy — typical local
 * VPN setup without forcing every request through Clash. After failover,
 * stick to the proxy briefly so token + report don’t double the wait.
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
  const preferProxy = Boolean(proxy && Date.now() < preferProxyUntil)

  if (preferProxy && proxy) {
    try {
      return await gaFetchOnce(input, init, proxy)
    } catch (proxyErr) {
      try {
        return await gaFetchOnce(input, init, directAgent)
      } catch {
        throw proxyErr
      }
    }
  }

  try {
    return await gaFetchOnce(input, init, directAgent)
  } catch (err) {
    if (!proxy || !isNetworkFailure(err)) throw err
    preferProxyUntil = Date.now() + PREFER_PROXY_MS
    console.warn(
      "[analytics] direct Google request failed; retrying via HTTPS_PROXY"
    )
    try {
      return await gaFetchOnce(input, init, proxy)
    } catch {
      // Surface the original direct failure (timeout) for admin copy.
      throw err
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

async function getAccessToken(): Promise<string> {
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
    throw Object.assign(new Error(text.slice(0, 500)), {
      code: String(res.status),
    })
  }
  const json = JSON.parse(text) as { access_token?: string }
  if (!json.access_token) {
    throw new AnalyticsFetchError("unavailable", "Failed to obtain Google access token")
  }
  return json.access_token
}

/**
 * Call GA4 Data API over plain HTTPS JSON.
 * Direct first; falls back to HTTPS_PROXY on network failure (local VPN).
 * Avoids `@google-analytics/data` REST fallback, which throws
 * `toProto3JSON: don't know how to convert value 10` for int64 `limit`
 * on Vercel’s Node runtime.
 */
async function batchRunReports(
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
    range,
    totals: {
      activeUsers: metricValue(totalsRow, 0),
      screenPageViews: metricValue(totalsRow, 1),
    },
    topPages: (reports[1]?.rows ?? []).map((row) => ({
      path: dimValue(row, 0),
      views: metricValue(row, 0),
    })),
    sources: (reports[2]?.rows ?? []).map((row) => ({
      source: dimValue(row, 0),
      users: metricValue(row, 0),
    })),
    devices: (reports[3]?.rows ?? []).map((row) => ({
      device: dimValue(row, 0),
      users: metricValue(row, 0),
    })),
    countries: (reports[4]?.rows ?? []).map((row) => ({
      country: dimValue(row, 0),
      countryId: dimValue(row, 1),
      users: metricValue(row, 0),
    })),
  }

  reportCache.set(range, { expires: Date.now() + CACHE_TTL_MS, report })
  return report
}
