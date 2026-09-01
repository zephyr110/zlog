import { describe, it, expect } from "vitest"
import { countUrls, isRepetitiveNoise } from "@/lib/comment-filters"

describe("countUrls", () => {
  it("counts full URLs with scheme and www prefix", () => {
    expect(countUrls("check https://example.com out")).toBe(1)
    expect(countUrls("see www.example.com now")).toBe(1)
  })

  it("counts bare domains", () => {
    expect(countUrls("visit example.com today")).toBe(1)
    expect(countUrls("a.com b.com c.com")).toBe(3)
  })

  it("counts each full URL exactly once, not twice as a bare domain", () => {
    // "www.example.com" must not count twice (www prefix + bare domain).
    expect(countUrls("go to www.example.com please")).toBe(1)
    expect(countUrls("https://example.com/path?q=1")).toBe(1)
  })

  it("does not count file extensions or email domains", () => {
    expect(countUrls("open package.json")).toBe(0)
    expect(countUrls("see README.md and tsconfig.json")).toBe(0)
    expect(countUrls("mail me at bob@example.com")).toBe(0)
    expect(countUrls("use v1.2.3")).toBe(0)
  })

  it("caps at 2 for link spam", () => {
    expect(countUrls("a.com b.com c.com d.com")).toBeGreaterThan(2)
    expect(countUrls("one https://x.com two https://y.com")).toBe(2)
  })

  it("ignores punctuation-adjacent URLs without overcounting", () => {
    expect(countUrls("(example.com)")).toBe(1)
  })
})

describe("isRepetitiveNoise", () => {
  it("flags long runs of a single character", () => {
    expect(isRepetitiveNoise("aaaaaaaaaaaaaaaaaaaa")).toBe(true)
    expect(isRepetitiveNoise("6666666666666666")).toBe(true)
    // A tiny alphabet repeated is still noise (3 distinct chars < 20%).
    expect(isRepetitiveNoise("abcabcabcabcabcabcabcabc")).toBe(true)
  })

  it("exempts short comments", () => {
    expect(isRepetitiveNoise("aaaaa")).toBe(false)
    expect(isRepetitiveNoise("666")).toBe(false)
    expect(isRepetitiveNoise("kkk")).toBe(false)
  })

  it("accepts normal human comments", () => {
    expect(isRepetitiveNoise("This is a normal comment with words.")).toBe(false)
    expect(isRepetitiveNoise("哈哈哈，写得太好了，学习了！")).toBe(false)
    expect(isRepetitiveNoise("同意！这个方案比之前的合理多了。")).toBe(false)
  })

  it("ignores whitespace when measuring variety", () => {
    // Same few chars repeated with spaces is still noise.
    expect(isRepetitiveNoise("ab ab ab ab ab ab ab ab ab")).toBe(true)
  })
})
