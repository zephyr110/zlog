// projects 模块全链路：对真实 libsql file: 库跑 SQL（不是 mock）。
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const dir = mkdtempSync(join(tmpdir(), "zlog-projects-"))
process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`
delete process.env.TURSO_SYNC_URL

// env 设好后再 import（getDb 首次使用时缓存 client）
const projects = await import("../src/projects")
const { requireDb } = await import("../src/db")

const base = {
  title: "T",
  description: "",
  repoUrl: "",
  demoUrl: "",
  cover: "",
  tags: [] as string[],
  visible: true,
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("createProject", () => {
  it("新项目置顶（sort_order = MIN-1），默认上架", async () => {
    const a = await projects.createProject({ ...base, title: "first" })
    const b = await projects.createProject({ ...base, title: "second" })
    expect(b.sortOrder).toBeLessThan(a.sortOrder)
    expect(b.visible).toBe(true)
    const list = await projects.listProjects()
    expect(list.map((p) => p.title)).toEqual(["second", "first"])
  })

  it("tags 写入时 trim + 去重 + 保序", async () => {
    const p = await projects.createProject({
      ...base,
      title: "tagged",
      tags: [" Next.js ", "Next.js", "Turso", ""],
    })
    expect(p.tags).toEqual(["Next.js", "Turso"])
  })
})

describe("listVisibleProjects", () => {
  it("过滤 visible = 0", async () => {
    await projects.createProject({ ...base, title: "hidden", visible: false })
    const visible = await projects.listVisibleProjects()
    expect(visible.map((p) => p.title)).not.toContain("hidden")
    const all = await projects.listProjects()
    expect(all.map((p) => p.title)).toContain("hidden")
  })
})

describe("moveProject", () => {
  it("up/down 与相邻交换；首尾 no-op", async () => {
    const list = await projects.listProjects()
    const top = list[0]
    const second = list[1]
    expect(await projects.moveProject(top.id, "down")).toBe(true)
    let after = await projects.listProjects()
    expect(after[0].id).toBe(second.id)
    expect(after[1].id).toBe(top.id)
    // 首行 up 是 no-op
    expect(await projects.moveProject(second.id, "up")).toBe(false)
    // 末行 down 是 no-op
    const last = (await projects.listProjects()).at(-1)!
    expect(await projects.moveProject(last.id, "down")).toBe(false)
    // move 后 sort_order 被规范化为连续 0..n-1
    after = await projects.listProjects()
    expect(after.map((p) => p.sortOrder)).toEqual(after.map((_, i) => i))
  })
})

describe("updateProject / deleteProject", () => {
  it("局部更新保留其他字段并刷新 updated_at 语义", async () => {
    const p = await projects.createProject({ ...base, title: "edit-me", description: "old" })
    const updated = await projects.updateProject(p.id, { title: "edited", visible: false })
    expect(updated?.title).toBe("edited")
    expect(updated?.description).toBe("old")
    expect(updated?.visible).toBe(false)
    expect(await projects.updateProject(99999, { title: "x" })).toBeNull()
  })

  it("delete 返回是否删到", async () => {
    const p = await projects.createProject({ ...base, title: "doomed" })
    expect(await projects.deleteProject(p.id)).toBe(true)
    expect(await projects.deleteProject(p.id)).toBe(false)
  })
})

describe("rowToProject 容错", () => {
  it("坏 JSON / 非数组 tags 读回为 []", async () => {
    const db = requireDb()
    await db.execute({
      sql: "INSERT INTO projects (title, tags, sort_order) VALUES ('bad-json', 'not-json', 999)",
      args: [],
    })
    await db.execute({
      sql: `INSERT INTO projects (title, tags, sort_order) VALUES ('bad-shape', '{"a":1}', 1000)`,
      args: [],
    })
    const all = await projects.listProjects()
    expect(all.find((p) => p.title === "bad-json")?.tags).toEqual([])
    expect(all.find((p) => p.title === "bad-shape")?.tags).toEqual([])
  })
})
