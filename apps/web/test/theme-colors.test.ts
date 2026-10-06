import { describe, it, expect } from "vitest"
import catalog from "../src/lib/theme-catalog.json"
import {
  BASE_COLOR_IDS,
  THEME_COLOR_IDS,
  DEFAULT_BASE_COLOR,
  DEFAULT_THEME_COLOR,
  isBaseColorName,
  isThemeColorName,
} from "../src/lib/theme-catalog"

const ACCENT_KEYS = [
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar-primary",
  "sidebar-primary-foreground",
]

describe("配色目录完整性", () => {
  it("基准色 = 经典 5 色，亮 32 键 / 暗 31 键", () => {
    expect(BASE_COLOR_IDS).toEqual(["neutral", "gray", "zinc", "stone", "slate"])
    for (const id of BASE_COLOR_IDS) {
      const entry = catalog.bases[id]
      expect(Object.keys(entry.light)).toHaveLength(32)
      expect(Object.keys(entry.dark)).toHaveLength(31)
    }
  })

  it("主题色 = Default + 精选 7 色（UI 顺序）", () => {
    expect(THEME_COLOR_IDS).toEqual([
      "default",
      "blue",
      "green",
      "violet",
      "rose",
      "orange",
      "teal",
      "amber",
    ])
  })

  it("accent 覆盖集 = 官方 11 键（rose 暗色 12 键，原样保真）", () => {
    const accentIds = THEME_COLOR_IDS.filter((id) => id !== "default")
    expect(accentIds).toHaveLength(7)
    for (const id of accentIds) {
      const theme = (
        catalog.themes as Record<string, { light: object; dark: object }>
      )[id]
      expect(Object.keys(theme.light).sort()).toEqual([...ACCENT_KEYS].sort())
      const expectedDark =
        id === "rose" ? [...ACCENT_KEYS, "sidebar"] : ACCENT_KEYS
      expect(Object.keys(theme.dark).sort()).toEqual([...expectedDark].sort())
    }
  })

  it("守卫与默认值", () => {
    expect(isBaseColorName("slate")).toBe(true)
    expect(isBaseColorName("mauve")).toBe(false)
    expect(isBaseColorName(undefined)).toBe(false)
    expect(isThemeColorName("default")).toBe(true)
    expect(isThemeColorName("cyan")).toBe(false)
    expect(DEFAULT_BASE_COLOR).toBe("neutral")
    expect(DEFAULT_THEME_COLOR).toBe("default")
  })
})
