import { describe, expect, it } from "vitest"
import { type PostSummary } from "@zlog/core"
import { rankRelatedPosts } from "@/lib/related"

function mkPost(slug: string, tags: string[]): PostSummary {
  return {
    slug,
    title: `Title ${slug}`,
    date: "2026-01-01",
    tags,
    description: "",
    draft: false,
    pinnedAt: null,
    publishAt: null,
    wordCount: 0,
    readingTime: 0,
  }
}

describe("rankRelatedPosts", () => {
  it("weights a rare shared tag above a common one", () => {
    const current = { slug: "me", tags: ["common", "rare"] }
    // df(common)=4，df(rare)=1 → rare 权重 1/log2(3) ≈ 0.63 >
    // common 权重 1/log2(6) ≈ 0.39
    const candidates = [
      mkPost("c1", ["common"]),
      mkPost("c2", ["common"]),
      mkPost("c3", ["common"]),
      mkPost("rare-post", ["rare"]),
      mkPost("c4", ["common"]),
    ]
    const ranked = rankRelatedPosts(current, candidates, 3)
    expect(ranked[0].slug).toBe("rare-post")
  })

  it("sums weights of multiple shared tags", () => {
    const current = { slug: "me", tags: ["a", "b"] }
    const candidates = [
      mkPost("one-tag", ["a"]),
      mkPost("two-tags", ["a", "b"]),
    ]
    expect(rankRelatedPosts(current, candidates, 3).map((p) => p.slug)).toEqual(
      ["two-tags", "one-tag"]
    )
  })

  it("keeps input order on ties (newest-first callers win)", () => {
    const current = { slug: "me", tags: ["x"] }
    const candidates = [mkPost("first", ["x"]), mkPost("second", ["x"]), mkPost("third", ["x"])]
    expect(rankRelatedPosts(current, candidates, 2).map((p) => p.slug)).toEqual(
      ["first", "second"]
    )
  })

  it("excludes the current post and posts with no shared tags", () => {
    const current = { slug: "me", tags: ["x"] }
    const candidates = [
      mkPost("me", ["x"]),
      mkPost("stranger", ["y"]),
      mkPost("match", ["x"]),
    ]
    expect(rankRelatedPosts(current, candidates, 3).map((p) => p.slug)).toEqual(
      ["match"]
    )
  })

  it("counts a duplicated tag once per post (score and df)", () => {
    const current = { slug: "me", tags: ["a", "b"] }
    const candidates = [
      mkPost("dup", ["a", "a"]),
      mkPost("b-post", ["b"]),
      mkPost("a-post", ["a"]),
    ]
    // 正确：df(a)=2 → 0.5 < df(b)=1 → 0.631，b-post 第一。
    // 若同一篇里的重复标签被重复计分/重复计 df，dup 会反超 b-post。
    expect(rankRelatedPosts(current, candidates, 3).map((p) => p.slug)).toEqual(
      ["b-post", "dup", "a-post"]
    )
  })

  it("matches tags case-insensitively", () => {
    const current = { slug: "me", tags: ["Milvus"] }
    expect(
      rankRelatedPosts(current, [mkPost("m", ["milvus"])], 3).map((p) => p.slug)
    ).toEqual(["m"])
  })

  it("returns empty when the current post has no tags", () => {
    const current = { slug: "me", tags: [] }
    expect(rankRelatedPosts(current, [mkPost("x", ["a"])], 3)).toEqual([])
  })

  it("caps results at the limit", () => {
    const current = { slug: "me", tags: ["x"] }
    const candidates = ["a", "b", "c", "d", "e"].map((s) => mkPost(s, ["x"]))
    expect(rankRelatedPosts(current, candidates, 2)).toHaveLength(2)
  })
})
