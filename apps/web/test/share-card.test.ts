import { describe, expect, it } from "vitest"
import {
  SHARE_BG_POOL,
  SHARE_SIZE,
  fnv1a,
  layoutTitle,
  pickBackground,
  shareCardFilename,
} from "@/lib/share-card"

/** 假 measure：CJK/全角 ≈ 1em、其余 ≈ 0.55em —— 够逼近真实排版行为。 */
function fakeMeasure(text: string, fontSize: number): number {
  let width = 0
  for (const ch of text) {
    width += /[　-鿿＀-￯]/.test(ch) ? 1 : 0.55
  }
  return width * fontSize
}

describe("background pool", () => {
  it("holds at least 20 https Unsplash URLs sized for the card", () => {
    expect(SHARE_BG_POOL.length).toBeGreaterThanOrEqual(20)
    for (const url of SHARE_BG_POOL) {
      expect(url.startsWith("https://images.unsplash.com/photo-")).toBe(true)
      expect(url).toContain("w=1080")
      expect(url).toContain("h=1440")
    }
  })

  it("shares the 1080×1440 poster ratio", () => {
    expect(SHARE_SIZE).toEqual({ width: 1080, height: 1440 })
  })
})

describe("fnv1a", () => {
  it("matches the standard FNV-1a 32-bit vectors", () => {
    expect(fnv1a("")).toBe(2166136261) // 0x811c9dc5
    expect(fnv1a("a")).toBe(3826002220) // 0xe40c292c
  })
})

describe("pickBackground", () => {
  it("is deterministic per seed and stays in range", () => {
    for (const seed of ["hello", "系列-1", "a-very-long-slug-2026", ""]) {
      const index = pickBackground(seed)
      expect(index).toBe(pickBackground(seed))
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(SHARE_BG_POOL.length)
    }
  })

  it("never returns the excluded index", () => {
    for (const seed of ["hello", "posts/关于写作", "x"]) {
      const first = pickBackground(seed)
      expect(pickBackground(seed, first)).not.toBe(first)
    }
  })
})

describe("layoutTitle", () => {
  it("keeps a short title on one line at the top of the ladder", () => {
    expect(layoutTitle(fakeMeasure, "你好世界", 640)).toEqual({
      fontSize: 96,
      lines: ["你好世界"],
    })
  })

  it("steps down the ladder to keep a long CJK title within 3 lines", () => {
    // 21 字：96px 每行 6 字 → 4 行；84px 每行 7 字 → 正好 3 行
    const layout = layoutTitle(
      fakeMeasure,
      "这是一个很长的中文标题需要缩小字号才能放下",
      640
    )
    expect(layout.fontSize).toBe(84)
    expect(layout.lines).toHaveLength(3)
  })

  it("wraps latin text on word boundaries, not mid-word", () => {
    expect(layoutTitle(fakeMeasure, "hello world", 320)).toEqual({
      fontSize: 96,
      lines: ["hello", "world"],
    })
  })

  it("ellipsizes at the smallest size when even 60px overflows", () => {
    const layout = layoutTitle(fakeMeasure, "长".repeat(40), 640)
    expect(layout.fontSize).toBe(60)
    expect(layout.lines).toHaveLength(3)
    expect(layout.lines[2].endsWith("…")).toBe(true)
  })

  it("balances lines so a 3-line CJK title never ends in an orphan word", () => {
    // 13 字：96px 贪心为 6/6/1（末行孤字）→ 平衡后 5/4/4
    const layout = layoutTitle(fakeMeasure, "一二三四五六七八九十一二三", 640)
    expect(layout.fontSize).toBe(96)
    expect(layout.lines).toEqual(["一二三四五", "六七八九", "十一二三"])
  })

  it("hard-breaks a word wider than the line so nothing overflows", () => {
    const layout = layoutTitle(
      fakeMeasure,
      "supercalifragilisticexpialidocious",
      200
    )
    expect(layout.fontSize).toBe(60)
    expect(layout.lines).toHaveLength(3)
    expect(layout.lines[2].endsWith("…")).toBe(true)
    for (const line of layout.lines) {
      expect(fakeMeasure(line, layout.fontSize)).toBeLessThanOrEqual(200)
    }
  })

  it("returns no lines for an empty title", () => {
    expect(layoutTitle(fakeMeasure, "   ", 640)).toEqual({
      fontSize: 96,
      lines: [],
    })
  })
})

describe("shareCardFilename", () => {
  it("names the download after the post", () => {
    expect(shareCardFilename("hello-world")).toBe("zlog-hello-world.jpg")
  })
})
