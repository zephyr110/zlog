import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  upsertMonthlyAnalytics,
  listArchivedMonths,
  earliestArchivedMonth,
  aggregateMonthlyAnalytics,
} from "../src/analytics"

// 用真实 libsql file: 数据库跑归档模块 —— requireDb 惰性读
// TURSO_DATABASE_URL，每个测试进程一块独立临时库，不碰真实数据。
let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zlog-analytics-test-"))
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("analytics_monthly 归档", () => {
  it("upsert 幂等：重跑同月覆盖而非翻倍", async () => {
    const dims = [
      { dimension: "pages", rows: [{ itemKey: "/", users: 0, views: 120 }] },
      { dimension: "sources", rows: [{ itemKey: "Direct", users: 80, views: 0 }] },
    ]
    await upsertMonthlyAnalytics("ga", "2026-06", dims)
    await upsertMonthlyAnalytics("ga", "2026-06", dims) // 重跑
    const agg = await aggregateMonthlyAnalytics("ga", "2026-06", "2026-06")
    expect(agg.get("pages")).toEqual([
      { itemKey: "/", users: 0, views: 120 },
    ])
    expect(agg.get("sources")).toEqual([
      { itemKey: "Direct", users: 80, views: 0 },
    ])
  })

  it("聚合跨月求和，条目按 users 降序", async () => {
    await upsertMonthlyAnalytics("ga", "2026-05", [
      { dimension: "sources", rows: [{ itemKey: "Google", users: 40, views: 0 }] },
    ])
    await upsertMonthlyAnalytics("ga", "2026-06", [
      { dimension: "sources", rows: [{ itemKey: "Google", users: 60, views: 0 }] },
    ])
    await upsertMonthlyAnalytics("ga", "2026-06", [
      { dimension: "sources", rows: [{ itemKey: "Bing", users: 99, views: 0 }] },
    ])
    const agg = await aggregateMonthlyAnalytics("ga", "2026-05", "2026-06")
    // 跨月求和 + users 降序；含测试 1 写入的 Direct(80)
    expect(agg.get("sources")).toEqual([
      { itemKey: "Google", users: 100, views: 0 },
      { itemKey: "Bing", users: 99, views: 0 },
      { itemKey: "Direct", users: 80, views: 0 },
    ])
  })

  it("listArchivedMonths 升序去重；earliestArchivedMonth 取最早", async () => {
    const months = await listArchivedMonths("ga")
    expect(months).toEqual(["2026-05", "2026-06"])
    expect(await earliestArchivedMonth("ga")).toBe("2026-05")
    // 另一个来源没有归档 → null（picker 下界无约束）
    expect(await earliestArchivedMonth("vercel")).toBeNull()
  })

  it("来源隔离：vercel 归档不污染 ga", async () => {
    await upsertMonthlyAnalytics("vercel", "2026-07", [
      { dimension: "pages", rows: [{ itemKey: "/", users: 0, views: 9 }] },
    ])
    expect(await listArchivedMonths("vercel")).toEqual(["2026-07"])
    const aggGa = await aggregateMonthlyAnalytics("ga", "2026-05", "2026-07")
    expect(aggGa.get("pages")).toEqual([
      { itemKey: "/", users: 0, views: 120 },
    ])
  })

  it("空 dimensions 无副作用（不写库不报错）", async () => {
    await expect(
      upsertMonthlyAnalytics("ga", "2026-08", [])
    ).resolves.toBeUndefined()
    expect(await listArchivedMonths("ga")).toEqual(["2026-05", "2026-06"])
  })
})
