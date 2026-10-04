// 分享卡（1080×1440 海报）的纯逻辑：背景池、稳定选图、标题排版、文件名。
// 画布绘制在 components/blog/share-card-dialog.tsx；这里零 DOM 依赖，
// 用注入的 measure 函数在 vitest（node 环境）里直接单测。

export const SHARE_SIZE = { width: 1080, height: 1440 } as const

/** 精选背景池：Unsplash 直链（Unsplash License，免费商用，热链零仓库增重）。
 *  images.unsplash.com 对带 Origin 的请求返回 access-control-allow-origin: *
 *  —— canvas 跨域绘制并导出可行（实测）。id 均已 curl 验证 200。 */
const BG_IDS = [
  "photo-1506905925346-21bda4d32df4",
  "photo-1470071459604-3b5ec3a7fe05",
  "photo-1441974231531-c6227db76b6e",
  "photo-1501785888041-af3ef285b470",
  "photo-1472214103451-9374bd1c798e",
  "photo-1500530855697-b586d89ba3ee",
  "photo-1519681393784-d120267933ba",
  "photo-1493246507139-91e8fad9978e",
  "photo-1469474968028-56623f02e42e",
  "photo-1447752875215-b2761acb3c5d",
  "photo-1433086966358-54859d0ed716",
  "photo-1505144808419-1957a94ca61e",
  "photo-1475924156734-496f6cac6ec1",
  "photo-1497436072909-60f360e1d4b1",
  "photo-1470770841072-f978cf4d019e",
  "photo-1458668383970-8ddd3927deed",
  "photo-1464822759023-fed622ff2c3b",
  "photo-1483728642387-6c3bdd6c93e5",
  "photo-1439066615861-d1af74d74000",
  "photo-1444927714506-8492d94b4e3d",
  "photo-1502082553048-f009c37129b9",
  "photo-1439853949127-fa647821eba0",
  "photo-1505765050516-f72dcac9c60e",
  "photo-1465101162946-4377e57745c3",
] as const

const BG_PARAMS = "?fm=jpg&fit=crop&w=1080&h=1440&q=80"

export const SHARE_BG_POOL: readonly string[] = BG_IDS.map(
  (id) => `https://images.unsplash.com/${id}${BG_PARAMS}`
)

/** FNV-1a 32 位：同一 slug 稳定映射到池中同一张图（各端分享图一致）。 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** 由 seed 稳定选背景；传入 excludeIndex（当前图）时错开一位。 */
export function pickBackground(seed: string, excludeIndex?: number): number {
  const index = fnv1a(seed) % SHARE_BG_POOL.length
  if (excludeIndex === undefined || index !== excludeIndex) return index
  return (index + 1) % SHARE_BG_POOL.length
}

export type TitleLayout = { fontSize: number; lines: string[] }

/** 字号阶梯：从大到小试，选第一个放得下的。 */
const TITLE_LADDER = [96, 84, 72, 60] as const
export const TITLE_MAX_LINES = 3

type Measure = (text: string, fontSize: number) => number

/** 排版单元：拉丁/数字串保持整词，CJK 与标点逐字，空白可断行。 */
function tokenize(text: string): string[] {
  return text.match(/\s+|[A-Za-z0-9][A-Za-z0-9'’\-_.]*|./gu) ?? []
}

const isSpace = (token: string) => /^\s+$/.test(token)

/** 贪心换行（token 级）。比整行还长的 token（长单词/URL）按字符硬断，
 *  避免整行溢出画布。 */
function wrapTokens(
  measure: Measure,
  tokens: string[],
  fontSize: number,
  maxWidth: number
): string[][] {
  // 超宽 token 先展开成单字符，让贪心自然逐字符断
  const expanded: string[] = []
  for (const token of tokens) {
    if (measure(token, fontSize) <= maxWidth) {
      expanded.push(token)
      continue
    }
    for (const ch of token) expanded.push(ch)
  }

  const lines: string[][] = []
  let line: string[] = []
  for (const token of expanded) {
    if (isSpace(token) && line.length === 0) continue // 行首空白丢弃
    if (line.length > 0 && measure(line.join("") + token, fontSize) > maxWidth) {
      lines.push(line)
      line = isSpace(token) ? [] : [token]
    } else {
      line.push(token)
    }
  }
  if (line.length > 0) lines.push(line)
  return lines
}

function lineWidth(measure: Measure, line: string[], fontSize: number): number {
  return measure(line.join(""), fontSize)
}

/** 相邻行搬 token 的爬山式平衡：消除末行孤字、让各行长短接近
 *  （标题超长时观感的关键）。搬运仅在"两行宽度差变小且下一行不超宽"
 *  时发生，行数不变。 */
function balanceLines(
  measure: Measure,
  lines: string[][],
  fontSize: number,
  maxWidth: number
): string[][] {
  if (lines.length < 2) return lines
  for (const line of lines) {
    while (line.length > 1 && isSpace(line[line.length - 1])) line.pop() // 行尾空白不参与搬运
  }
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < lines.length - 1; i++) {
      const cur = lines[i]
      const next = lines[i + 1]
      // 每轮先清行尾空白：上一轮搬运可能刚暴露出行尾空白，
      // 不清掉它下一轮就会被搬到下一行行首（标题行首冒出空格）
      while (cur.length > 1 && isSpace(cur[cur.length - 1])) cur.pop()
      if (cur.length <= 1) continue
      const last = cur[cur.length - 1]
      const curRest = cur.slice(0, -1)
      const nextWith = [last, ...next]
      const nextWidth = lineWidth(measure, nextWith, fontSize)
      if (nextWidth > maxWidth) continue
      const before = Math.abs(
        lineWidth(measure, cur, fontSize) - lineWidth(measure, next, fontSize)
      )
      const after = Math.abs(
        lineWidth(measure, curRest, fontSize) - nextWidth
      )
      if (after < before) {
        lines[i] = curRest
        lines[i + 1] = nextWith
        improved = true
      }
    }
  }
  return lines
}

function wrapOnce(
  measure: Measure,
  tokens: string[],
  fontSize: number,
  maxWidth: number
): string[] {
  return balanceLines(
    measure,
    wrapTokens(measure, tokens, fontSize, maxWidth),
    fontSize,
    maxWidth
  ).map((line) => line.join("").trimEnd())
}

/** 标题排版：先按阶梯找放得下的字号；最小号仍超行数时截断加省略号。 */
export function layoutTitle(
  measure: Measure,
  text: string,
  maxWidth: number,
  maxLines: number = TITLE_MAX_LINES
): TitleLayout {
  const tokens = tokenize(text.trim())
  for (const fontSize of TITLE_LADDER) {
    const lines = wrapOnce(measure, tokens, fontSize, maxWidth)
    if (lines.length <= maxLines) return { fontSize, lines }
  }
  const fontSize = TITLE_LADDER[TITLE_LADDER.length - 1]
  const lines = wrapOnce(measure, tokens, fontSize, maxWidth).slice(0, maxLines)
  let cut = lines[maxLines - 1]
  while (cut.length > 0 && measure(cut + "…", fontSize) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  lines[maxLines - 1] = cut.trimEnd() + "…"
  return { fontSize, lines }
}

/** 下载文件名：zlog-<slug>.jpg。 */
export function shareCardFilename(slug: string): string {
  return `zlog-${slug}.jpg`
}
