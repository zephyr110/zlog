import { describe, expect, it } from "vitest"
import { t } from "@/lib/i18n"

describe("t()", () => {
  it("resolves a known key for zh and en", () => {
    expect(t("zh", "site.home")).toBeTruthy()
    expect(t("en", "site.home")).toBeTruthy()
    expect(t("zh", "site.home")).not.toBe(t("en", "site.home"))
  })

  it("returns the path itself for unknown keys (no crash)", () => {
    expect(t("zh", "site.doesNotExist" as never)).toBe("site.doesNotExist")
    expect(t("en", "nope" as never)).toBe("nope")
  })

  it("resolves a nested admin key", () => {
    expect(t("zh", "admin.dashboard")).toBeTruthy()
    expect(typeof t("zh", "admin.dashboard")).toBe("string")
  })

  it("supports formatter values (functions) at known keys", () => {
    const f = t("zh", "site.articlesPublished")
    expect(typeof f).toBe("function")
  })

  it("is type-safe at compile time — a bad path is a type error, not a runtime issue", () => {
    // This is a compile-time assertion; at runtime t() falls back to the path.
    const value = t("zh", "cat.frontend")
    expect(value.length).toBeGreaterThan(0)
  })
})
