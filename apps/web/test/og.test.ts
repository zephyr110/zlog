import { describe, expect, it } from "vitest"
import {
  estimateTextWidth,
  fitOgTitle,
  inferOgLocale,
  ogSubsetText,
  OG_SIZE,
} from "@/lib/og"

const CONTENT_WIDTH = OG_SIZE.width - 160
const BUDGET = CONTENT_WIDTH * 3 * 0.96

describe("estimateTextWidth", () => {
  it("counts CJK glyphs wider than Latin ones", () => {
    expect(estimateTextWidth("中", 100)).toBe(100)
    expect(estimateTextWidth("a", 100)).toBeCloseTo(55)
  })

  it("scales linearly with font size", () => {
    expect(estimateTextWidth("hello", 50)).toBe(
      estimateTextWidth("hello", 100) / 2
    )
  })

  it("treats full-width punctuation as wide", () => {
    expect(estimateTextWidth("，", 100)).toBe(100)
  })
})

describe("fitOgTitle", () => {
  it("gives short titles the display size", () => {
    expect(fitOgTitle("Hello").fontSize).toBe(84)
  })

  it("steps down as the title grows", () => {
    const sizes = [8, 20, 40, 70, 120].map(
      (n) => fitOgTitle("中".repeat(n)).fontSize
    )
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1])
    }
    expect(sizes[sizes.length - 1]).toBeLessThan(84)
  })

  it("fits any (non-truncated) result within the 3-line budget", () => {
    const { fontSize, text } = fitOgTitle("中".repeat(60))
    expect(estimateTextWidth(text, fontSize)).toBeLessThanOrEqual(BUDGET)
  })

  it("truncates with an ellipsis when nothing fits, staying within budget", () => {
    const { fontSize, text } = fitOgTitle("这是一个非常长的中文标题".repeat(30))
    expect(text.endsWith("…")).toBe(true)
    expect(estimateTextWidth(text, fontSize)).toBeLessThanOrEqual(BUDGET)
  })

  it("collapses whitespace and trims", () => {
    const { text } = fitOgTitle("  hello \n\n world  ")
    expect(text).toBe("hello world")
  })

  it("falls back to a placeholder for an empty title", () => {
    expect(fitOgTitle("   ").text).toBe("Untitled")
  })
})

describe("inferOgLocale", () => {
  it("detects Chinese from the title", () => {
    expect(inferOgLocale("Zlog 部署指南（一）：三种方式怎么选")).toBe("zh")
  })

  it("treats Latin-only text as English", () => {
    expect(inferOgLocale("Zlog Deployment Guide (1/3)", "Pick a mode")).toBe(
      "en"
    )
  })

  it("checks later texts when earlier ones are empty", () => {
    expect(inferOgLocale("", null, undefined, "中文描述")).toBe("zh")
  })
})

describe("ogSubsetText", () => {
  it("dedupes characters across parts", () => {
    expect(ogSubsetText(["abc", "bad"])).toBe("abcd")
  })

  it("skips empty and missing parts", () => {
    expect(ogSubsetText([null, undefined, "", "x"])).toBe("x")
  })

  it("drops whitespace but keeps punctuation", () => {
    expect(ogSubsetText(["a b·#"])).toBe("ab·#")
  })

  it("caps the glyph set", () => {
    const long = Array.from({ length: 2000 }, (_, i) =>
      String.fromCodePoint(0x4e00 + i)
    ).join("")
    expect([...ogSubsetText([long])].length).toBeLessThanOrEqual(600)
  })
})
