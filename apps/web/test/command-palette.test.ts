import { describe, expect, it } from "vitest"
import {
  filterPaletteItems,
  groupPaletteItems,
  matchesPaletteQuery,
  stepActiveIndex,
  type PaletteItem,
} from "@/lib/command-palette"

const nav: PaletteItem = {
  id: "nav-posts",
  group: "nav",
  label: "文章",
  keywords: ["posts", "articles"],
}
const action: PaletteItem = {
  id: "action-theme",
  group: "action",
  label: "切换到深色主题",
  keywords: ["theme", "dark"],
}
const post = (n: number, title = `Post ${n}`): PaletteItem => ({
  id: `post-${n}`,
  group: "posts",
  label: title,
  hint: `post-${n}`,
})

describe("matchesPaletteQuery", () => {
  it("空查询全通过", () => {
    expect(matchesPaletteQuery(nav, "")).toBe(true)
    expect(matchesPaletteQuery(nav, "   ")).toBe(true)
  })

  it("大小写不敏感，命中 label / hint / keywords", () => {
    expect(matchesPaletteQuery(nav, "文章")).toBe(true)
    expect(matchesPaletteQuery(nav, "POSTS")).toBe(true)
    expect(matchesPaletteQuery(post(1), "post-1")).toBe(true)
    expect(matchesPaletteQuery(nav, "missing")).toBe(false)
  })

  it("多词 AND 匹配", () => {
    expect(matchesPaletteQuery(action, "主题 dark")).toBe(true)
    expect(matchesPaletteQuery(action, "主题 light")).toBe(false)
  })
})

describe("filterPaletteItems", () => {
  it("保留输入顺序且 posts 组单独截断", () => {
    const items = [nav, action, ...Array.from({ length: 12 }, (_, i) => post(i))]
    const out = filterPaletteItems(items, "", 8)
    expect(out[0]).toBe(nav)
    expect(out[1]).toBe(action)
    expect(out.filter((i) => i.group === "posts")).toHaveLength(8)
    expect(out.filter((i) => i.group === "posts")[0].id).toBe("post-0")
  })

  it("过滤后计数不含未命中项", () => {
    const items = [nav, post(1, "Hello"), post(2, "World"), post(3, "Hello again")]
    const out = filterPaletteItems(items, "hello", 1)
    expect(out.map((i) => i.id)).toEqual(["post-1"])
  })
})

describe("groupPaletteItems", () => {
  it("固定顺序 nav → action → posts，空组省略", () => {
    const groups = groupPaletteItems([post(1), nav, action])
    expect(groups.map((g) => g.group)).toEqual(["nav", "action", "posts"])

    const onlyPosts = groupPaletteItems([post(1)])
    expect(onlyPosts.map((g) => g.group)).toEqual(["posts"])
  })
})

describe("stepActiveIndex", () => {
  it("双向循环", () => {
    expect(stepActiveIndex(0, 1, 3)).toBe(1)
    expect(stepActiveIndex(2, 1, 3)).toBe(0)
    expect(stepActiveIndex(0, -1, 3)).toBe(2)
  })

  it("未选中时从两端进入", () => {
    expect(stepActiveIndex(-1, 1, 3)).toBe(0)
    expect(stepActiveIndex(-1, -1, 3)).toBe(2)
  })

  it("无结果保持 -1", () => {
    expect(stepActiveIndex(-1, 1, 0)).toBe(-1)
    expect(stepActiveIndex(2, 1, 0)).toBe(-1)
  })
})
