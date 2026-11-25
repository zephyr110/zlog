import { describe, expect, it } from "vitest"
import { normalizeMathDelimiters } from "@/lib/mdx-math"

describe("normalizeMathDelimiters", () => {
  it("converts inline \\(...\\) to $...$", () => {
    expect(
      normalizeMathDelimiters("其中 \\(v_k \\in \\{0, 1\\}\\) 表示第 \\(k\\) 个片段")
    ).toBe("其中 $v_k \\in \\{0, 1\\}$ 表示第 $k$ 个片段")
  })

  it("trims padding inside inline delimiters", () => {
    expect(normalizeMathDelimiters("前 \\( x \\) 后")).toBe("前 $x$ 后")
  })

  it("hoists a mid-line \\[ onto its own display block", () => {
    const source = "**第三步**。\\[\n\\text{F} = \\frac{a}{b}\n\\]"
    expect(normalizeMathDelimiters(source)).toBe(
      "**第三步**。\n\n$$\n\\text{F} = \\frac{a}{b}\n$$\n"
    )
  })

  it("keeps a display block that already starts its own line", () => {
    expect(normalizeMathDelimiters("\\[\nx\n\\]")).toBe("$$\nx\n$$\n")
  })

  it("closes a one-line display block on its own fence line", () => {
    expect(normalizeMathDelimiters("a\\[x\\]b")).toBe("a\n\n$$\nx\n$$\nb")
  })

  it("leaves fenced code and inline code untouched", () => {
    const source = '```python\nx = "\\[y\\]"\n```\n\n字面量 `\\(a\\)` 不转换\n'
    expect(normalizeMathDelimiters(source)).toBe(source)
  })

  it("leaves an escaped backslash before a paren alone", () => {
    const source = "\\\\(not math\\\\)"
    expect(normalizeMathDelimiters(source)).toBe(source)
  })

  it("leaves delimiter text without a closer alone", () => {
    expect(normalizeMathDelimiters("孤立的 \\[ 与 \\( 不转换")).toBe(
      "孤立的 \\[ 与 \\( 不转换"
    )
  })

  it("does not touch existing $ math", () => {
    const source = "行内 $x$ 与块级\n\n$$\ny\n$$\n"
    expect(normalizeMathDelimiters(source)).toBe(source)
  })

  it("is idempotent on already-normalized content", () => {
    const once = normalizeMathDelimiters(
      "**第三步**。\\[\n\\text{F} = \\frac{a}{b}\n\\]\n\n其中 \\(k\\) 个"
    )
    expect(normalizeMathDelimiters(once)).toBe(once)
  })
})
