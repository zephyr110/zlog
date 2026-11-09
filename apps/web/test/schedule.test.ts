import { describe, expect, it } from "vitest"
import {
  fromPublishAtUtc,
  isPublic,
  isPublished,
  isScheduled,
  toPublishAtUtc,
} from "@/lib/schedule"

// vitest.config.ts pins TZ=UTC, so local == UTC in these tests.

describe("toPublishAtUtc", () => {
  it("converts a local datetime-local value to the stored format", () => {
    expect(toPublishAtUtc("2026-10-02T09:30")).toBe("2026-10-02 09:30:00")
  })

  it("returns null for empty input (publish immediately)", () => {
    expect(toPublishAtUtc("")).toBeNull()
  })

  it("returns null for garbage instead of an Invalid Date string", () => {
    expect(toPublishAtUtc("not-a-date")).toBeNull()
  })
})

describe("fromPublishAtUtc", () => {
  it("round-trips a stored value back to the input format", () => {
    expect(fromPublishAtUtc("2026-10-02 09:30:00")).toBe("2026-10-02T09:30")
  })

  it("returns an empty string for no schedule", () => {
    expect(fromPublishAtUtc(null)).toBe("")
    expect(fromPublishAtUtc(undefined)).toBe("")
    expect(fromPublishAtUtc("")).toBe("")
  })

  it("returns an empty string for garbage", () => {
    expect(fromPublishAtUtc("nonsense")).toBe("")
  })
})

describe("isScheduled", () => {
  const now = new Date("2026-10-02T12:00:00Z")

  it("is true for a future publish time", () => {
    expect(isScheduled("2026-10-03 00:00:00", now)).toBe(true)
  })

  it("is false once the publish time has passed", () => {
    expect(isScheduled("2026-10-01 00:00:00", now)).toBe(false)
  })

  it("is false for exactly now — the post is live", () => {
    expect(isScheduled("2026-10-02 12:00:00", now)).toBe(false)
  })

  it("is false when there is no schedule", () => {
    expect(isScheduled(null, now)).toBe(false)
    expect(isScheduled(undefined, now)).toBe(false)
  })
})

describe("isPublished", () => {
  it("is true for live posts regardless of visibility", () => {
    expect(isPublished({ draft: false, publishAt: null })).toBe(true)
    expect(
      isPublished({ draft: false, publishAt: "2020-01-01 00:00:00" })
    ).toBe(true)
    const hidden = { draft: false, publishAt: null, visible: false }
    expect(isPublished(hidden)).toBe(true)
  })

  it("is false for drafts and future-scheduled posts", () => {
    expect(isPublished({ draft: true })).toBe(false)
    expect(
      isPublished({ draft: false, publishAt: "2999-01-01 00:00:00" })
    ).toBe(false)
  })
})

describe("isPublic", () => {
  it("treats a missing visible flag as visible", () => {
    expect(isPublic({ draft: false, publishAt: null })).toBe(true)
  })

  it("is false when the post is hidden", () => {
    expect(
      isPublic({ draft: false, publishAt: null, visible: false })
    ).toBe(false)
  })

  it("is false for drafts and future-scheduled posts", () => {
    expect(isPublic({ draft: true, visible: true })).toBe(false)
    expect(
      isPublic({
        draft: false,
        publishAt: "2999-01-01 00:00:00",
        visible: true,
      })
    ).toBe(false)
  })
})
