/** ⌘K 命令面板的纯逻辑：匹配、分组、活动项移动。
 *  UI 与数据获取留在组件里，这里只做可单测的部分。 */

export type PaletteGroup = "nav" | "action" | "posts"

export type PaletteItem = {
  id: string
  /** 展示文本（也是主要匹配对象）。 */
  label: string
  /** 右侧次要信息（如 slug、路径）。 */
  hint?: string
  /** 额外匹配词：英文名、拼音、路径等。 */
  keywords?: string[]
  group: PaletteGroup
}

/** 多词全匹配（AND），大小写不敏感；空查询全通过。 */
export function matchesPaletteQuery(item: PaletteItem, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = [item.label, item.hint ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}

/** 过滤并保留输入顺序；posts 组单独截断（导航/操作不设上限）。
 *  泛型保住调用方的附加字段（icon/run 等）。 */
export function filterPaletteItems<T extends PaletteItem>(
  items: T[],
  query: string,
  postCap = 8
): T[] {
  const out: T[] = []
  let posts = 0
  for (const item of items) {
    if (!matchesPaletteQuery(item, query)) continue
    if (item.group === "posts") {
      if (posts >= postCap) continue
      posts++
    }
    out.push(item)
  }
  return out
}

/** 分组渲染顺序：页面 → 操作 → 文章；空组省略。 */
export function groupPaletteItems<T extends PaletteItem>(
  items: T[]
): { group: PaletteGroup; items: T[] }[] {
  const order: PaletteGroup[] = ["nav", "action", "posts"]
  return order
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0)
}

/** 上下键循环移动（-1 表示未选中；无结果保持 -1）。 */
export function stepActiveIndex(
  current: number,
  delta: number,
  length: number
): number {
  if (length === 0) return -1
  if (current < 0) return delta > 0 ? 0 : length - 1
  return (current + delta + length) % length
}
