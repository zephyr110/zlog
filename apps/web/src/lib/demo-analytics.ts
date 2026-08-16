import type { AnalyticsRange, AnalyticsReport } from "./analytics-shared"

/**
 * 演示环境的 mock 分析数据：让访客在后台 Traffic 面板看到完整功能
 * （Vercel / GA4 两个来源都可用）。数值按 range 缩放，形状与真实报告
 * 完全一致（admin Traffic 组件直接渲染）。
 * 仅服务端 import（analytics route）。
 */
export function mockAnalyticsReport(
  source: "ga" | "vercel",
  range: AnalyticsRange
): AnalyticsReport {
  const scale = range === "today" ? 1 : range === "7d" ? 7 : 30
  const users = Math.round(38 * scale * (1 + range.length)) // 轻微随机感
  const views = Math.round(127 * scale * (1 + range.length))
  return {
    configured: true,
    source,
    range,
    totals: { activeUsers: users, screenPageViews: views },
    topPages: [
      { path: "/", views: Math.round(views * 0.34) },
      { path: "/posts/zlog-deployment-guide", views: Math.round(views * 0.21) },
      { path: "/topics/frontend", views: Math.round(views * 0.12) },
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
