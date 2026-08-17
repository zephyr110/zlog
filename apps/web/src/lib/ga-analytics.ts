import { createSign } from "node:crypto"
import {
  AnalyticsFetchError,
  addMonths,
  currentMonthKey,
  dbAggToParts,
  mergeParts,
  minusDays,
  monthEndDay,
  monthOfDay,
  monthSnapRange,
  monthStartDay,
  monthsBetween,
  todayKey,
  type AnalyticsCustomRange,
  type AnalyticsRange,
  type AnalyticsReport,
} from "@/lib/analytics-shared"
import { analyticsFetch, analyticsTimeoutHint, NETWORK_ERROR_RE } from "@/lib/analytics-proxy"
import { isPublicTrafficPath } from "@/lib/analytics-paths"
import { foldChinaRegions } from "@/lib/analytics-countries"
import {
  aggregateMonthlyAnalytics,
  listArchivedMonths,
  upsertMonthlyAnalytics,
  type AnalyticsDimensionRows,
} from "@zlog/database"

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
const PRESET_RANGES: Record<
  "today" | "7d" | "30d",
  { startDate: string; endDate: string }
> = {
  today: { startDate: "today", endDate: "today" },
  "7d": { startDate: "7daysAgo", endDate: "today" },
  "30d": { startDate: "30daysAgo", endDate: "today" },
}

/** GA4 standard-property retention floor: archived months can't go back
 *  further than 14 months. */
export const GA_RETENTION_MONTHS = 14

/** Per-month archive depth. Display caps at 10; 25 keeps top-10 merges
 *  stable across many months (an item ranked #11 every single month can
 *  still sum into the year's top-10). */
const GA_ARCHIVE_LIMIT = "25"

/** Inline backfill cap per request — first paint stays fast; the rest is
 *  filled by the desktop boot trigger and subsequent visits. */
const MAX_ARCHIVE_MONTHS_PER_CALL = 3

const CACHE_TTL_MS = 10 * 60 * 1000
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"

type CacheEntry = { expires: number; report: AnalyticsReport }

const reportCache = new Map<string, CacheEntry>()

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
  // 幂等：嵌套调用（如 batchRunReportsOnce 内嵌 token 交换）不重复分类。
  if (err instanceof AnalyticsFetchError) return err
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
  try {
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
  } catch (err) {
    // 网络/凭据/权限错误统一分类（route 依赖 kind + timeoutHint）。
    throw classifyGaError(err)
  }
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

/** Build the 7 panel requests for an arbitrary date window. `limit`
 *  controls per-dimension depth (10 for live display, 25 for archives). */
function buildRequests(
  dateRange: { startDate: string; endDate: string },
  limit: string
): RunReportRequest[] {
  return [
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
      limit,
    },
    {
      dateRanges: [dateRange],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit,
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
      limit,
    },
    {
      dateRanges: [dateRange],
      dimensions: [{ name: "operatingSystem" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit,
    },
    {
      dateRanges: [dateRange],
      dimensions: [{ name: "country" }, { name: "countryId" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit,
    },
  ]
}

/** Store-ready rows per dimension: same transforms as the live mapper
 *  (public paths only, folded China regions) so the read-side merge is a
 *  pure keyed sum. Countries use an "id|name" composite key — GA emits
 *  localized names, Vercel only codes, and both must survive the roundtrip. */
function batchToDimensionRows(
  batch: BatchRunReportsResponse
): AnalyticsDimensionRows[] {
  const reports = batch.reports ?? []
  const totalsRow = reports[0]?.rows?.[0]
  return [
    {
      dimension: "totals",
      rows: [
        {
          itemKey: "total",
          users: metricValue(totalsRow, 0),
          views: metricValue(totalsRow, 1),
        },
      ],
    },
    {
      dimension: "pages",
      rows: (reports[1]?.rows ?? [])
        .filter((row) => isPublicTrafficPath(dimValue(row, 0)))
        .map((row) => ({
          itemKey: dimValue(row, 0),
          users: 0,
          views: metricValue(row, 0),
        })),
    },
    {
      dimension: "sources",
      rows: (reports[2]?.rows ?? []).map((row) => ({
        itemKey: dimValue(row, 0),
        users: metricValue(row, 0),
        views: 0,
      })),
    },
    {
      dimension: "devices",
      rows: (reports[3]?.rows ?? []).map((row) => ({
        itemKey: dimValue(row, 0),
        users: metricValue(row, 0),
        views: 0,
      })),
    },
    {
      dimension: "browsers",
      rows: (reports[4]?.rows ?? []).map((row) => ({
        itemKey: dimValue(row, 0),
        users: metricValue(row, 0),
        views: 0,
      })),
    },
    {
      dimension: "operatingSystems",
      rows: (reports[5]?.rows ?? []).map((row) => ({
        itemKey: dimValue(row, 0),
        users: metricValue(row, 0),
        views: 0,
      })),
    },
    {
      dimension: "countries",
      rows: foldChinaRegions(
        (reports[6]?.rows ?? []).map((row) => ({
          country: dimValue(row, 0),
          countryId: dimValue(row, 1),
          users: metricValue(row, 0),
        }))
      ).map((c) => ({
        itemKey: `${c.countryId}|${c.country}`,
        users: c.users,
        views: 0,
      })),
    },
  ]
}

/** Map a live batch into the report shape for a single window. */
function batchToLiveReport(
  batch: BatchRunReportsResponse,
  range: AnalyticsRange,
  customRange: AnalyticsCustomRange,
  availableFrom: string | null,
  missingMonths: string[]
): AnalyticsReport {
  const reports = batch.reports ?? []
  const totalsRow = reports[0]?.rows?.[0]
  return {
    configured: true,
    source: "ga",
    range,
    customRange,
    availableFrom,
    missingMonths,
    totals: {
      activeUsers: metricValue(totalsRow, 0),
      screenPageViews: metricValue(totalsRow, 1),
    },
    topPages: (reports[1]?.rows ?? [])
      .map((row) => ({ path: dimValue(row, 0), views: metricValue(row, 0) }))
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
}

/** Months probed with zero users — GA4 returns nothing for them, and a
 *  re-probe on every cold start would waste 3 API calls per quiet month.
 *  In-process only: a lost memo just means one extra empty probe. */
const emptyMonths = new Set<string>()

/** "All time" before anything is archived — fall back to the same live
 *  30-day window the dashboard already had. */
const FALLBACK_WINDOW: AnalyticsCustomRange = {
  start: minusDays(todayKey(), 29),
  end: todayKey(),
}

/** Archive missing GA4 months (oldest first, capped per call). Returns how
 *  many months were written. Idempotent — safe to call on every request. */
export async function ensureGaArchives(): Promise<number> {
  const archived = new Set(await listArchivedMonths("ga"))
  const floor = addMonths(currentMonthKey(), -GA_RETENTION_MONTHS)
  const last = addMonths(currentMonthKey(), -1)
  const missing = monthsBetween(floor, last).filter(
    (m) => !archived.has(m) && !emptyMonths.has(m)
  )
  if (missing.length === 0) return 0
  const property = `properties/${process.env.GA_PROPERTY_ID!.trim()}`
  let done = 0
  for (const month of missing.slice(0, MAX_ARCHIVE_MONTHS_PER_CALL)) {
    const batch = await batchRunReports(
      property,
      buildRequests(
        { startDate: monthStartDay(month), endDate: monthEndDay(month) },
        GA_ARCHIVE_LIMIT
      )
    )
    const dims = batchToDimensionRows(batch)
    const total = dims[0]?.rows[0]
    if (!total || (total.users === 0 && total.views === 0)) {
      emptyMonths.add(month)
      continue
    }
    await upsertMonthlyAnalytics("ga", month, dims)
    done++
  }
  return done
}

/** Earliest date the picker should allow: the first archived month, or the
 *  GA4 retention floor when nothing is archived yet. */
async function gaAvailableFrom(): Promise<string | null> {
  const archived = await listArchivedMonths("ga")
  return (
    archived[0] ??
    monthStartDay(addMonths(currentMonthKey(), -GA_RETENTION_MONTHS))
  )
}

/** Deduped totals for an arbitrary window inside GA retention — activeUsers
 *  is not additive across months, so monthly sums would double count
 *  repeat visitors. GA4 dedupes natively over the full window. */
async function fetchTotalsWindow(dateRange: {
  startDate: string
  endDate: string
}): Promise<{ activeUsers: number; screenPageViews: number }> {
  const property = `properties/${process.env.GA_PROPERTY_ID!.trim()}`
  const batch = await batchRunReports(property, [
    {
      dateRanges: [dateRange],
      metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
    },
  ])
  const row = batch.reports?.[0]?.rows?.[0]
  return {
    activeUsers: metricValue(row, 0),
    screenPageViews: metricValue(row, 1),
  }
}

/** Fetch GA4 report for a range (cached ~10 minutes). all/custom merge the
 *  archived monthly DB rows with a live fetch of the current month. */
export async function fetchAnalyticsReport(
  range: AnalyticsRange,
  custom: AnalyticsCustomRange | null = null
): Promise<AnalyticsReport> {
  if (range === "all" || range === "custom") {
    return fetchMergedReport(range, custom)
  }
  return fetchPresetReport(range)
}

async function fetchPresetReport(
  range: "today" | "7d" | "30d"
): Promise<AnalyticsReport> {
  const hit = reportCache.get(range)
  if (hit && hit.expires > Date.now()) return hit.report

  const property = `properties/${process.env.GA_PROPERTY_ID!.trim()}`
  const batch = await batchRunReports(property, buildRequests(PRESET_RANGES[range], "10"))
  const now = todayKey()
  const start =
    range === "today" ? now : range === "7d" ? minusDays(now, 6) : minusDays(now, 29)
  const report = batchToLiveReport(
    batch,
    range,
    { start, end: now },
    await gaAvailableFrom(),
    []
  )
  reportCache.set(range, { expires: Date.now() + CACHE_TTL_MS, report })
  return report
}

async function fetchMergedReport(
  range: "all" | "custom",
  custom: AnalyticsCustomRange | null
): Promise<AnalyticsReport> {
  // 先回填缺失归档（最多 3 个月/次），再基于最新归档列表算覆盖区间 —
  // 首次请求也能尽量多出数据，剩余月份在下次请求/后台触发器里补齐。
  await ensureGaArchives()

  const archived = await listArchivedMonths("ga")
  const { effective, missingMonths } = monthSnapRange(
    range,
    custom,
    archived,
    FALLBACK_WINDOW,
    [...emptyMonths]
  )

  const cacheKey =
    range === "custom" ? `custom:${effective.start}:${effective.end}` : "all"
  const hit = reportCache.get(cacheKey)
  if (hit && hit.expires > Date.now()) return hit.report

  const current = currentMonthKey()
  const availableFrom = await gaAvailableFrom()
  const dbFrom = monthOfDay(effective.start)
  const dbTo = addMonths(current, -1)
  const dbAgg =
    dbFrom <= dbTo
      ? await aggregateMonthlyAnalytics("ga", dbFrom, dbTo)
      : new Map<string, { itemKey: string; users: number; views: number }[]>()

  // 当月数据永远是实时的（归档只写完整的历史月）。
  let live: AnalyticsReport | null = null
  if (monthOfDay(effective.end) === current) {
    const liveStart =
      effective.start < monthStartDay(current)
        ? monthStartDay(current)
        : effective.start
    const property = `properties/${process.env.GA_PROPERTY_ID!.trim()}`
    const batch = await batchRunReports(
      property,
      buildRequests({ startDate: liveStart, endDate: effective.end }, "10")
    )
    live = batchToLiveReport(batch, range, effective, availableFrom, missingMonths)
  }

  // Totals 走全区间去重查询（仅当窗口落在 14 个月保留期内）；
  // 更早的历史窗口退化为月度求和（近似，注释见 fetchTotalsWindow）。
  const floor = addMonths(currentMonthKey(), -GA_RETENTION_MONTHS)
  const totals =
    effective.start >= monthStartDay(floor)
      ? await fetchTotalsWindow({ startDate: effective.start, endDate: effective.end })
      : {
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
    source: "ga",
    range,
    customRange: effective,
    availableFrom,
    missingMonths,
    totals,
  }

  reportCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, report })
  return report
}
