import {
  daysBetween,
  minusDays,
  todayKey,
  type AnalyticsCustomRange,
  type AnalyticsRange,
  type AnalyticsReport,
} from "./analytics-shared"

/**
 * 演示环境的 mock 分析数据：让访客在后台 Traffic 面板看到完整功能
 * （Vercel / GA4 两个来源都可用）。数值按 range 缩放，形状与真实报告
 * 完全一致（admin Traffic 组件直接渲染）。
 * 仅服务端 import（analytics route）。
 */
export function mockAnalyticsReport(
  source: "ga" | "vercel",
  range: AnalyticsRange,
  custom: AnalyticsCustomRange | null = null
): AnalyticsReport {
  // 日化量随窗口递减（today 单日基准，7d/30d 日均略降），避免
  // today 看起来比 30d 日均还高的失真。
  const daily = range === "today" ? 38 : range === "7d" ? 32 : 26
  const now = todayKey()
  const presetDays = range === "today" ? 1 : range === "7d" ? 7 : 30
  const effective =
    range === "all" || range === "custom"
      ? custom ?? { start: minusDays(now, 29), end: now }
      : { start: minusDays(now, presetDays - 1), end: now }
  // all/custom 按实际窗口天数缩放（mock 没有归档，日期即覆盖范围）。
  const days =
    range === "all" || range === "custom"
      ? daysBetween(effective.start, effective.end)
      : presetDays
  const users = Math.round(daily * days)
  const views = Math.round(daily * 3.4 * days)
  return {
    configured: true,
    source,
    range,
    customRange: effective,
    availableFrom: null,
    missingMonths: [],
    totals: { activeUsers: users, screenPageViews: views },
    topPages: [
      { path: "/", views: Math.round(views * 0.34) },
      { path: "/posts/zlog-deployment-guide", views: Math.round(views * 0.21) },
      { path: "/posts/zlog-deployment-guide-en", views: Math.round(views * 0.12) },
      { path: "/about", views: Math.round(views * 0.09) },
      { path: "/archive", views: Math.round(views * 0.07) },
      { path: "/timeline", views: Math.round(views * 0.05) },
    ],
    sources: [
      { source: "Direct", users: Math.round(users * 0.38) },
      { source: "Google", users: Math.round(users * 0.31) },
      { source: "GitHub", users: Math.round(users * 0.12) },
      { source: "Bing", users: Math.round(users * 0.08) },
      { source: "Twitter / X", users: Math.round(users * 0.06) },
    ],
    devices: [
      { device: "desktop", users: Math.round(users * 0.57) },
      { device: "mobile", users: Math.round(users * 0.36) },
      { device: "tablet", users: Math.round(users * 0.07) },
    ],
    browsers: [
      { browser: "Chrome", users: Math.round(users * 0.48) },
      { browser: "Safari", users: Math.round(users * 0.27) },
      { browser: "Edge", users: Math.round(users * 0.13) },
      { browser: "Firefox", users: Math.round(users * 0.08) },
    ],
    operatingSystems: [
      { os: "macOS", users: Math.round(users * 0.41) },
      { os: "Windows", users: Math.round(users * 0.33) },
      { os: "Android", users: Math.round(users * 0.18) },
      { os: "iOS", users: Math.round(users * 0.08) },
    ],
    countries: [
      { country: "CN", countryId: "CN", users: Math.round(users * 0.44) },
      { country: "US", countryId: "US", users: Math.round(users * 0.21) },
      { country: "JP", countryId: "JP", users: Math.round(users * 0.12) },
      { country: "DE", countryId: "DE", users: Math.round(users * 0.08) },
      { country: "SG", countryId: "SG", users: Math.round(users * 0.06) },
    ],
  }
}
