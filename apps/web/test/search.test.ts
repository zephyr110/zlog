import { describe, expect, it } from "vitest"
import { type Post } from "@zlog/core"
import {
  makeSnippet,
  rankSearchResults,
  scorePost,
  stripMarkdown,
  tokenizeQuery,
} from "@/lib/search"

function mkPost(overrides: Partial<Post>): Post {
  return {
    slug: "post",
    title: "Title",
    date: "2026-01-01",
    tags: [],
    description: "",
    draft: false,
    pinnedAt: null,
    content: "",
    wordCount: 0,
    readingTime: 0,
    ...overrides,
  }
}

describe("tokenizeQuery", () => {
  it("splits on whitespace and preserves order", () => {
    expect(tokenizeQuery("  hello   world  ")).toEqual(["hello", "world"])
  })

  it("dedupes case-insensitively, keeping the first spelling", () => {
    expect(tokenizeQuery("React react REACT")).toEqual(["React"])
  })

  it("returns one term for spaceless CJK queries", () => {
    expect(tokenizeQuery("嵌入式副本")).toEqual(["嵌入式副本"])
  })

  it("caps the term count at 6", () => {
    expect(tokenizeQuery("a b c d e f g h")).toHaveLength(6)
  })

  it("returns an empty array for blank input", () => {
    expect(tokenizeQuery("   ")).toEqual([])
  })
})

describe("stripMarkdown", () => {
  it("drops fenced code blocks entirely", () => {
    expect(stripMarkdown("before\n```js\nconst x = 1\n```\nafter")).toBe(
      "before after"
    )
  })

  it("keeps inline code content but removes backticks", () => {
    expect(stripMarkdown("use `pnpm test` here")).toBe("use pnpm test here")
  })

  it("turns images into alt text and links into labels", () => {
    expect(stripMarkdown("![a cat](cat.png) and [docs](https://x.dev)")).toBe(
      "a cat and docs"
    )
  })

  it("removes heading, quote, and emphasis markers", () => {
    expect(stripMarkdown("## Title\n\n> quoted **bold** _it_")).toBe(
      "Title quoted bold it"
    )
  })

  it("collapses whitespace", () => {
    expect(stripMarkdown("a\n\n\nb\t\tc")).toBe("a b c")
  })
})

describe("scorePost", () => {
  it("ranks a title hit above a description hit above a body hit", () => {
    const terms = ["milvus"]
    const title = scorePost(mkPost({ title: "Milvus notes" }), terms)
    const desc = scorePost(mkPost({ description: "about milvus" }), terms)
    const body = scorePost(mkPost({ content: "milvus once" }), terms)
    expect(title).toBeGreaterThan(desc)
    expect(desc).toBeGreaterThan(body)
    expect(body).toBeGreaterThan(0)
  })

  it("adds score for multiple terms (AND semantics)", () => {
    const both = scorePost(
      mkPost({ title: "Milvus and Turso" }),
      ["milvus", "turso"]
    )
    const one = scorePost(mkPost({ title: "Milvus notes" }), ["milvus", "turso"])
    expect(both).toBeGreaterThan(one)
  })

  it("saturates body hit counting", () => {
    const many = scorePost(
      mkPost({ content: Array(100).fill("term").join(" ") }),
      ["term"]
    )
    const five = scorePost(
      mkPost({ content: Array(5).fill("term").join(" ") }),
      ["term"]
    )
    expect(many).toBe(five)
  })

  it("is case-insensitive", () => {
    expect(scorePost(mkPost({ title: "MILVUS" }), ["milvus"])).toBe(
      scorePost(mkPost({ title: "milvus" }), ["Milvus"])
    )
  })
})

describe("makeSnippet", () => {
  it("windows around the earliest hit with ellipses on both sides", () => {
    const content = `${"a".repeat(300)} needle ${"b".repeat(300)}`
    const snippet = makeSnippet(content, ["needle"])
    expect(snippet).toContain("needle")
    expect(snippet.startsWith("…")).toBe(true)
    expect(snippet.endsWith("…")).toBe(true)
    expect(snippet.length).toBeLessThanOrEqual(162) // 160 + two ellipsis chars
  })

  it("falls back to the body start when the term missed the body", () => {
    const content = "opening words here and more"
    const snippet = makeSnippet(content, ["absent"])
    expect(snippet.startsWith("opening words")).toBe(true)
    expect(snippet.startsWith("…")).toBe(false)
  })

  it("strips markdown before windowing", () => {
    const snippet = makeSnippet("## Head\n\nbody **term** here", ["term"])
    expect(snippet).not.toContain("#")
    expect(snippet).not.toContain("*")
    expect(snippet).toContain("term")
  })

  it("returns empty string for empty content", () => {
    expect(makeSnippet("", ["x"])).toBe("")
  })
})

describe("rankSearchResults", () => {
  it("sorts by score desc, then date desc", () => {
    const results = rankSearchResults(
      [
        mkPost({ slug: "old-title-hit", title: "term", date: "2025-01-01" }),
        mkPost({ slug: "new-title-hit", title: "term", date: "2026-01-01" }),
        mkPost({ slug: "body-only", content: "term", date: "2027-01-01" }),
      ],
      ["term"]
    )
    expect(results.map((r) => r.slug)).toEqual([
      "new-title-hit",
      "old-title-hit",
      "body-only",
    ])
  })

  it("breaks exact ties by slug for a stable order", () => {
    const results = rankSearchResults(
      [
        mkPost({ slug: "b", title: "term" }),
        mkPost({ slug: "a", title: "term" }),
      ],
      ["term"]
    )
    expect(results.map((r) => r.slug)).toEqual(["a", "b"])
  })

  it("returns SearchHit fields for each post", () => {
    const [hit] = rankSearchResults(
      [mkPost({ slug: "s", title: "T", date: "2026-05-05", tags: ["x"] })],
      ["t"]
    )
    expect(hit).toMatchObject({
      slug: "s",
      title: "T",
      date: "2026-05-05",
      tags: ["x"],
    })
    expect(typeof hit.snippet).toBe("string")
    expect(hit.score).toBeGreaterThan(0)
  })
})
