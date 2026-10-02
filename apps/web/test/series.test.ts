import { describe, expect, it } from "vitest"
import { type PostSummary } from "@zlog/core"
import {
  buildSeriesNav,
  collectSeriesPosts,
  isSeriesTag,
  listSeries,
  orderSeriesPosts,
  publicTags,
  sameSeries,
  seriesName,
  seriesTagOf,
} from "@/lib/series"

function mkPost(
  slug: string,
  date: string,
  tags: string[]
): PostSummary {
  return {
    slug,
    title: `Title ${slug}`,
    date,
    tags,
    description: "",
    draft: false,
    pinnedAt: null,
    publishAt: null,
    wordCount: 0,
    readingTime: 0,
  }
}

describe("isSeriesTag", () => {
  it("accepts prefixed tags including case/spacing variants", () => {
    expect(isSeriesTag("series-部署指南")).toBe(true)
    expect(isSeriesTag("SERIES-React")).toBe(true)
    expect(isSeriesTag("  series-web dev  ")).toBe(true)
  })

  it("rejects bare prefix, other namespaces, and lookalikes", () => {
    expect(isSeriesTag("series-")).toBe(false)
    expect(isSeriesTag("series")).toBe(false)
    expect(isSeriesTag("myseries-x")).toBe(false)
    expect(isSeriesTag("category-frontend")).toBe(false)
    expect(isSeriesTag("")).toBe(false)
  })
})

describe("seriesTagOf / seriesName", () => {
  it("returns the first series tag in the list", () => {
    expect(seriesTagOf(["react", "series-Web"])).toBe("series-Web")
    expect(seriesTagOf(["react"])).toBeNull()
  })

  it("strips the prefix and preserves the author's spelling", () => {
    expect(seriesName("series-部署指南")).toBe("部署指南")
    expect(seriesName("SERIES- My Series ")).toBe("My Series")
  })
})

describe("sameSeries", () => {
  it("matches case-insensitively across the whole name", () => {
    expect(sameSeries(["series-Web"], ["series-web"])).toBe(true)
    expect(sameSeries(["series-Web"], ["series-DB"])).toBe(false)
  })

  it("is false when either side has no series", () => {
    expect(sameSeries(["series-Web"], ["react"])).toBe(false)
    expect(sameSeries([], [])).toBe(false)
  })
})

describe("publicTags", () => {
  it("drops series tags and keeps the rest in order", () => {
    expect(publicTags(["react", "series-Web", "typescript"])).toEqual([
      "react",
      "typescript",
    ])
  })
})

describe("orderSeriesPosts", () => {
  it("sorts by date ascending with a slug tie-break", () => {
    const a = mkPost("b", "2026-02-01", [])
    const b = mkPost("a", "2026-02-01", [])
    const c = mkPost("c", "2026-01-01", [])
    expect(orderSeriesPosts([a, b, c]).map((p) => p.slug)).toEqual([
      "c",
      "a",
      "b",
    ])
  })
})

describe("collectSeriesPosts", () => {
  const posts = [
    mkPost("one", "2026-02-01", ["series-Web Dev", "react"]),
    mkPost("two", "2026-01-01", ["series-web dev"]),
    mkPost("other", "2026-01-15", ["series-Other"]),
    mkPost("plain", "2026-01-20", ["react"]),
  ]

  it("filters by name case-insensitively and orders by date", () => {
    expect(collectSeriesPosts(posts, "WEB dev").map((p) => p.slug)).toEqual([
      "two",
      "one",
    ])
  })

  it("returns empty for an empty name", () => {
    expect(collectSeriesPosts(posts, "  ")).toEqual([])
  })
})

describe("listSeries", () => {
  it("groups case-insensitively, keeping the first spelling seen", () => {
    const posts = [
      mkPost("one", "2026-01-01", ["series-Web"]),
      mkPost("two", "2026-02-01", ["series-web"]),
    ]
    const result = listSeries(posts)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Web")
    expect(result[0].posts.map((p) => p.slug)).toEqual(["one", "two"])
  })

  it("orders groups by their latest member, descending", () => {
    const posts = [
      mkPost("a1", "2026-01-01", ["series-A"]),
      mkPost("a2", "2026-03-01", ["series-A"]),
      mkPost("b1", "2026-02-01", ["series-B"]),
    ]
    expect(listSeries(posts).map((entry) => entry.name)).toEqual(["A", "B"])
  })
})

describe("buildSeriesNav", () => {
  const posts = [
    mkPost("mid", "2026-02-01", ["series-连载"]),
    mkPost("first", "2026-01-01", ["series-连载"]),
    mkPost("last", "2026-03-01", ["series-连载"]),
    mkPost("solo", "2026-01-01", ["series-单篇"]),
    mkPost("plain", "2026-01-01", ["react"]),
  ]

  it("computes position and neighbours in date order", () => {
    const nav = buildSeriesNav(posts, "mid")
    expect(nav).not.toBeNull()
    expect(nav!.name).toBe("连载")
    expect(nav!.position).toBe(2)
    expect(nav!.total).toBe(3)
    expect(nav!.prev?.slug).toBe("first")
    expect(nav!.next?.slug).toBe("last")
    expect(nav!.posts.map((p) => p.slug)).toEqual(["first", "mid", "last"])
  })

  it("has a null prev on the first part and null next on the last", () => {
    expect(buildSeriesNav(posts, "first")!.prev).toBeNull()
    expect(buildSeriesNav(posts, "last")!.next).toBeNull()
  })

  it("returns null for solo series, non-series posts, unknown slugs", () => {
    expect(buildSeriesNav(posts, "solo")).toBeNull()
    expect(buildSeriesNav(posts, "plain")).toBeNull()
    expect(buildSeriesNav(posts, "ghost")).toBeNull()
  })
})
