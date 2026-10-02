/**
 * Pure layout helpers for the dynamic OG share card (1200×630, rendered
 * by satori via next/og). Satori has no text measurement and no CSS
 * overflow introspection, so the font-size choice and any truncation
 * happen here — deterministically, and unit-tested — instead of relying
 * on wrap behavior we cannot see in a crawler screenshot.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const

/** Content box: card width minus 2×80px horizontal padding. */
const CONTENT_WIDTH = OG_SIZE.width - 160
const MAX_LINES = 3
/** Greedy wrapping wastes some space at line ends — keep a little slack. */
const WRAP_SLACK = 0.96

/** Wide (≈1em) code-point ranges: CJK, Hangul, full-width forms and the
 *  CJK extension planes. One table serves both the width estimate and
 *  the locale heuristic below, so a range added for one cannot go
 *  missing from the other. */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0xa4cf], // CJK radicals … Yi
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xff60], // full-width forms
  [0xffe0, 0xffe6],
  [0x20000, 0x10ffff], // CJK extension planes
]

function isWideCode(code: number): boolean {
  return WIDE_RANGES.some(([lo, hi]) => code >= lo && code <= hi)
}

/** CJK / full-width glyphs occupy ≈1em; Latin, digits and punctuation
 *  ≈0.55em; spaces ≈0.3em. The estimate only needs to be conservative. */
function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  if (code === 0x20 || code === 0x3000) return 0.3
  return isWideCode(code) ? 1 : 0.55
}

export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0
  for (const ch of text) em += charWidth(ch)
  return em * fontSize
}

/** Largest-first; the first size whose estimated 3-line capacity covers
 *  the title wins, so short titles get the display treatment. */
const TITLE_SIZES = [84, 72, 62, 52, 44] as const

export interface OgTitleLayout {
  fontSize: number
  text: string
}

export function fitOgTitle(rawTitle: string): OgTitleLayout {
  const title = rawTitle.replace(/\s+/g, " ").trim()
  if (!title) return { fontSize: TITLE_SIZES[0], text: "Untitled" }

  const budget = CONTENT_WIDTH * MAX_LINES * WRAP_SLACK
  for (const fontSize of TITLE_SIZES) {
    if (estimateTextWidth(title, fontSize) <= budget) {
      return { fontSize, text: title }
    }
  }

  // Too long even at the smallest size — truncate on the width budget.
  const fontSize = TITLE_SIZES[TITLE_SIZES.length - 1]
  const ellipsisWidth = charWidth("…") * fontSize
  let width = 0
  let out = ""
  for (const ch of title) {
    const w = charWidth(ch) * fontSize
    if (width + w + ellipsisWidth > budget) break
    width += w
    out += ch
  }
  return { fontSize, text: `${out.trimEnd()}…` }
}

/** Derived from WIDE_RANGES so the two classifications can never drift
 *  (a fullwidth-￥ title used to measure wide but classify as "en").
 *  Hangul already counted as "zh" before — the card locale only picks
 *  the minRead string, so the unification matches existing intent. */
const CJK_RE = new RegExp(
  `[${WIDE_RANGES.map(
    ([lo, hi]) => `\\u{${lo.toString(16)}}-\\u{${hi.toString(16)}}`
  ).join("")}]`,
  "u"
)

/** OG requests carry no locale (crawlers send no cookie), so the card's
 *  language is inferred from the post's own visible text: any CJK glyph
 *  in the title/description means the reader sees Chinese. */
export function inferOgLocale(
  ...texts: Array<string | undefined | null>
): "zh" | "en" {
  for (const text of texts) {
    if (text && CJK_RE.test(text)) return "zh"
  }
  return "en"
}

/** The glyph set the card renders, deduped — drives the Google Fonts
 *  `text=` subset so one small TTF covers every string on the card.
 *  Capped to keep the request URL comfortably inside server limits. */
const MAX_SUBSET_CHARS = 600
export function ogSubsetText(parts: Array<string | undefined | null>): string {
  const seen = new Set<string>()
  for (const part of parts) {
    if (!part) continue
    for (const ch of part) {
      if (ch.trim() === "") continue
      seen.add(ch)
      if (seen.size >= MAX_SUBSET_CHARS) return [...seen].join("")
    }
  }
  return [...seen].join("")
}
