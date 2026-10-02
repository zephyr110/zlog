import { describe, expect, it } from "vitest"
import { publishingStreaks } from "@/lib/streak"

const TODAY = "2026-10-02"

describe("publishingStreaks", () => {
  it("returns zeros for an empty history", () => {
    expect(publishingStreaks([], TODAY)).toEqual({
      current: 0,
      longest: 0,
      activeDays: 0,
    })
  })

  it("counts a single post today", () => {
    expect(publishingStreaks([TODAY], TODAY)).toEqual({
      current: 1,
      longest: 1,
      activeDays: 1,
    })
  })

  it("counts multiple posts on one day as one active day", () => {
    const s = publishingStreaks([TODAY, TODAY, `${TODAY}T08:00:00Z`], TODAY)
    expect(s.activeDays).toBe(1)
    expect(s.current).toBe(1)
  })

  it("counts a run ending today", () => {
    const s = publishingStreaks(
      ["2026-09-30", "2026-10-01", TODAY],
      TODAY
    )
    expect(s.current).toBe(3)
    expect(s.longest).toBe(3)
  })

  it("keeps a run ending yesterday alive (grace period)", () => {
    const s = publishingStreaks(["2026-09-30", "2026-10-01"], TODAY)
    expect(s.current).toBe(2)
  })

  it("zeroes current when the newest day is two days old", () => {
    const s = publishingStreaks(
      ["2026-09-28", "2026-09-29", "2026-09-30"],
      TODAY
    )
    expect(s.current).toBe(0)
    expect(s.longest).toBe(3)
    expect(s.activeDays).toBe(3)
  })

  it("reports the longest run, not the newest run", () => {
    const s = publishingStreaks(
      [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-10-01",
        TODAY,
      ],
      TODAY
    )
    expect(s.longest).toBe(4)
    expect(s.current).toBe(2)
  })

  it("is order-independent", () => {
    const unordered = [TODAY, "2026-09-30", "2026-10-01"]
    expect(publishingStreaks(unordered, TODAY).current).toBe(3)
  })

  it("crosses month boundaries", () => {
    const s = publishingStreaks(["2026-01-31", "2026-02-01"], "2026-02-01")
    expect(s.longest).toBe(2)
  })

  it("crosses year boundaries", () => {
    const s = publishingStreaks(["2025-12-31", "2026-01-01"], "2026-01-01")
    expect(s.longest).toBe(2)
  })

  it("treats a leap day as a normal consecutive day", () => {
    const s = publishingStreaks(
      ["2028-02-28", "2028-02-29", "2028-03-01"],
      "2028-03-01"
    )
    expect(s.longest).toBe(3)
    expect(s.current).toBe(3)
  })

  it("accepts full timestamps (takes the date part)", () => {
    const s = publishingStreaks(
      ["2026-10-01T23:59:59Z", "2026-10-02T00:00:01Z"],
      TODAY
    )
    expect(s.current).toBe(2)
  })

  it("ignores entries that are not dates", () => {
    const s = publishingStreaks(["garbage", "", "2026-10-02"], TODAY)
    expect(s.activeDays).toBe(1)
    expect(s.current).toBe(1)
  })

  it("does not let a pre-dated (future) post zero out current", () => {
    // Author wrote yesterday and today, and pre-dated one for tomorrow.
    const s = publishingStreaks(
      ["2026-10-01", TODAY, "2026-10-03"],
      TODAY
    )
    expect(s.current).toBe(2)
    // The pre-dated post still extends the longest run.
    expect(s.longest).toBe(3)
    expect(s.activeDays).toBe(3)
  })

  it("reports zero current when every post is future-dated", () => {
    const s = publishingStreaks(["2026-10-05", "2026-10-06"], TODAY)
    expect(s.current).toBe(0)
    expect(s.longest).toBe(2)
  })

  it("counts a run broken by a gap correctly", () => {
    const s = publishingStreaks(
      ["2026-09-27", "2026-09-28", "2026-09-30", TODAY],
      TODAY
    )
    expect(s.longest).toBe(2)
    expect(s.current).toBe(1)
  })
})
