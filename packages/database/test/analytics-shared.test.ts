import { describe, it, expect } from "vitest"
// analytics-shared 是 client-safe 纯函数文件（无 node: / 无 import），
// 直接跨包引用即可单测归档/合并逻辑。月份用相对当前日期构造，避免
// 测试随真实日历过期。
import {
  addMonths,
  currentMonthKey,
  daysBetween,
  dbAggToParts,
  mergeParts,
  mergeRowLists,
  minusDays,
  monthEndDay,
  monthKey,
  monthOfDay,
  monthSnapRange,
  monthStartDay,
  monthsBetween,
  todayKey,
  type AnalyticsReport,
} from "../../apps/web/src/lib/analytics-shared"

const cur = currentMonthKey()
const last = addMonths(cur, -1)
const twoAgo = addMonths(cur, -2)
const threeAgo = addMonths(cur, -3)

const FALLBACK = { start: minusDays(todayKey(), 29), end: todayKey() }

describe("月历工具（UTC 字符串）", () => {
  it("monthKey / addMonths / start / end", () => {
    expect(monthKey(new Date("2026-08-17T00:00:00Z"))).toBe("2026-08")
    expect(addMonths(cur, -1)).toBe(last)
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(addMonths("2026-12", 1)).toBe("2027-01")
    expect(monthStartDay(cur)).toBe(`${cur}-01`)
    expect(monthEndDay(cur)).toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/)
    expect(monthEndDay("2026-02")).toBe("2026-02-28")
    expect(monthEndDay("2028-02")).toBe("2028-02-29")
    expect(monthOfDay(`${cur}-17`)).toBe(cur)
  })

  it("todayKey / minusDays / daysBetween / monthsBetween", () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(minusDays(todayKey(), 29)).toBe(FALLBACK.start)
    expect(daysBetween("2026-08-01", "2026-08-01")).toBe(1)
    expect(daysBetween("2026-08-01", "2026-08-31")).toBe(31)
    expect(monthsBetween(twoAgo, cur)).toEqual([twoAgo, last, cur])
  })
})

describe("monthSnapRange（覆盖窗口 + 缺失月份）", () => {
  it("custom：起点钳到月初，终点保留日精度", () => {
    const { effective, missingMonths } = monthSnapRange(
      "custom",
      { start: `${twoAgo}-10`, end: `${cur}-10` },
      [twoAgo, last],
      FALLBACK
    )
    expect(effective).toEqual({ start: monthStartDay(twoAgo), end: `${cur}-10` })
    // 当月(cur)永远实时不算缺失；twoAgo/last 已归档 → 无缺失
    expect(missingMonths).toEqual([])
  })

  it("custom：未归档的过去月份进 missingMonths", () => {
    const { missingMonths } = monthSnapRange(
      "custom",
      { start: monthStartDay(threeAgo), end: `${cur}-10` },
      [last],
      FALLBACK
    )
    expect(missingMonths).toEqual([threeAgo, twoAgo])
  })

  it("custom：knownEmpty 的月份不算缺失（GA 空月跳过）", () => {
    const { missingMonths } = monthSnapRange(
      "custom",
      { start: monthStartDay(threeAgo), end: `${cur}-10` },
      [last],
      FALLBACK,
      [threeAgo]
    )
    expect(missingMonths).toEqual([twoAgo])
  })

  it("custom 缺 from/to（防御）：回退默认窗口", () => {
    const { effective, missingMonths } = monthSnapRange(
      "custom",
      null,
      [],
      FALLBACK
    )
    expect(effective).toEqual(FALLBACK)
    expect(missingMonths).toEqual([])
  })

  it("all：从最早归档月起，到今日；中间未归档月进 missingMonths", () => {
    const { effective, missingMonths } = monthSnapRange(
      "all",
      null,
      [twoAgo, cur],
      FALLBACK
    )
    expect(effective).toEqual({ start: monthStartDay(twoAgo), end: todayKey() })
    // twoAgo 到上个月(last)之间未归档的月份：twoAgo 有，last 无 → 缺 last
    expect(missingMonths).toEqual([last])
  })

  it("all：还没归档任何月份 → 回退默认窗口且无缺失", () => {
    const { effective, missingMonths } = monthSnapRange("all", null, [], FALLBACK)
    expect(effective).toEqual(FALLBACK)
    expect(missingMonths).toEqual([])
  })
})

describe("mergeRowLists / dbAggToParts / mergeParts", () => {
  it("mergeRowLists：按键合并、求和、排序、截断", () => {
    const a = [
      { key: "A", users: 5, views: 2 },
      { key: "B", users: 3, views: 9 },
    ]
    const b = [{ key: "A", users: 7, views: 1 }]
    expect(mergeRowLists([a, b], (r) => r.key, 10)).toEqual([
      { key: "A", users: 12, views: 3 },
      { key: "B", users: 3, views: 9 },
    ])
    // 按 views 排序 + cap
    expect(mergeRowLists([a, b], (r) => r.key, 1, "views")).toEqual([
      { key: "B", users: 3, views: 9 },
    ])
  })

  it("dbAggToParts：国家复合键拆回 id|name", () => {
    const agg = new Map([
      [
        "countries",
        [
          { itemKey: "CN|China", users: 10, views: 0 },
          { itemKey: "US|United States", users: 4, views: 0 },
        ],
      ],
      ["pages", [{ itemKey: "/", users: 0, views: 88 }]],
    ])
    const parts = dbAggToParts(agg)
    expect(parts.countries).toEqual([
      { countryId: "CN", country: "China", users: 10 },
      { countryId: "US", country: "United States", users: 4 },
    ])
    expect(parts.topPages).toEqual([{ path: "/", views: 88 }])
  })

  it("mergeParts：DB + 当月 live 合并，国家按 countryId 折叠（归档名保留）", () => {
    const db = dbAggToParts(
      new Map([
        ["countries", [{ itemKey: "CN|China", users: 8, views: 0 }]],
        ["sources", [{ itemKey: "Direct", users: 30, views: 0 }]],
      ])
    )
    const live: AnalyticsReport = {
      configured: true,
      source: "ga",
      range: "custom",
      customRange: { start: monthStartDay(cur), end: todayKey() },
      availableFrom: monthStartDay(twoAgo),
      missingMonths: [],
      totals: { activeUsers: 12, screenPageViews: 50 },
      topPages: [],
      sources: [{ source: "Direct", users: 5 }],
      devices: [],
      browsers: [],
      operatingSystems: [],
      countries: [{ countryId: "CN", country: "中国", users: 3 }],
    }
    const merged = mergeParts(db, live)
    // 合并按键求和；名称取先处理的一方（归档行）—— 同语言下 GA 名称一致
    expect(merged.countries).toEqual([
      { countryId: "CN", country: "China", users: 11 },
    ])
    expect(merged.sources).toEqual([{ source: "Direct", users: 35 }])
  })

  it("mergeParts 无 live 时纯 DB 数据", () => {
    const db = dbAggToParts(
      new Map([["pages", [{ itemKey: "/", users: 0, views: 88 }]]])
    )
    expect(mergeParts(db, null).topPages).toEqual([{ path: "/", views: 88 }])
  })
})
