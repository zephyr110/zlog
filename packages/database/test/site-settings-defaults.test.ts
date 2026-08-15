import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const src = readFileSync(join(__dirname, "../src/site-settings.ts"), "utf8")

describe("site settings invert default", () => {
  it("fresh tables default logo_invert_dark to off (colorful built-in mark)", () => {
    expect(src).toMatch(/logo_invert_dark INTEGER NOT NULL DEFAULT 0/)
    expect(src).toMatch(
      /logoInvertDark: patch\.logoInvertDark \?\? existing\?\.logoInvertDark \?\? false/
    )
  })
})
