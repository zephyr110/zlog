// 主题配色目录 — 类型、守卫与 UI 选项列表。
// 色值数据在 theme-catalog.json（shadcn 官方快照，见其 source 字段）；
// 生成器 scripts/generate-theme-css.mjs 直接从 JSON 读值，本文件只管 id。

export const BASE_COLORS = [
  { id: "neutral", label: "Neutral" },
  { id: "gray", label: "Gray" },
  { id: "zinc", label: "Zinc" },
  { id: "stone", label: "Stone" },
  { id: "slate", label: "Slate" },
] as const

export type BaseColorName = (typeof BASE_COLORS)[number]["id"]

export const THEME_COLORS = [
  { id: "default", label: "Default" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "violet", label: "Violet" },
  { id: "rose", label: "Rose" },
  { id: "orange", label: "Orange" },
  { id: "teal", label: "Teal" },
  { id: "amber", label: "Amber" },
] as const

export type ThemeColorName = (typeof THEME_COLORS)[number]["id"]

/** 从目录派生的 id 数组（zod 枚举与守卫共用）——新增颜色只改这一处。 */
export const BASE_COLOR_IDS = BASE_COLORS.map((c) => c.id) as [
  BaseColorName,
  ...BaseColorName[],
]
export const THEME_COLOR_IDS = THEME_COLORS.map((c) => c.id) as [
  ThemeColorName,
  ...ThemeColorName[],
]

export const DEFAULT_BASE_COLOR: BaseColorName = "neutral"
export const DEFAULT_THEME_COLOR: ThemeColorName = "default"

export function isBaseColorName(value: unknown): value is BaseColorName {
  return (
    typeof value === "string" &&
    (BASE_COLOR_IDS as readonly string[]).includes(value)
  )
}

export function isThemeColorName(value: unknown): value is ThemeColorName {
  return (
    typeof value === "string" &&
    (THEME_COLOR_IDS as readonly string[]).includes(value)
  )
}
