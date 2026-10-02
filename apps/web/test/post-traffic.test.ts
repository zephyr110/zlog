import { describe, expect, it } from "vitest"
import {
  buildPostTraffic,
  slugFromPostPath,
  sparklinePoints,
} from "@/lib/post-traffic"

describe("slugFromPostPath", () => {
  it("解析文章路径（容忍结尾斜杠）", () => {
    expect(slugFromPostPath("/posts/hello")).toBe("hello")
    expect(slugFromPostPath("/posts/hello/")).toBe("hello")
    expect(slugFromPostPath("/posts/zlog-deployment-guide")).toBe(
      "zlog-deployment-guide"
    )
  })

  it("非文章路径返回 null", () => {
    expect(slugFromPostPath("/")).toBe(null)
    expect(slugFromPostPath("/archive")).toBe(null)
    expect(slugFromPostPath("/posts")).toBe(null)
    expect(slugFromPostPath("/posts/")).toBe(null)
    expect(slugFromPostPath("/posts/a/b")).toBe(null)
    expect(slugFromPostPath("")).toBe(null)
  })
})

const POSTS = [
  { slug: "hello", title: "Hello" },
  { slug: "world", title: "World" },
]

describe("buildPostTraffic", () => {
  const months = ["2026-01", "2026-02", "2026-03"]

  it("按月归组、求和并按总浏览量降序", () => {
    const rows = [
      { month: "2026-01", itemKey: "/posts/hello", users: 5, views: 10 },
      { month: "2026-03", itemKey: "/posts/hello", users: 1, views: 4 },
      { month: "2026-02", itemKey: "/posts/world", users: 2, views: 30 },
    ]
    const out = buildPostTraffic(rows, POSTS, months)
    expect(out.map((e) => e.slug)).toEqual(["world", "hello"])
    const hello = out[1]
    expect(hello.title).toBe("Hello")
    expect(hello.path).toBe("/posts/hello")
    expect(hello.views).toBe(14)
    expect(hello.users).toBe(6)
    // 序列对齐到完整月份窗口：缺档月份补 0
    expect(hello.series).toEqual([
      { month: "2026-01", views: 10 },
      { month: "2026-02", views: 0 },
      { month: "2026-03", views: 4 },
    ])
  })

  it("忽略非文章路径与未知 slug", () => {
    const rows = [
      { month: "2026-01", itemKey: "/", users: 0, views: 99 },
      { month: "2026-01", itemKey: "/archive", users: 0, views: 50 },
      { month: "2026-01", itemKey: "/posts/deleted-post", users: 0, views: 40 },
      { month: "2026-01", itemKey: "/posts/hello", users: 0, views: 3 },
    ]
    const out = buildPostTraffic(rows, POSTS, months)
    expect(out).toHaveLength(1)
    expect(out[0].slug).toBe("hello")
  })

  it("超出窗口的月份行不计入序列但仍计入总量", () => {
    const rows = [
      { month: "2025-12", itemKey: "/posts/hello", users: 0, views: 7 },
      { month: "2026-01", itemKey: "/posts/hello", users: 0, views: 1 },
    ]
    const out = buildPostTraffic(rows, POSTS, months)
    expect(out[0].views).toBe(8)
    expect(out[0].series.reduce((s, p) => s + p.views, 0)).toBe(1)
  })

  it("cap 截断到前 N 篇", () => {
    const rows = months.flatMap((month, i) => [
      { month, itemKey: "/posts/hello", users: 0, views: 10 - i },
      { month, itemKey: "/posts/world", users: 0, views: 20 - i },
    ])
    expect(buildPostTraffic(rows, POSTS, months, 1).map((e) => e.slug)).toEqual(
      ["world"]
    )
  })

  it("空输入返回空数组", () => {
    expect(buildPostTraffic([], POSTS, months)).toEqual([])
  })
})

describe("sparklinePoints", () => {
  it("空序列返回空字符串", () => {
    expect(sparklinePoints([], 80, 24)).toBe("")
  })

  it("单点居中", () => {
    expect(sparklinePoints([5], 80, 24)).toBe("40.0,1.0")
  })

  it("全零序列贴底（不除以零）", () => {
    expect(sparklinePoints([0, 0, 0], 80, 24)).toBe(
      "0.0,23.0 40.0,23.0 80.0,23.0"
    )
  })

  it("峰值顶到 1px 内缩，点数为序列长度", () => {
    const pts = sparklinePoints([0, 10, 5], 80, 24)
    const pairs = pts.split(" ")
    expect(pairs).toHaveLength(3)
    expect(pairs[1]).toBe("40.0,1.0") // 最大值 → y=1
    expect(pairs[0]).toBe("0.0,23.0") // 0 → 底部
  })
})
