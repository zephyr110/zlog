import { type PostSummary } from "@zlog/core"

/** 相关文章排序：同标签加权——稀有标签比大众标签更有信息量（"随笔"
 *  人人都有，"milvus"才说明问题）。单个共享标签的权重 =
 *  1 / log2(2 + df)，df 为候选集中携带该标签的篇数；多个共享标签
 *  权重相加。平分时保持传入顺序（页面按日期倒序传入 → 新文优先）。
 *
 *  候选集的同系列排除由调用方完成——系列有自己的上下篇导航，
 *  不该再占据相关推荐位。 */
export function rankRelatedPosts(
  current: { slug: string; tags: string[] },
  candidates: PostSummary[],
  limit = 3
): PostSummary[] {
  const currentTags = new Set(current.tags.map((tag) => tag.toLowerCase()))
  if (currentTags.size === 0) return []

  const pool = candidates.filter((post) => post.slug !== current.slug)

  // 文档频率：候选集中有多少篇带这个标签（同一篇内重复标签只计一次）。
  const df = new Map<string, number>()
  const perPost = new Map<string, Set<string>>()
  for (const post of pool) {
    const unique = new Set(post.tags.map((tag) => tag.toLowerCase()))
    perPost.set(post.slug, unique)
    for (const tag of unique) {
      if (currentTags.has(tag)) df.set(tag, (df.get(tag) ?? 0) + 1)
    }
  }

  const scored: { post: PostSummary; score: number; index: number }[] = []
  pool.forEach((post, index) => {
    let score = 0
    for (const tag of perPost.get(post.slug)!) {
      if (currentTags.has(tag)) score += 1 / Math.log2(2 + (df.get(tag) ?? 0))
    }
    if (score > 0) scored.push({ post, score, index })
  })

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.post)
}
