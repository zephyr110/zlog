import {
  AnalyticsFetchError,
  type AnalyticsRange,
  type AnalyticsReport,
} from "@/lib/ga-analytics"
import { isPublicTrafficPath } from "@/lib/analytics-paths"

const CACHE_TTL_MS = 10 * 60 * 1000
const VISITS_COUNT = "https://api.vercel.com/v1/query/web-analytics/visits/count"
const VISITS_AGG =
  "https://api.vercel.com/v1/query/web-analytics/visits/aggregate"

type CacheEntry = { expires: number; report: AnalyticsReport }
const reportCache = new Map<AnalyticsRange, CacheEntry>()

type CountResponse = {
  data?: { pageviews?: number; visitors?: number }
}

type AggregateRow = {
  pageviews?: number
  visitors?: number
  requestPath?: string | null
  referrerHostname?: string | null
  deviceType?: string | null
  browserName?: string | null
  osName?: string | null
  country?: string | null
}

type AggregateResponse = {
  data?: AggregateRow[]
}

export function isVercelAnalyticsConfigured(): boolean {
  return Boolean(
    process.env.VERCEL_API_TOKEN?.trim() &&
      process.env.VERCEL_ANALYTICS_PROJECT_ID?.trim()
  )
}

function rangeWindow(range: AnalyticsRange): { since: string; until: string } {
  const until = new Date()
  const since = new Date(until)
  if (range === "today") {
    since.setUTCHours(0, 0, 0, 0)
  } else if (range === "7d") {
    since.setUTCDate(since.getUTCDate() - 6)
    since.setUTCHours(0, 0, 0, 0)
  } else {
    since.setUTCDate(since.getUTCDate() - 29)
    since.setUTCHours(0, 0, 0, 0)
  }
  return { since: since.toISOString(), until: until.toISOString() }
}

function classifyVercelError(err: unknown): AnalyticsFetchError {
  const message = err instanceof Error ? err.message : String(err)
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : ""
  const blob = `${code} ${message}`

  if (
    /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|fetch failed|AbortError|Timeout/i.test(
      blob
    )
  ) {
    return new AnalyticsFetchError(
      "timeout",
      "Cannot reach Vercel Analytics API (network timeout)"
    )
  }
  if (code === "401" || code === "403" || /unauthorized|forbidden|permission/i.test(blob)) {
    return new AnalyticsFetchError(
      "permission",
      "Vercel API token lacks access to this project’s Web Analytics"
    )
  }
  return new AnalyticsFetchError("unavailable", message.slice(0, 200))
}

async function vercelGet(
  url: string,
  params: Record<string, string>
): Promise<Response> {
  const token = process.env.VERCEL_API_TOKEN!.trim()
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID!.trim()
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID?.trim()

  const qs = new URLSearchParams({ projectId, ...params })
  if (teamId) qs.set("teamId", teamId)

  const res = await fetch(`${url}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw Object.assign(new Error(text.slice(0, 500) || res.statusText), {
      code: String(res.status),
    })
  }
  return res
}

function num(n: unknown): number {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? v : 0
}

/** Empty / null referrer → GA-compatible "Direct" so the Sources donut i18n matches. */
function referrerLabel(host: string | null | undefined): string {
  const h = host?.trim()
  if (!h || h === "Others" || h === "null" || h === "undefined") return "Direct"
  return h
}

function countryCode(raw: string | null | undefined): string {
  const c = raw?.trim().toUpperCase()
  if (!c || c === "OTHERS" || c.length !== 2) return "(not set)"
  return c
}

/**
 * Fetch Vercel Web Analytics for a range and map into the same shape as
 * the GA4 Traffic report (cached ~10 minutes).
 */
export async function fetchVercelAnalyticsReport(
  range: AnalyticsRange
): Promise<AnalyticsReport> {
  const hit = reportCache.get(range)
  if (hit && hit.expires > Date.now()) return hit.report

  const { since, until } = rangeWindow(range)

  try {
    const [
      totalsRes,
      pagesRes,
      refsRes,
      devicesRes,
      browsersRes,
      osRes,
      countriesRes,
    ] = await Promise.all([
        vercelGet(VISITS_COUNT, { since, until }),
        vercelGet(VISITS_AGG, {
          since,
          until,
          by: "requestPath",
          limit: "25",
          // Owner-only /admin and /admin/* — keep Top pages visitor-facing
          // without dropping public paths like /administration.
          filter:
            "not (requestPath eq '/admin' or startswith(requestPath,'/admin/'))",
        }),
        vercelGet(VISITS_AGG, {
          since,
          until,
          by: "referrerHostname",
          limit: "10",
        }),
        vercelGet(VISITS_AGG, {
          since,
          until,
          by: "deviceType",
          limit: "10",
        }),
        vercelGet(VISITS_AGG, {
          since,
          until,
          by: "browserName",
          limit: "10",
        }),
        vercelGet(VISITS_AGG, {
          since,
          until,
          by: "osName",
          limit: "10",
        }),
        vercelGet(VISITS_AGG, {
          since,
          until,
          by: "country",
          limit: "10",
        }),
      ])

    const totals = (await totalsRes.json()) as CountResponse
    const pages = (await pagesRes.json()) as AggregateResponse
    const refs = (await refsRes.json()) as AggregateResponse
    const devices = (await devicesRes.json()) as AggregateResponse
    const browsers = (await browsersRes.json()) as AggregateResponse
    const operatingSystems = (await osRes.json()) as AggregateResponse
    const countries = (await countriesRes.json()) as AggregateResponse

    const report: AnalyticsReport = {
      configured: true,
      source: "vercel",
      range,
      totals: {
        activeUsers: num(totals.data?.visitors),
        screenPageViews: num(totals.data?.pageviews),
      },
      topPages: (pages.data ?? [])
        .filter((r) => r.requestPath && isPublicTrafficPath(r.requestPath))
        .map((r) => ({
          path: r.requestPath!,
          views: num(r.pageviews),
        }))
        .slice(0, 10),
      sources: (refs.data ?? [])
        .filter((r) => r.referrerHostname !== "Others")
        .map((r) => ({
          source: referrerLabel(r.referrerHostname),
          users: num(r.visitors),
        })),
      devices: (devices.data ?? [])
        .filter((r) => r.deviceType && r.deviceType !== "Others")
        .map((r) => ({
          device: r.deviceType!,
          users: num(r.visitors),
        })),
      browsers: (browsers.data ?? [])
        .filter((r) => r.browserName && r.browserName !== "Others")
        .map((r) => ({
          browser: r.browserName!,
          users: num(r.visitors),
        })),
      operatingSystems: (operatingSystems.data ?? [])
        .filter((r) => r.osName && r.osName !== "Others")
        .map((r) => ({
          os: r.osName!,
          users: num(r.visitors),
        })),
      countries: (countries.data ?? [])
        .filter((r) => r.country && r.country !== "Others")
        .map((r) => {
          const id = countryCode(r.country)
          return {
            country: id,
            countryId: id,
            users: num(r.visitors),
          }
        }),
    }

    reportCache.set(range, { expires: Date.now() + CACHE_TTL_MS, report })
    return report
  } catch (err) {
    throw classifyVercelError(err)
  }
}
