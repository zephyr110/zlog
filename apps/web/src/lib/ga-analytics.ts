import { BetaAnalyticsDataClient } from "@google-analytics/data"

export type AnalyticsRange = "today" | "7d" | "28d"

export type AnalyticsReport = {
  configured: true
  range: AnalyticsRange
  totals: { activeUsers: number; screenPageViews: number }
  topPages: { path: string; views: number }[]
  sources: { source: string; users: number }[]
  devices: { device: string; users: number }[]
  countries: { country: string; users: number }[]
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

type CacheEntry = { expires: number; report: AnalyticsReport }

const reportCache = new Map<AnalyticsRange, CacheEntry>()

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

function getClient(): BetaAnalyticsDataClient {
  const clientEmail = process.env.GA_CLIENT_EMAIL!.trim()
  const privateKey = normalizePrivateKey(process.env.GA_PRIVATE_KEY!)
  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    // REST avoids gRPC "Waiting for LB pick" failures on restricted networks.
    fallback: "rest",
  })
}

function metricValue(
  row: { metricValues?: { value?: string | null }[] | null } | null | undefined,
  index: number
): number {
  const raw = row?.metricValues?.[index]?.value
  const n = Number(raw ?? 0)
  return Number.isFinite(n) ? n : 0
}

function dimValue(
  row: { dimensionValues?: { value?: string | null }[] | null } | null | undefined,
  index: number
): string {
  return row?.dimensionValues?.[index]?.value?.trim() || "(not set)"
}

function classifyGaError(err: unknown): AnalyticsFetchError {
  const message = err instanceof Error ? err.message : String(err)
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : ""

  if (
    /DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|network/i.test(
      `${code} ${message}`
    )
  ) {
    return new AnalyticsFetchError(
      "timeout",
      "Cannot reach Google Analytics Data API (network timeout)"
    )
  }
  if (
    code === "7" ||
    /PERMISSION_DENIED|does not have sufficient permissions|Caller does not have/i.test(
      `${code} ${message}`
    ) ||
    (/\b403\b/.test(`${code} ${message}`) &&
      /permission|denied|forbidden/i.test(message))
  ) {
    return new AnalyticsFetchError(
      "permission",
      "Service account lacks access to this GA4 property"
    )
  }
  return new AnalyticsFetchError("unavailable", message.slice(0, 200))
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
  const client = getClient()

  let batch: Awaited<ReturnType<typeof client.batchRunReports>>[0]
  try {
    ;[batch] = await client.batchRunReports({
      property,
      requests: [
        {
          dateRanges: [dateRange],
          metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
        },
        {
          dateRanges: [dateRange],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: 10,
        },
        {
          dateRanges: [dateRange],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
          limit: 10,
        },
        {
          dateRanges: [dateRange],
          dimensions: [{ name: "deviceCategory" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        },
        {
          dateRanges: [dateRange],
          dimensions: [{ name: "country" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
          limit: 10,
        },
      ],
    })
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
      users: metricValue(row, 0),
    })),
  }

  reportCache.set(range, { expires: Date.now() + CACHE_TTL_MS, report })
  return report
}
