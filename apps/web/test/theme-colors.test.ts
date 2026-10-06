import { describe, it, expect } from "vitest"
import catalog from "@/lib/theme-catalog.json"
import {
  BASE_COLOR_IDS,
  THEME_COLOR_IDS,
  DEFAULT_BASE_COLOR,
  DEFAULT_THEME_COLOR,
  isBaseColorName,
  isThemeColorName,
} from "@/lib/theme-catalog"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { generateThemeCss } from "../scripts/generate-theme-css.mjs"

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
    // 反向断言：JSON 中不得出现目录之外的基准色（防单向漂移）。
    // 排序比较是有意的——JSON 插入顺序与 UI 顺序不同。
    expect(Object.keys(catalog.bases).sort()).toEqual([...BASE_COLOR_IDS].sort())
    // 以 neutral 为参照：其余基准色键集必须逐一相等（仅计数相等不够，
    // 少 radius、多别的键也会被抓到）。
    const referenceLight = Object.keys(catalog.bases.neutral.light).sort()
    const referenceDark = Object.keys(catalog.bases.neutral.dark).sort()
    expect(referenceLight).toHaveLength(32)
    expect(referenceDark).toHaveLength(31)
    for (const id of BASE_COLOR_IDS) {
      const entry = catalog.bases[id]
      expect(Object.keys(entry.light).sort()).toEqual(referenceLight)
      expect(Object.keys(entry.dark).sort()).toEqual(referenceDark)
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
    // 反向断言：JSON 中不得出现目录之外的配色（防单向漂移）。排序比较同上。
    expect(Object.keys(catalog.themes).sort()).toEqual([...accentIds].sort())
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
    expect(isBaseColorName(null)).toBe(false)
    expect(isBaseColorName(42)).toBe(false)
    expect(isThemeColorName("default")).toBe(true)
    expect(isThemeColorName("cyan")).toBe(false)
    expect(isThemeColorName(null)).toBe(false)
    expect(isThemeColorName(42)).toBe(false)
    expect(DEFAULT_BASE_COLOR).toBe("neutral")
    expect(DEFAULT_THEME_COLOR).toBe("default")
  })
})

// 钉值：终审已联网核对 theme-catalog.json 与 shadcn 上游固定提交逐值全等。
// 只钉代表值（每色族 1 个 + rose 暗色特有键 sidebar）——若日后重抓快照时
// 上游静默换色，drift 测试（自洽比对）抓不到，本组断言才会红。
describe("accent 钉值", () => {
  it("代表值逐字（防重抓快照静默换色）", () => {
    expect(catalog.themes.blue.light.primary).toBe("oklch(0.488 0.243 264.376)")
    expect(catalog.themes.blue.dark.primary).toBe("oklch(0.424 0.199 265.638)")
    expect(catalog.themes.violet.light.primary).toBe(
      "oklch(0.491 0.27 292.581)"
    )
    expect(catalog.themes.rose.dark.sidebar).toBe("oklch(0.21 0.006 285.885)")
    expect(catalog.themes.amber.light.primary).toBe("oklch(0.555 0.163 48.998)")
  })
})

const GENERATED_PATH = join(__dirname, "../src/app/theme-colors.generated.css")

describe("生成 CSS：drift 守护与选择器不变式", () => {
  const css = readFileSync(GENERATED_PATH, "utf8")

  it("committed 产物 == 由 committed JSON 重算的输出（drift）", () => {
    expect(css).toBe(generateThemeCss(catalog))
  })

  it("无 default accent 块；五色基准块与七色 accent 块齐备", () => {
    expect(css).not.toContain('data-theme-color="default"')
    for (const id of BASE_COLOR_IDS) {
      expect(css).toContain(`[data-base-color="${id}"]`)
    }
    for (const id of THEME_COLOR_IDS) {
      if (id !== "default") {
        expect(css).toContain(`[data-theme-color="${id}"]`)
      }
    }
  })

  it("双形态选择器逐字（html 形态 + 元素级形态；暗色为后代形态）", () => {
    expect(css).toContain(
      'html[data-base-color="slate"], [data-base-color="slate"] {'
    )
    expect(css).toContain(
      'html.dark[data-base-color="slate"], .dark [data-base-color="slate"] {'
    )
    expect(css).toContain(
      'html[data-theme-color="blue"], [data-theme-color="blue"] {'
    )
    expect(css).toContain(
      'html.dark[data-theme-color="blue"], .dark [data-theme-color="blue"] {'
    )
  })

  it("基准段整体先于 accent 段（重叠键 accent 覆盖）", () => {
    expect(css.indexOf('[data-base-color="slate"]')).toBeLessThan(
      css.indexOf('[data-theme-color="blue"]')
    )
  })

  it("neutral 块不发射 chart-1..5，且除图表键外全量（站点图表色保留在 globals.css）", () => {
    const NEUTRAL_LIGHT = 'html[data-base-color="neutral"], [data-base-color="neutral"]'
    const NEUTRAL_DARK =
      'html.dark[data-base-color="neutral"], .dark [data-base-color="neutral"]'
    const blockOf = (sel: string) => {
      const start = css.indexOf(sel + " {")
      expect(start, `block for: ${sel}`).toBeGreaterThan(-1)
      return css.slice(start, css.indexOf("}", start))
    }
    const light = blockOf(NEUTRAL_LIGHT)
    const dark = blockOf(NEUTRAL_DARK)
    expect(light).not.toMatch(/--chart-[1-5]:/)
    expect(dark).not.toMatch(/--chart-[1-5]:/)
    // 除图表键外全量（键数 = catalog neutral 键数 - 5），防过度剔除
    expect(light.match(/--[a-z-]+:/g)).toHaveLength(
      Object.keys(catalog.bases.neutral.light).length - 5
    )
    expect(dark.match(/--[a-z-]+:/g)).toHaveLength(
      Object.keys(catalog.bases.neutral.dark).length - 5
    )
    // 其余基准色仍全量发射（防止过度剔除）
    expect(blockOf('html[data-base-color="gray"], [data-base-color="gray"]')).toMatch(
      /--chart-1:/
    )
  })
})

const GLOBALS_CSS = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8")

function cssVarsOf(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ])
  )
}

// 站点自有图表色（globals.css 持有；生成 CSS 的 neutral 块不发射，见 Task 3 修订）。
const CHART_SITE_KEYS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]

// JSON 模块类型没有索引签名；按 Record 视图访问（纯类型层，不改断言）。
const NEUTRAL_LIGHT: Record<string, string> = catalog.bases.neutral.light
const NEUTRAL_DARK: Record<string, string> = catalog.bases.neutral.dark
const GRAY_LIGHT: Record<string, string> = catalog.bases.gray.light
const GRAY_DARK: Record<string, string> = catalog.bases.gray.dark

describe("默认零回归（Neutral 与 globals.css :root/.dark 除图表色外全等）", () => {
  const rootBlock = GLOBALS_CSS.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""
  const darkBlock = GLOBALS_CSS.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""
  const rootVars = cssVarsOf(rootBlock)
  const darkVars = cssVarsOf(darkBlock)

  it(":root：除 chart-1..5 外逐键相等（仅允许自定义 --login-glow）", () => {
    expect(rootBlock).not.toBe("")
    for (const [key, value] of Object.entries(catalog.bases.neutral.light)) {
      if (CHART_SITE_KEYS.includes(key)) continue
      expect(rootVars[key]).toBe(value)
    }
    // 差异集合恰为 chart-1..5（不多不少）
    const differing = Object.keys(catalog.bases.neutral.light).filter(
      (k) => rootVars[k] !== NEUTRAL_LIGHT[k]
    )
    expect(differing.sort()).toEqual([...CHART_SITE_KEYS].sort())
    // 站点图表色 == 官方 gray 快照图表值（锁定现行默认观感；上游 gray 若变则此处红）
    for (const k of CHART_SITE_KEYS) {
      expect(rootVars[k]).toBe(GRAY_LIGHT[k])
    }
    expect(
      Object.keys(rootVars).filter((k) => !(k in catalog.bases.neutral.light))
    ).toEqual(["login-glow"])
  })

  it(".dark：同上（差异集合恰为 chart-1..5，图表值 == gray.dark）", () => {
    expect(darkBlock).not.toBe("")
    for (const [key, value] of Object.entries(catalog.bases.neutral.dark)) {
      if (CHART_SITE_KEYS.includes(key)) continue
      expect(darkVars[key]).toBe(value)
    }
    const differing = Object.keys(catalog.bases.neutral.dark).filter(
      (k) => darkVars[k] !== NEUTRAL_DARK[k]
    )
    expect(differing.sort()).toEqual([...CHART_SITE_KEYS].sort())
    for (const k of CHART_SITE_KEYS) {
      expect(darkVars[k]).toBe(GRAY_DARK[k])
    }
    expect(
      Object.keys(darkVars).filter((k) => !(k in catalog.bases.neutral.dark))
    ).toEqual(["login-glow"])
  })
})
