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

describe("projects showcase default", () => {
  it("fresh tables default projects_enabled to off (no empty public page)", () => {
    expect(src).toMatch(/projects_enabled INTEGER NOT NULL DEFAULT 0/)
    expect(src).toMatch(
      /projectsEnabled: patch\.projectsEnabled \?\? existing\?\.projectsEnabled \?\? false/
    )
  })
})

describe("theme colors default", () => {
  it("fresh tables default base_color/theme_color to neutral/default", () => {
    expect(src).toMatch(/base_color TEXT NOT NULL DEFAULT 'neutral'/)
    expect(src).toMatch(/theme_color TEXT NOT NULL DEFAULT 'default'/)
  })

  it("upsert 局部合并链与旧行缺列/NULL 兜底", () => {
    expect(src).toMatch(
      /baseColor: patch\.baseColor \?\? existing\?\.baseColor \?\? "neutral"/
    )
    expect(src).toMatch(
      /themeColor: patch\.themeColor \?\? existing\?\.themeColor \?\? "default"/
    )
    expect(src).toMatch(/row\.base_color \?\? "neutral"/)
    expect(src).toMatch(/row\.theme_color \?\? "default"/)
  })
})
