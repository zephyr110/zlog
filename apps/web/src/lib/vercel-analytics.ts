import {
  AnalyticsFetchError,
  addMonths,
  currentMonthKey,
  dbAggToParts,
  daysBetween,
  mergeParts,
  minusDays,
  monthEndDay,
  monthOfDay,
  monthSnapRange,
  monthStartDay,
  todayKey,
  type AnalyticsCustomRange,
  type AnalyticsRange,
  type AnalyticsReport,
} from "@/lib/analytics-shared"
import { analyticsFetch, analyticsTimeoutHint } from "@/lib/analytics-proxy"
import { foldChinaRegions } from "@/lib/analytics-countries"
import { isPublicTrafficPath } from "@/lib/analytics-paths"
import {
  aggregateMonthlyAnalytics,
  listArchivedMonths,
  upsertMonthlyAnalytics,
  type AnalyticsDimensionRows,
} from "@zlog/database"

const CACHE_TTL_MS = 10 * 60 * 1000
const VISITS_COUNT = "https://api.vercel.com/v1/query/web-analytics/visits/count"
const VISITS_AGG =
  "https://api.vercel.com/v1/query/web-analytics/visits/aggregate"

/** Vercel Hobby retention is a 30-day rolling window — a calendar month is
 *  never fully fetchable. We archive the last complete month within a short
 *  grace window after rollover and store whatever retention still has
 *  (the month head, ~2-3 days, is already gone by then). */
export const VERCEL_ARCHIVE_GRACE_DAYS = 3

type CacheEntry = { expires: number; report: AnalyticsReport }
const reportCache = new Map<string, CacheEntry>()

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

function rangeWindow(
  range: "today" | "7d" | "30d"
): { since: string; until: string } {
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

/** 'YYYY-MM-DD' day → Vercel API ISO instants (whole day, UTC). */
function dayWindow(day: string): { since: string; until: string } {
  return { since: `${day}T00:00:00.000Z`, until: `${day}T23:59:59.999Z` }
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b
}

function classifyVercelError(err: unknown): AnalyticsFetchError {
  // 幂等：嵌套调用不重复分类。
  if (err instanceof AnalyticsFetchError) return err
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
      "Cannot reach Vercel Analytics API (network timeout)",
      analyticsTimeoutHint(err)
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
  try {
    const token = process.env.VERCEL_API_TOKEN!.trim()
    const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID!.trim()
    const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID?.trim()

    const qs = new URLSearchParams({ projectId, ...params })
    if (teamId) qs.set("teamId", teamId)

    const res = await analyticsFetch(`${url}?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw Object.assign(new Error(text.slice(0, 500) || res.statusText), {
        code: String(res.status),
      })
    }
    return res
  } catch (err) {
    // 网络/凭据错误统一分类（route 依赖 kind + timeoutHint）。
    throw classifyVercelError(err)
  }
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

type VercelDimensions = {
  totals: { visitors: number; pageviews: number }
  pages: AggregateRow[]
  refs: AggregateRow[]
  devices: AggregateRow[]
  browsers: AggregateRow[]
  os: AggregateRow[]
  countries: AggregateRow[]
}

/** The 7 parallel panel queries for an arbitrary window. */
async function fetchVercelDimensions(
  since: string,
  until: string,
  limit: string
): Promise<VercelDimensions> {
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
      limit,
      // Owner-only /admin and /admin/* — keep Top pages visitor-facing
      // without dropping public paths like /administration.
      filter:
        "not (requestPath eq '/admin' or startswith(requestPath,'/admin/'))",
    }),
    vercelGet(VISITS_AGG, {
      since,
      until,
      by: "referrerHostname",
      limit,
    }),
    vercelGet(VISITS_AGG, {
      since,
      until,
      by: "deviceType",
      limit,
    }),
    vercelGet(VISITS_AGG, {
      since,
      until,
      by: "browserName",
      limit,
    }),
    vercelGet(VISITS_AGG, {
      since,
      until,
      by: "osName",
      limit,
    }),
    vercelGet(VISITS_AGG, {
      since,
      until,
      by: "country",
      limit,
    }),
  ])

  const totals = (await totalsRes.json()) as CountResponse
  const pages = (await pagesRes.json()) as AggregateResponse
  const refs = (await refsRes.json()) as AggregateResponse
  const devices = (await devicesRes.json()) as AggregateResponse
  const browsers = (await browsersRes.json()) as AggregateResponse
  const os = (await osRes.json()) as AggregateResponse
  const countries = (await countriesRes.json()) as AggregateResponse

  return {
    totals: {
      visitors: num(totals.data?.visitors),
      pageviews: num(totals.data?.pageviews),
    },
    pages: pages.data ?? [],
    refs: refs.data ?? [],
    devices: devices.data ?? [],
    browsers: browsers.data ?? [],
    os: os.data ?? [],
    countries: countries.data ?? [],
  }
}

/** Store-ready rows per dimension — same transforms as the live mapper
 *  (public paths only, "Others" dropped, folded China regions, composite
 *  "id|name" country key) so the read-side merge is a pure keyed sum. */
function dimensionsToRows(d: VercelDimensions): AnalyticsDimensionRows[] {
  return [
    {
      dimension: "totals",
      rows: [
        { itemKey: "total", users: d.totals.visitors, views: d.totals.pageviews },
      ],
    },
    {
      dimension: "pages",
      rows: d.pages
        .filter((r) => r.requestPath && isPublicTrafficPath(r.requestPath))
        .map((r) => ({
          itemKey: r.requestPath!,
          users: 0,
          views: num(r.pageviews),
        })),
    },
    {
      dimension: "sources",
      rows: d.refs
        .filter((r) => r.referrerHostname !== "Others")
        .map((r) => ({
          itemKey: referrerLabel(r.referrerHostname),
          users: num(r.visitors),
          views: 0,
        })),
    },
    {
      dimension: "devices",
      rows: d.devices
        .filter((r) => r.deviceType && r.deviceType !== "Others")
        .map((r) => ({ itemKey: r.deviceType!, users: num(r.visitors), views: 0 })),
    },
    {
      dimension: "browsers",
      rows: d.browsers
        .filter((r) => r.browserName && r.browserName !== "Others")
        .map((r) => ({ itemKey: r.browserName!, users: num(r.visitors), views: 0 })),
    },
    {
      dimension: "operatingSystems",
      rows: d.os
        .filter((r) => r.osName && r.osName !== "Others")
        .map((r) => ({ itemKey: r.osName!, users: num(r.visitors), views: 0 })),
    },
    {
      dimension: "countries",
      rows: foldChinaRegions(
        d.countries
          .filter((r) => r.country && r.country !== "Others")
          .map((r) => {
            const id = countryCode(r.country)
            return { country: id, countryId: id, users: num(r.visitors) }
          })
      ).map((c) => ({ itemKey: `${c.countryId}|${c.country}`, users: c.users, views: 0 })),
    },
  ]
}

/** Map a live window into the report shape. */
function liveToReport(
  d: VercelDimensions,
  range: AnalyticsRange,
  customRange: AnalyticsCustomRange,
  availableFrom: string | null,
  missingMonths: string[]
): AnalyticsReport {
  return {
    configured: true,
    source: "vercel",
    range,
    customRange,
    availableFrom,
    missingMonths,
    totals: {
      activeUsers: d.totals.visitors,
      screenPageViews: d.totals.pageviews,
    },
    topPages: d.pages
      .filter((r) => r.requestPath && isPublicTrafficPath(r.requestPath))
      .map((r) => ({ path: r.requestPath!, views: num(r.pageviews) }))
      .slice(0, 10),
    sources: d.refs
      .filter((r) => r.referrerHostname !== "Others")
      .map((r) => ({ source: referrerLabel(r.referrerHostname), users: num(r.visitors) })),
    devices: d.devices
      .filter((r) => r.deviceType && r.deviceType !== "Others")
      .map((r) => ({ device: r.deviceType!, users: num(r.visitors) })),
    browsers: d.browsers
      .filter((r) => r.browserName && r.browserName !== "Others")
      .map((r) => ({ browser: r.browserName!, users: num(r.visitors) })),
    operatingSystems: d.os
      .filter((r) => r.osName && r.osName !== "Others")
      .map((r) => ({ os: r.osName!, users: num(r.visitors) })),
    countries: foldChinaRegions(
      d.countries
        .filter((r) => r.country && r.country !== "Others")
        .map((r) => {
          const id = countryCode(r.country)
          return { country: id, countryId: id, users: num(r.visitors) }
        })
    ),
  }
}

/** Archive the last complete month while it's still inside the 30-day
 *  retention window (3-day grace after month rollover). Vercel never keeps
 *  a full calendar month, so we store whatever retention still has.
 *  Returns 1 when a month was written. Idempotent. */
export async function ensureVercelArchives(): Promise<number> {
  const last = addMonths(currentMonthKey(), -1)
  if (daysBetween(monthEndDay(last), todayKey()) > VERCEL_ARCHIVE_GRACE_DAYS) {
    return 0
  }
  const archived = new Set(await listArchivedMonths("vercel"))
  if (archived.has(last)) return 0
  // 保留期墙：只取 still 在 30 天滚动窗口内的那部分（月末头几天已流失）。
  const start = maxDate(monthStartDay(last), minusDays(todayKey(), 29))
  const end = minDate(monthEndDay(last), todayKey())
  const w = dayWindow(start)
  const u = dayWindow(end)
  const d = await fetchVercelDimensions(w.since, u.until, "25")
  await upsertMonthlyAnalytics("vercel", last, dimensionsToRows(d))
  return 1
}

/** Earliest date the picker should allow: the first archived month, or
 *  nothing yet (Vercel has no fixed floor — a fresh install simply has
 *  no history to offer). */
async function vercelAvailableFrom(): Promise<string | null> {
  const archived = await listArchivedMonths("vercel")
  return archived[0] ?? null
}

/** "All time" before anything is archived — the live 30-day window. */
const FALLBACK_WINDOW: AnalyticsCustomRange = {
  start: minusDays(todayKey(), 29),
  end: todayKey(),
}

/**
 * Fetch Vercel Web Analytics for a range and map into the same shape as
 * the GA4 Traffic report (cached ~10 minutes). all/custom merge the
 * archived monthly rows with a live fetch of the current month.
 */
export async function fetchVercelAnalyticsReport(
  range: AnalyticsRange,
  custom: AnalyticsCustomRange | null = null
): Promise<AnalyticsReport> {
  if (range === "all" || range === "custom") {
    return fetchVercelMergedReport(range, custom)
  }

  const hit = reportCache.get(range)
  if (hit && hit.expires > Date.now()) return hit.report

  const { since, until } = rangeWindow(range)
  const now = todayKey()
  const start =
    range === "today" ? now : range === "7d" ? minusDays(now, 6) : minusDays(now, 29)
  const d = await fetchVercelDimensions(since, until, "10")
  const report = liveToReport(
    d,
    range,
    { start, end: now },
    await vercelAvailableFrom(),
    []
  )
  reportCache.set(range, { expires: Date.now() + CACHE_TTL_MS, report })
  return report
}

async function fetchVercelMergedReport(
  range: "all" | "custom",
  custom: AnalyticsCustomRange | null
): Promise<AnalyticsReport> {
  // 先归档本月结束后的保留期窗口，再基于最新归档列表算覆盖区间。
  await ensureVercelArchives()

  const archived = await listArchivedMonths("vercel")
  const { effective, missingMonths } = monthSnapRange(
    range,
    custom,
    archived,
    FALLBACK_WINDOW,
    []
  )

  const cacheKey =
    range === "custom" ? `custom:${effective.start}:${effective.end}` : "all"
  const hit = reportCache.get(cacheKey)
  if (hit && hit.expires > Date.now()) return hit.report

  const current = currentMonthKey()
  const availableFrom = await vercelAvailableFrom()
  const dbFrom = monthOfDay(effective.start)
  const dbTo = addMonths(current, -1)
  const dbAgg =
    dbFrom <= dbTo
      ? await aggregateMonthlyAnalytics("vercel", dbFrom, dbTo)
      : new Map<string, { itemKey: string; users: number; views: number }[]>()

  // 当月数据永远是实时的；Vercel 30 天滚动窗口天然覆盖当月。
  let live: AnalyticsReport | null = null
  if (monthOfDay(effective.end) === current) {
    const liveStart =
      effective.start < monthStartDay(current)
        ? monthStartDay(current)
        : effective.start
    const w = dayWindow(liveStart)
    const u = dayWindow(effective.end)
    const d = await fetchVercelDimensions(w.since, u.until, "10")
    live = liveToReport(d, range, effective, availableFrom, missingMonths)
  }

  // Vercel 无法跨月去重（保留期墙），totals 用月度求和近似 ——
  // 月度口径会重复计数跨月回头客，注释在此以明示。
  const totals = {
    activeUsers:
      (dbAgg.get("totals") ?? []).reduce((s, r) => s + r.users, 0) +
      (live?.totals.activeUsers ?? 0),
    screenPageViews:
      (dbAgg.get("totals") ?? []).reduce((s, r) => s + r.views, 0) +
      (live?.totals.screenPageViews ?? 0),
  }

  const report: AnalyticsReport = {
    ...mergeParts(dbAggToParts(dbAgg), live),
    configured: true,
    source: "vercel",
    range,
    customRange: effective,
    availableFrom,
    missingMonths,
    totals,
  }

  reportCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, report })
  return report
}
