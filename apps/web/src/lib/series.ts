import { type PostSummary } from "@zlog/core"

/** 系列连载：沿用仓库既有的"前缀命名空间 tag"约定（category-xxx、
 *  frontend-xxx 同理）。不改 schema、编辑器零改动、导出与桌面副本同步
 *  天然携带——作者在文章标签里加 `series-部署指南` 即入列。
 *
 *  顺序按发布日期升序（连载按发布顺序阅读），同日按 slug 稳定排序；
 *  系列成员是大小写不敏感匹配（与标签其余行为一致）。 */

export const SERIES_PREFIX = "series-"

export function isSeriesTag(tag: string): boolean {
  const lower = tag.trim().toLowerCase()
  return lower.startsWith(SERIES_PREFIX) && lower.length > SERIES_PREFIX.length
}

/** 该文所属的系列 tag（首个命中）；不属于任何系列时返回 null。 */
export function seriesTagOf(tags: string[]): string | null {
  return tags.find(isSeriesTag) ?? null
}

/** 系列展示名：去掉前缀，保留作者书写的大小写。 */
export function seriesName(tag: string): string {
  return tag.trim().slice(SERIES_PREFIX.length).trim()
}

/** 两篇文是否同系列（大小写不敏感）。 */
export function sameSeries(a: string[], b: string[]): boolean {
  const ta = seriesTagOf(a)
  const tb = seriesTagOf(b)
  return (
    ta !== null &&
    tb !== null &&
    seriesName(ta).toLowerCase() === seriesName(tb).toLowerCase()
  )
}

/** 对外展示的标签：系列 tag 是元数据，不混进普通标签行/标签云。 */
export function publicTags(tags: string[]): string[] {
  return tags.filter((tag) => !isSeriesTag(tag))
}

/** 连载顺序：日期升序，同日按 slug 保证确定性。 */
export function orderSeriesPosts<T extends { slug: string; date: string }>(
  posts: T[]
): T[] {
  return [...posts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug)
  )
}

/** 按系列名（大小写不敏感）筛出该系列的全部文章，已按连载顺序。 */
export function collectSeriesPosts(
  posts: PostSummary[],
  name: string
): PostSummary[] {
  const target = name.trim().toLowerCase()
  if (!target) return []
  return orderSeriesPosts(
    posts.filter((post) => {
      const tag = seriesTagOf(post.tags)
      return tag !== null && seriesName(tag).toLowerCase() === target
    })
  )
}

/** 全部系列总览：大小写不敏感去重（取首次出现的原始拼写），
 *  按最新一篇的日期降序（活跃的系列在前），同日按名称排序。 */
export function listSeries(
  posts: PostSummary[]
): { name: string; posts: PostSummary[] }[] {
  const members = new Map<string, PostSummary[]>()
  const names = new Map<string, string>()
  for (const post of posts) {
    const tag = seriesTagOf(post.tags)
    if (!tag) continue
    const name = seriesName(tag)
    if (!name) continue
    const key = name.toLowerCase()
    if (!members.has(key)) {
      members.set(key, [])
      names.set(key, name)
    }
    members.get(key)!.push(post)
  }
  return [...members.entries()]
    .map(([key, group]) => ({
      name: names.get(key)!,
      posts: orderSeriesPosts(group),
    }))
    .sort((a, b) => {
      const aLatest = a.posts[a.posts.length - 1].date
      const bLatest = b.posts[b.posts.length - 1].date
      return bLatest.localeCompare(aLatest) || a.name.localeCompare(b.name)
    })
}

export type SeriesNav = {
  name: string
  /** 1 起算：当前文在系列中的位置。 */
  position: number
  total: number
  prev: PostSummary | null
  next: PostSummary | null
  posts: PostSummary[]
}

/** 当前文所属系列的位置 + 前后篇。不在系列里、系列名缺失、或系列
 *  只有一篇时返回 null（只有一篇没有"连载"可言，不显示导航）。 */
export function buildSeriesNav(
  posts: PostSummary[],
  currentSlug: string
): SeriesNav | null {
  const current = posts.find((post) => post.slug === currentSlug)
  if (!current) return null
  const tag = seriesTagOf(current.tags)
  if (!tag) return null
  const name = seriesName(tag)
  const members = collectSeriesPosts(posts, name)
  if (members.length < 2) return null
  const index = members.findIndex((post) => post.slug === currentSlug)
  if (index === -1) return null
  return {
    name,
    position: index + 1,
    total: members.length,
    prev: index > 0 ? members[index - 1] : null,
    next: index < members.length - 1 ? members[index + 1] : null,
    posts: members,
  }
}
