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

function getClient(): BetaAnalyticsDataClient {
  const clientEmail = process.env.GA_CLIENT_EMAIL!.trim()
  const privateKey = process.env.GA_PRIVATE_KEY!.replace(/\\n/g, "\n")
  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
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

  const [batch] = await client.batchRunReports({
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
