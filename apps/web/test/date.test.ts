import { describe, expect, it } from "vitest"
import {
  formatLocalDate,
  formatUtcDateTime,
  groupPostsByUtcYear,
  parseUtcDate,
  toUtcTimestamp,
} from "@/lib/date"

describe("parseUtcDate", () => {
  it("parses YYYY-MM-DD as UTC midnight", () => {
    const d = parseUtcDate("2026-01-15")
    expect(d.toISOString()).toBe("2026-01-15T00:00:00.000Z")
  })
})

describe("formatLocalDate", () => {
  it("pads month and day", () => {
    expect(formatLocalDate(new Date("2026-01-05T10:00:00Z"))).toMatch(/^2026-01-0\d$/)
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("formatUtcDateTime", () => {
  it("converts a SQLite UTC datetime to a local calendar date", () => {
    // 2026-06-15T23:30:00Z — same local date everywhere except extreme
    // timezones; assert it returns a YYYY-MM-DD string at least.
    expect(formatUtcDateTime("2026-06-15 23:30:00")).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("falls back to the raw date portion for unparseable input", () => {
    expect(formatUtcDateTime("not-a-date")).toBe("not-a-date".slice(0, 10))
  })
})

describe("toUtcTimestamp", () => {
  it("expands a day to its UTC window", () => {
    expect(toUtcTimestamp("2026-03-01", false)).toBe("2026-03-01 00:00:00")
    expect(toUtcTimestamp("2026-03-01", true)).toBe("2026-03-01 23:59:59")
  })

  it("returns undefined for invalid input", () => {
    expect(toUtcTimestamp("", false)).toBeUndefined()
    expect(toUtcTimestamp("2026-13-99", false)).toBeUndefined()
  })
})

describe("groupPostsByUtcYear", () => {
  const posts = [
    { slug: "a", date: "2026-01-01" },
    { slug: "b", date: "2025-12-31" },
    { slug: "c", date: "2026-06-15" },
    { slug: "d", date: "garbage" },
  ]

  it("groups by the authored UTC year, skipping invalid dates", () => {
    const groups = groupPostsByUtcYear(posts)
    const byYear = new Map(groups)
    expect(byYear.get(2026)!.map((p) => p.slug).sort()).toEqual(["a", "c"])
    expect(byYear.get(2025)!.map((p) => p.slug)).toEqual(["b"])
    expect(byYear.has(NaN)).toBe(false)
  })

  it("sorts years ascending/descending on request", () => {
    expect(groupPostsByUtcYear(posts, { sortYears: "desc" }).map(([y]) => y)).toEqual([2026, 2025])
    expect(groupPostsByUtcYear(posts, { sortYears: "asc" }).map(([y]) => y)).toEqual([2025, 2026])
  })

  it("keeps first-seen order by default", () => {
    const years = groupPostsByUtcYear(posts).map(([y]) => y)
    // First-seen: 2026 (a), then 2025 (b), then 2026 again (c) — c joins
    // the existing 2026 group, so order is [2026, 2025].
    expect(years).toEqual([2026, 2025])
  })
})
