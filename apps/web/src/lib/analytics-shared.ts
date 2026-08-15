/**
 * Client-safe analytics types and helpers.
 * Must not import node: / undici — admin Traffic UI imports this file.
 */

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
