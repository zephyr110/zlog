/**
 * Content-level traffic attribution (client-safe, pure).
 *
 * The traffic archive stores one row per page path per month
 * (analytics_monthly, dimension='pages'). This module maps those paths to
 * the blog's own posts so the admin can see which articles draw traffic
 * and how each one trends month over month.
 */
import { type AnalyticsSource } from "./analytics-shared"

export const POST_PATH_PREFIX = "/posts/"

/** '/posts/hello' → 'hello'; anything that isn't a post path → null.
 *  Tolerates a trailing slash; nested paths under a post (none exist
 *  today) are treated as not-a-post. */
export function slugFromPostPath(path: string): string | null {
  if (!path.startsWith(POST_PATH_PREFIX)) return null
  const rest = path.slice(POST_PATH_PREFIX.length).replace(/\/+$/, "")
  if (!rest || rest.includes("/")) return null
  return rest
}

export type PostTrafficArchiveRow = {
  month: string
  itemKey: string
  users: number
  views: number
}

export type PostTrafficEntry = {
  slug: string
  title: string
  path: string
  views: number
  users: number
  /** One point per month in the queried window, ascending; months with no
   *  archive row are 0 so every entry's sparkline shares the same scale. */
  series: { month: string; views: number }[]
}

/** GET /api/admin/post-traffic response (shared by route + panel). */
export type PostTrafficReport = {
  configured: true
  source: AnalyticsSource
  /** Covered months, ascending. Empty when nothing is archived yet. */
  months: string[]
  posts: PostTrafficEntry[]
}

/**
 * Group archive rows (dimension='pages') by post slug, sum totals, and
 * align each post's monthly series to `months`. Rows for paths that are
 * not posts (home, /archive, …) or that match no known post are dropped;
 * entries sort by total views desc.
 */
export function buildPostTraffic(
  rows: PostTrafficArchiveRow[],
  posts: { slug: string; title: string }[],
  months: string[],
  cap = 20
): PostTrafficEntry[] {
  const titleBySlug = new Map(posts.map((p) => [p.slug, p.title]))
  const indexByMonth = new Map(months.map((m, i) => [m, i]))
  const bySlug = new Map<string, PostTrafficEntry>()

  for (const row of rows) {
    const slug = slugFromPostPath(row.itemKey)
    if (!slug) continue
    const title = titleBySlug.get(slug)
    if (title === undefined) continue
    let entry = bySlug.get(slug)
    if (!entry) {
      entry = {
        slug,
        title,
        path: `${POST_PATH_PREFIX}${slug}`,
        views: 0,
        users: 0,
        series: months.map((month) => ({ month, views: 0 })),
      }
      bySlug.set(slug, entry)
    }
    entry.views += row.views
    entry.users += row.users
    const at = indexByMonth.get(row.month)
    if (at !== undefined) entry.series[at].views += row.views
  }

  return [...bySlug.values()]
    .sort((a, b) => b.views - a.views)
    .slice(0, cap)
}

/**
 * SVG polyline points for a mini sparkline of `values` in a
 * width×height box. A single-point or all-zero series renders flat at
 * the bottom; empty input returns "" (caller renders nothing).
 * Y is inverted (SVG origin is top-left) with a 1px inset so the stroke
 * isn't clipped.
 */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number
): string {
  if (values.length === 0) return ""
  const max = Math.max(...values)
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const usable = height - 2
  return values
    .map((v, i) => {
      const x = values.length > 1 ? i * step : width / 2
      const y = max === 0 ? height - 1 : height - 1 - (v / max) * usable
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}
