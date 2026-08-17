/**
 * Client-safe analytics types and helpers.
 * Must not import node: / undici — admin Traffic UI imports this file.
 */

export type AnalyticsRange = "today" | "7d" | "30d" | "all" | "custom"

/** Which backend powers the admin Traffic panels. */
export type AnalyticsSource = "ga" | "vercel"

/** Inclusive date bounds as plain 'YYYY-MM-DD' (UTC). */
export type AnalyticsCustomRange = { start: string; end: string }

export type AnalyticsReport = {
  configured: true
  source: AnalyticsSource
  range: AnalyticsRange
  /** The actually covered window (preset windows, or the effective
   *  snapped window for all/custom — see monthSnapRange). */
  customRange: AnalyticsCustomRange
  /** Earliest archived month 'YYYY-MM', null when nothing archived yet.
   *  Drives the picker's lower bound + All time preset. */
  availableFrom: string | null
  /** Past months inside the requested range that have no archive
   *  (not yet backfilled). UI shows a note, data simply starts later. */
  missingMonths: string[]
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

export function parseAnalyticsRange(raw: string | null): AnalyticsRange {
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "all" || raw === "custom")
    return raw
  // Legacy Traffic URL/cache used 28d — treat as the month window.
  if (raw === "28d") return "30d"
  return "7d"
}

// ── Month / date helpers (pure, client-safe, UTC) ───────────────────────

/** 'YYYY-MM' of a Date (UTC). */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function currentMonthKey(): string {
  return monthKey(new Date())
}

/** monthKey ± delta months (UTC). */
export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return monthKey(t)
}

/** First day 'YYYY-MM-DD' of a month key. */
export function monthStartDay(key: string): string {
  return `${key}-01`
}

/** Last day 'YYYY-MM-DD' of a month key. */
export function monthEndDay(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`
}

/** 'YYYY-MM' of a 'YYYY-MM-DD' day. */
export function monthOfDay(day: string): string {
  return day.slice(0, 7)
}

/** Months from `from` to `to` inclusive, ascending. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k)
  return out
}

const DAY_MS = 86_400_000

/** Today as 'YYYY-MM-DD' (UTC). */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/** day ± n days → 'YYYY-MM-DD' (UTC). */
export function minusDays(day: string, n: number): string {
  return new Date(Date.parse(day) - n * DAY_MS).toISOString().slice(0, 10)
}

/** Inclusive day count in [a, b] (a <= b), e.g. same day → 1. */
export function daysBetween(a: string, b: string): number {
  return Math.floor((Date.parse(b) - Date.parse(a)) / DAY_MS) + 1
}

/** Effective (snapped) window for all/custom: past months come from the
 *  DB archive, the current month from the live source. Returns the merged
 *  coverage window (start = request start clamped to 1st of its month,
 *  end = month end of request end) plus which past months lack archives. */
export function monthSnapRange(
  range: AnalyticsRange,
  custom: AnalyticsCustomRange | null,
  archivedMonths: string[],
  fallback: AnalyticsCustomRange,
  knownEmpty: string[] = []
): {
  effective: AnalyticsCustomRange
  missingMonths: string[]
} {
  if (range === "custom" && !custom) {
    // 防御：range=custom 但缺 from/to（客户端半选等）→ 按默认窗口处理。
    return { effective: fallback, missingMonths: [] }
  }
  if (range === "all") {
    const first = archivedMonths[0]
    if (!first) {
      // 还没归档任何月份 — 来源的保留期窗口仍在，回退到 30 天窗口。
      return { effective: fallback, missingMonths: [] }
    }
    const missing = monthsBetween(first, addMonths(currentMonthKey(), -1)).filter(
      (m) => !archivedMonths.includes(m) && !knownEmpty.includes(m)
    )
    return {
      effective: { start: monthStartDay(first), end: todayKey() },
      missingMonths: missing,
    }
  }
  // custom: 过去月份 [fromMonth, toMonth] 读 DB 归档，当月走实时。
  const c = custom!
  const fromMonth = monthOfDay(c.start)
  const toMonth = monthOfDay(c.end)
  const lastArchivable = addMonths(currentMonthKey(), -1)
  const missing = monthsBetween(fromMonth, toMonth).filter(
    (m) => m <= lastArchivable && !archivedMonths.includes(m) && !knownEmpty.includes(m)
  )
  return {
    effective: { start: monthStartDay(fromMonth), end: c.end },
    missingMonths: missing,
  }
}

/** Merge ranked rows across months (DB) + live window: union by key,
 *  sum users/views, sort desc, cap. `sortBy` defaults to users —
 *  pass "views" for page lists which rank by page views. */
export function mergeRowLists<R extends { users: number; views: number }>(
  lists: R[][],
  keyOf: (r: R) => string,
  cap: number,
  sortBy: "users" | "views" = "users"
): R[] {
  const byKey = new Map<string, R>()
  for (const list of lists) {
    for (const r of list) {
      const k = keyOf(r)
      const prev = byKey.get(k)
      if (!prev) byKey.set(k, { ...r })
      else {
        prev.users += r.users
        prev.views += r.views
      }
    }
  }
  return [...byKey.values()]
    .sort((x, y) => y[sortBy] - x[sortBy])
    .slice(0, cap)
}

// ── Merged (DB months + live window) part shapes — shared by ga/vercel ──

export type AnalyticsDbRow = { itemKey: string; users: number; views: number }

export type AnalyticsMergedParts = {
  topPages: { path: string; views: number }[]
  sources: { source: string; users: number }[]
  devices: { device: string; users: number }[]
  browsers: { browser: string; users: number }[]
  operatingSystems: { os: string; users: number }[]
  countries: { country: string; countryId: string; users: number }[]
}

/** Countries are archived under an "id|name" composite key (GA emits
 *  localized names, Vercel only codes) — split it back at read time. */
function splitCountryKey(
  itemKey: string
): { countryId: string; country: string } {
  const i = itemKey.indexOf("|")
  return i >= 0
    ? { countryId: itemKey.slice(0, i), country: itemKey.slice(i + 1) }
    : { countryId: itemKey, country: itemKey }
}

/** DB monthly aggregates → report-part shapes (pure keyed mapping). */
export function dbAggToParts(
  dbAgg: Map<string, AnalyticsDbRow[]>
): AnalyticsMergedParts {
  const list = (dim: string) => dbAgg.get(dim) ?? []
  return {
    topPages: list("pages").map((r) => ({ path: r.itemKey, views: r.views })),
    sources: list("sources").map((r) => ({
      source: r.itemKey,
      users: r.users,
    })),
    devices: list("devices").map((r) => ({ device: r.itemKey, users: r.users })),
    browsers: list("browsers").map((r) => ({
      browser: r.itemKey,
      users: r.users,
    })),
    operatingSystems: list("operatingSystems").map((r) => ({
      os: r.itemKey,
      users: r.users,
    })),
    countries: list("countries").map((r) => ({
      ...splitCountryKey(r.itemKey),
      users: r.users,
    })),
  }
}

/** Union-merge DB parts with the live partial-month report, capped at the
 *  panel depth (10). Countries merge by countryId so folded entries from
 *  both sides collapse into one; the live name wins. */
export function mergeParts(
  db: AnalyticsMergedParts,
  live: AnalyticsReport | null
): AnalyticsMergedParts {
  return {
    topPages: mergeRowLists(
      [
        db.topPages.map((p) => ({ ...p, users: 0 })),
        (live?.topPages ?? []).map((p) => ({ ...p, users: 0 })),
      ],
      (p) => p.path,
      10,
      "views"
    ).map(({ path, views }) => ({ path, views })),
    sources: mergeRowLists(
      [
        db.sources.map((s) => ({ ...s, views: 0 })),
        (live?.sources ?? []).map((s) => ({ ...s, views: 0 })),
      ],
      (s) => s.source,
      10
    ).map(({ source, users }) => ({ source, users })),
    devices: mergeRowLists(
      [
        db.devices.map((d) => ({ ...d, views: 0 })),
        (live?.devices ?? []).map((d) => ({ ...d, views: 0 })),
      ],
      (d) => d.device,
      10
    ).map(({ device, users }) => ({ device, users })),
    browsers: mergeRowLists(
      [
        db.browsers.map((b) => ({ ...b, views: 0 })),
        (live?.browsers ?? []).map((b) => ({ ...b, views: 0 })),
      ],
      (b) => b.browser,
      10
    ).map(({ browser, users }) => ({ browser, users })),
    operatingSystems: mergeRowLists(
      [
        db.operatingSystems.map((o) => ({ ...o, views: 0 })),
        (live?.operatingSystems ?? []).map((o) => ({ ...o, views: 0 })),
      ],
      (o) => o.os,
      10
    ).map(({ os, users }) => ({ os, users })),
    countries: mergeRowLists(
      [
        db.countries.map((c) => ({ ...c, views: 0 })),
        (live?.countries ?? []).map((c) => ({ ...c, views: 0 })),
      ],
      (c) => c.countryId,
      10
    ).map(({ country, countryId, users }) => ({ country, countryId, users })),
  }
}

export function parseAnalyticsSource(raw: string | null): AnalyticsSource {
  if (raw === "vercel" || raw === "ga") return raw
  return "vercel"
}

/** Admin empty-state i18n keys for a traffic timeout. Hosted Vercel
 *  must not tell the user to fill desktop Settings. */
export function analyticsTimeoutI18nKeys(
  source: AnalyticsSource,
  hint?: AnalyticsTimeoutHint
) {
  if (source === "vercel") {
    return {
      titleKey: "admin.analyticsVercelTimeout",
      descKey:
        hint === "proxy"
          ? "admin.analyticsVercelTimeoutProxyDesc"
          : hint === "hosted"
            ? "admin.analyticsVercelTimeoutHostedDesc"
            : "admin.analyticsVercelTimeoutDesc",
    } as const
  }
  return {
    titleKey: "admin.analyticsTimeout",
    descKey:
      hint === "proxy"
        ? "admin.analyticsTimeoutProxyDesc"
        : hint === "hosted"
          ? "admin.analyticsTimeoutHostedDesc"
          : "admin.analyticsTimeoutDesc",
  } as const
}
