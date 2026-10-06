# 主题配色（Base Color + Theme Color）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台「外观」面板选择 shadcn 基准色（经典 5 色）× 主题色（Default + 精选 7 色），保存后前台与后台全部页面即时应用；默认组合（Neutral + Default）零视觉回归。

**Architecture:** 官方配色快照入仓（JSON 单一数据源）→ Node 生成器产出静态 CSS（`data-*` 属性选择器，SSR 直出、零运行时 JS、零闪烁）→ 设置经 Turso 持久化，沿用现有 site-config 缓存 / revalidate 链路。

**Tech Stack:** Next.js 16 App Router（Turbopack）、Tailwind v4、shadcn/Base UI、vitest、Turso（libsql）、zod v4、pnpm workspaces。

**Spec:** `docs/superpowers/specs/2026-10-06-theme-colors-design.md`（已修订：neutral 块入生成 CSS + 预览色板元素级作用域）

---

## 环境注意（执行前必读）

- 仓库根：`/Users/zephyr/Code/zlog`。所有命令在仓库根执行（`pnpm --filter` 会在包目录内跑脚本，与 cwd 无关的脚本内部用 `import.meta.url` 定位文件）。
- **pre-commit 钩子**会自动跑 lint + typecheck + 三个工作区全部测试（web 245 / database 51 / desktop 181），每次提交耗时可能较长，属正常；**绝不使用 `--no-verify`**。
- 提交信息**不加 Co-Authored-By** 行。
- **不推送**：所有提交仅落本地；推送 main 需用户当次明确授权。
- 用户在 `:3000` 跑着 dev server（不要 kill）；Bash 的 cwd 可能漂移，命令一律显式 `cd /Users/zephyr/Code/zlog`。
- macOS 上 `ls` 是别名（用 `\ls`）；线上核验别给 `/posts/x` 加尾斜杠。
- 单元测试命令：
  - web 全量：`pnpm --filter @zlog/web test`
  - web 单文件：`pnpm --filter @zlog/web test theme-colors`（vitest 按文件名过滤）
  - database：`pnpm --filter @zlog/database test site-settings-defaults`

## File Structure

**新增：**

| 文件 | 职责 |
|---|---|
| `apps/web/src/lib/theme-catalog.json` | shadcn 官方配色快照（5 基准 × 32/31 键 + 7 accent × 11 键），唯一数据源 |
| `apps/web/src/lib/theme-catalog.ts` | id 列表 / 类型 / 守卫 / 默认值（不含色值，色值只在 JSON） |
| `apps/web/scripts/generate-theme-css.mjs` | 生成器：JSON → 静态 CSS（纯函数导出供测试；main 检测才写文件） |
| `apps/web/src/app/theme-colors.generated.css` | 生成产物（提交入仓；构建不依赖生成器） |
| `apps/web/src/lib/site-settings-schema.ts` | PUT 载荷 zod schema（从 route.ts 拆出——Next 不允许 route 文件额外导出，测试直引此模块） |
| `apps/web/src/components/admin/appearance-form.tsx` | 「外观」面板：两组活预览色板 + 保存 |
| `apps/web/test/theme-colors.test.ts` | 目录完整性 / drift 守护 / 默认零回归 / 选择器不变式 |
| `apps/web/test/site-settings-theme.test.ts` | `siteConfigFromRow` 兜底 + `updateSchema` 枚举校验 |

**修改：**

| 文件 | 改动 |
|---|---|
| `packages/database/src/site-settings.ts` | 两列 + 幂等 ALTER + record/rowToRecord/upsert |
| `packages/database/test/site-settings-defaults.test.ts` | 默认值静态断言增补 |
| `apps/web/src/lib/site-config.ts` | `SiteConfig` 两字段 + `defaultSiteConfig` |
| `apps/web/src/lib/get-site-config.ts` | DTO / row 映射 / 缓存 / `?? default` 兜底 |
| `apps/web/src/components/layout/site-config-provider.tsx` | `refreshSiteConfig` 携带两字段 |
| `apps/web/src/app/api/site-settings/route.ts` | 引用拆出的 schema；`dbPatch` 与首存分支带两字段 |
| `apps/web/src/app/layout.tsx` | import 生成 CSS + `<html>` 直出 `data-*` 属性 |
| `apps/web/src/components/admin/settings-dialog.tsx` | 「外观」面板接入 |
| `apps/web/src/lib/i18n/admin.ts` | 10 个新键 × zh/en |
| `apps/web/package.json` | `generate:theme` 脚本 |

---

### Task 1: 官方配色快照 → `theme-catalog.json`

**Files:**
- Create: `apps/web/scripts/fetch-theme-catalog.mjs`（一次性脚本，跑完删除）
- Create: `apps/web/src/lib/theme-catalog.json`（提交入仓）

- [ ] **Step 1: 写抓取脚本**

创建 `apps/web/scripts/fetch-theme-catalog.mjs`：

```js
// 一次性抓取脚本 — 生成 src/lib/theme-catalog.json（shadcn 官方配色快照）。
// 用法（仓库根）：node apps/web/scripts/fetch-theme-catalog.mjs
// 完成后删除本脚本；目录需要更新时按同样流程重跑。
//
// 来源（pin 到 commit，防上游漂移）：
// - 基准色：apps/v4/public/r/colors/{name}.json 的 cssVarsV4
// - accent：apps/v4/registry/themes.ts（RegistryItem 列表）

import { writeFileSync } from "node:fs"

const COMMIT = "7ff7dbf8669fa3392c294ee745dc8d8c3cee842c" // shadcn-ui/ui main @ 2026-10-06
const RAW = `https://raw.githubusercontent.com/shadcn-ui/ui/${COMMIT}`
const OUT = new URL("../src/lib/theme-catalog.json", import.meta.url)

const BASE_NAMES = ["neutral", "gray", "zinc", "stone", "slate"]
const ACCENT_NAMES = ["blue", "green", "violet", "rose", "orange", "teal", "amber"]

async function getText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

function expectKeys(obj, n, label) {
  const got = Object.keys(obj).length
  if (got !== n) throw new Error(`${label}: expected ${n} keys, got ${got}`)
}

// 1. 基准色 — 全量 cssVarsV4 快照（亮 32 键 / 暗 31 键，暗色无 radius）
const bases = {}
for (const name of BASE_NAMES) {
  const json = JSON.parse(
    await getText(`${RAW}/apps/v4/public/r/colors/${name}.json`)
  )
  const v4 = json.cssVarsV4
  if (!v4) throw new Error(`${name}: cssVarsV4 missing`)
  expectKeys(v4.light, 32, `${name}.light`)
  expectKeys(v4.dark, 31, `${name}.dark`)
  bases[name] = { light: v4.light, dark: v4.dark }
}

// 2. accent 主题 — 解析 themes.ts（每条目：name + cssVars.light/dark）
const src = await getText(`${RAW}/apps/v4/registry/themes.ts`)
const blocks = src.split(/\n  \{\n/).slice(1)
const themes = {}
for (const block of blocks) {
  const name = block.match(/name: "([a-z-]+)"/)?.[1]
  if (!ACCENT_NAMES.includes(name)) continue
  const [lightSrc, darkSrc = ""] = block.split("      dark: {")
  const parse = (s) =>
    Object.fromEntries(
      [...s.matchAll(/^        "?([a-z0-9-]+)"?: "([^"]+)"/gm)].map((m) => [
        m[1],
        m[2],
      ])
    )
  const light = parse(lightSrc)
  const dark = parse(darkSrc)
  expectKeys(light, 11, `${name}.light`)
  // rose 暗色官方额外覆盖 sidebar（12 键），原样保真
  expectKeys(dark, name === "rose" ? 12 : 11, `${name}.dark`)
  themes[name] = { light, dark }
}
for (const name of ACCENT_NAMES) {
  if (!themes[name]) throw new Error(`accent ${name}: not found in themes.ts`)
}

const catalog = {
  source: {
    commit: COMMIT,
    bases: `${RAW}/apps/v4/public/r/colors/{name}.json (cssVarsV4)`,
    themes: `${RAW}/apps/v4/registry/themes.ts`,
    fetchedAt: "2026-10-06",
  },
  bases,
  themes,
}

writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n")
console.log(
  "theme-catalog.json written: 5 bases (32 light / 31 dark) + " +
    "7 accents (11 keys; rose dark 12)"
)
```

- [ ] **Step 2: 运行脚本**

```bash
cd /Users/zephyr/Code/zlog
node apps/web/scripts/fetch-theme-catalog.mjs
```

Expected: 打印 `theme-catalog.json written: 5 bases (32 light / 31 dark) + 7 accents (11 keys; rose dark 12)`，无异常。（任何 `expected N keys, got M` 报错都说明上游漂移——停下来报告，不要手改脚本凑数。）

- [ ] **Step 3: 点位核验**

```bash
cd /Users/zephyr/Code/zlog
node -e '
const c = require("./apps/web/src/lib/theme-catalog.json");
console.log(c.bases.neutral.light.background);   // oklch(1 0 0)
console.log(c.bases.neutral.dark.background);    // oklch(0.145 0 0)
console.log(c.themes.blue.light.primary);        // oklch(0.488 0.243 264.376)
console.log(c.themes.blue.dark.primary);         // oklch(0.424 0.199 265.638)
console.log(Object.keys(c.themes.rose.dark).length); // 12
'
```

Expected（逐行）：

```
oklch(1 0 0)
oklch(0.145 0 0)
oklch(0.488 0.243 264.376)
oklch(0.424 0.199 265.638)
12
```

- [ ] **Step 4: 删除一次性脚本**

```bash
cd /Users/zephyr/Code/zlog
rm apps/web/scripts/fetch-theme-catalog.mjs
```

- [ ] **Step 5: 提交**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/src/lib/theme-catalog.json
git commit -m "feat(web): 引入 shadcn 官方配色快照 theme-catalog.json"
```

---

### Task 2: 目录类型与访问器 `theme-catalog.ts`

**Files:**
- Create: `apps/web/test/theme-colors.test.ts`
- Create: `apps/web/src/lib/theme-catalog.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/test/theme-colors.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test theme-colors
```

Expected: FAIL — 无法解析 `../src/lib/theme-catalog`（模块不存在）。

- [ ] **Step 3: 写实现**

创建 `apps/web/src/lib/theme-catalog.ts`：

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test theme-colors
```

Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/test/theme-colors.test.ts apps/web/src/lib/theme-catalog.ts
git commit -m "feat(web): 主题配色目录类型与访问器（含完整性测试）"
```

---

### Task 3: 生成器 + 静态 CSS + drift 守护

**Files:**
- Create: `apps/web/scripts/generate-theme-css.mjs`
- Create: `apps/web/src/app/theme-colors.generated.css`（运行生成器产出）
- Modify: `apps/web/test/theme-colors.test.ts`（追加 describe）
- Modify: `apps/web/package.json`

> **执行期修订（2026-10-06）**：站内 dashboard 真实消费 `chart-1..5`（`country-map`/`contribution-calendar`/`post-stats`/`traffic-analytics` 以 `chart-2` 为特色色），官方 neutral 灰阶图表色会造成可见回归 → **neutral 块排除 chart 键**（站点图表色保留在 `globals.css`）；其余 base/accent 全量发射。

- [ ] **Step 1: 追加失败测试**

在 `apps/web/test/theme-colors.test.ts` 顶部 import 区追加：

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { generateThemeCss } from "../scripts/generate-theme-css.mjs"
```

文件末尾追加：

```ts
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

  it("neutral 块不发射 chart-1..5（站点图表色保留在 globals.css）", () => {
    const NEUTRAL_LIGHT = 'html[data-base-color="neutral"], [data-base-color="neutral"]'
    const NEUTRAL_DARK =
      'html.dark[data-base-color="neutral"], .dark [data-base-color="neutral"]'
    const blockOf = (sel: string) => {
      const start = css.indexOf(sel + " {")
      expect(start).toBeGreaterThan(-1)
      return css.slice(start, css.indexOf("}", start))
    }
    expect(blockOf(NEUTRAL_LIGHT)).not.toMatch(/--chart-[1-5]:/)
    expect(blockOf(NEUTRAL_DARK)).not.toMatch(/--chart-[1-5]:/)
    // 其余基准色仍全量发射（防止过度剔除）
    expect(blockOf('html[data-base-color="gray"], [data-base-color="gray"]')).toMatch(
      /--chart-1:/
    )
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test theme-colors
```

Expected: FAIL — 无法解析 `../scripts/generate-theme-css.mjs`（生成器不存在）。

- [ ] **Step 3: 写生成器**

创建 `apps/web/scripts/generate-theme-css.mjs`：

```js
// 主题配色 CSS 生成器 — 读 src/lib/theme-catalog.json，产出
// src/app/theme-colors.generated.css（提交入仓；构建不依赖本脚本）。
//
// 选择器不变式（详见 docs/superpowers/specs/2026-10-06-theme-colors-design.md §1.3）：
// - 亮色双形态：html[…] 压过 :root（0-1-1 > 0-1-0）；裸 […] 供面板预览色板
//   按任意元素作用域（元素级应用的变量优先于继承值）。
// - 暗色双形态：html.dark[…] 压过 .dark（0-2-1 > 0-1-0）；.dark […] 为后代形态
//   （暗色子树内元素自动取暗色值）。
// - 基准段整体先于 accent 段：重叠键由 accent 覆盖（复刻官方浅合并方向）。
// - neutral 块产出，但排除 chart-1..5：站点图表色为站点自有（globals.css 持有，
//   dashboard 以 chart-2 为特色色），官方 neutral 灰阶图表色会破坏默认零回归；
//   预览色板需要元素级解析（仅用 background/border/primary，不涉图表色）。
//   default（主题侧）不产出块——accent 层「不覆盖」的唯一表达。

import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const CATALOG_URL = new URL("../src/lib/theme-catalog.json", import.meta.url)
const OUT_URL = new URL("../src/app/theme-colors.generated.css", import.meta.url)

export function generateThemeCss(catalog) {
  const lines = [
    "/* GENERATED by scripts/generate-theme-css.mjs — do not edit.",
    "   Source: src/lib/theme-catalog.json (shadcn 官方快照)。 */",
    "",
  ]

  const emit = (lightSel, darkSel, light, dark) => {
    lines.push(`${lightSel} {`)
    for (const [key, value] of Object.entries(light)) {
      lines.push(`  --${key}: ${value};`)
    }
    lines.push("}", "")
    lines.push(`${darkSel} {`)
    for (const [key, value] of Object.entries(dark)) {
      lines.push(`  --${key}: ${value};`)
    }
    lines.push("}", "")
  }

  // 基准色段 — 全 5 色；neutral 排除 chart-1..5（站点图表色保留在 globals.css）。
  const CHART_KEYS = new Set(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"])
  const strip = (name, vars) =>
    name === "neutral"
      ? Object.fromEntries(Object.entries(vars).filter(([k]) => !CHART_KEYS.has(k)))
      : vars
  for (const [name, { light, dark }] of Object.entries(catalog.bases)) {
    emit(
      `html[data-base-color="${name}"], [data-base-color="${name}"]`,
      `html.dark[data-base-color="${name}"], .dark [data-base-color="${name}"]`,
      strip(name, light),
      strip(name, dark)
    )
  }

  // accent 段 — 7 色，无 default。
  for (const [name, { light, dark }] of Object.entries(catalog.themes)) {
    emit(
      `html[data-theme-color="${name}"], [data-theme-color="${name}"]`,
      `html.dark[data-theme-color="${name}"], .dark [data-theme-color="${name}"]`,
      light,
      dark
    )
  }

  return lines.join("\n")
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const catalog = JSON.parse(readFileSync(CATALOG_URL, "utf8"))
  const css = generateThemeCss(catalog)
  writeFileSync(OUT_URL, css)
  console.log(
    `theme-colors.generated.css written (${css.length} bytes, ` +
      `${Object.keys(catalog.bases).length} bases + ` +
      `${Object.keys(catalog.themes).length} accents)`
  )
}
```

- [ ] **Step 4: 运行生成器写出产物**

```bash
cd /Users/zephyr/Code/zlog
node apps/web/scripts/generate-theme-css.mjs
```

Expected: 打印 `theme-colors.generated.css written (NNNNN bytes, 5 bases + 7 accents)`。

- [ ] **Step 5: 跑测试确认通过**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test theme-colors
```

Expected: PASS（9 个用例）。drift 测试此后守护：手改产物、或改了 JSON 忘了重跑生成器，都会红。

- [ ] **Step 6: 加 package.json 脚本**

`apps/web/package.json` 的 `"generate:geo"` 行后追加：

```json
    "generate:theme": "node scripts/generate-theme-css.mjs",
```

- [ ] **Step 7: 提交**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/scripts/generate-theme-css.mjs apps/web/src/app/theme-colors.generated.css apps/web/test/theme-colors.test.ts apps/web/package.json
git commit -m "feat(web): 配色 CSS 生成器与静态产物（data-属性选择器 + drift 守护）"
```

---

### Task 4: 默认零回归锁定（Neutral 与 globals.css 除图表色外全等）

**Files:**
- Modify: `apps/web/test/theme-colors.test.ts`（追加 describe）

> **执行期修订（2026-10-06）**：零回归断言改为「除 `chart-1..5` 外逐键全等 + 差异集合恰为 chart 键 + 图表值锁定为官方 gray 快照」——生成 CSS 的 neutral 块不发射图表键（Task 3 修订），站点图表色由 `globals.css` 保留。

- [ ] **Step 1: 追加测试**

在 `apps/web/test/theme-colors.test.ts` 末尾追加：

```ts
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
      (k) => rootVars[k] !== catalog.bases.neutral.light[k]
    )
    expect(differing.sort()).toEqual([...CHART_SITE_KEYS].sort())
    // 站点图表色 == 官方 gray 快照图表值（锁定现行默认观感；上游 gray 若变则此处红）
    for (const k of CHART_SITE_KEYS) {
      expect(rootVars[k]).toBe(catalog.bases.gray.light[k])
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
      (k) => darkVars[k] !== catalog.bases.neutral.dark[k]
    )
    expect(differing.sort()).toEqual([...CHART_SITE_KEYS].sort())
    for (const k of CHART_SITE_KEYS) {
      expect(darkVars[k]).toBe(catalog.bases.gray.dark[k])
    }
    expect(
      Object.keys(darkVars).filter((k) => !(k in catalog.bases.neutral.dark))
    ).toEqual(["login-glow"])
  })
})
```

- [ ] **Step 2: 跑测试**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test theme-colors
```

Expected: PASS（11 个用例）。这是特征化测试，**理应直接通过**——若 FAIL，说明快照与 `globals.css` 有真实漂移（例如上游改了中性色或本仓改过 token），**停下来报告**，不要改测试凑数。

- [ ] **Step 3: 提交**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/test/theme-colors.test.ts
git commit -m "test(web): 锁定默认零回归（neutral 与 globals.css 除图表色外全等）"
```

---

### Task 5: DB 层 — `site_settings` 两列

**Files:**
- Modify: `packages/database/test/site-settings-defaults.test.ts`
- Modify: `packages/database/src/site-settings.ts`

- [ ] **Step 1: 追加失败测试**

在 `packages/database/test/site-settings-defaults.test.ts` 末尾追加：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/database test site-settings-defaults
```

Expected: FAIL（`base_color TEXT...` 不匹配）。

- [ ] **Step 3: 改 `packages/database/src/site-settings.ts`**

Edit 1 — SCHEMA 中 `projects_enabled INTEGER NOT NULL DEFAULT 0,` 之后插入两列：

```sql
  base_color TEXT NOT NULL DEFAULT 'neutral',
  theme_color TEXT NOT NULL DEFAULT 'default',
```

Edit 2 — `ensureTable` 中 projects_enabled 的 ALTER 块之后，追加两条同款幂等 ALTER：

```ts
      // Migrate existing DBs that predate base_color.
      try {
        await db.execute(
          "ALTER TABLE site_settings ADD COLUMN base_color TEXT NOT NULL DEFAULT 'neutral'"
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/duplicate column/i.test(msg)) throw err
      }
      // Migrate existing DBs that predate theme_color.
      try {
        await db.execute(
          "ALTER TABLE site_settings ADD COLUMN theme_color TEXT NOT NULL DEFAULT 'default'"
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/duplicate column/i.test(msg)) throw err
      }
```

Edit 3 — `SiteSettingsRecord` 接口，`projectsEnabled: boolean` 之后追加：

```ts
  /** 主题配色 — shadcn 基准色 id（如 "neutral"/"slate"）。值域由 web 层
   *  zod 与 siteConfigFromRow 成员校验兜底；DB 层只存 string。 */
  baseColor: string
  /** 主题配色 — accent 主题 id（如 "default"/"blue"）。 */
  themeColor: string
```

Edit 4 — `rowToRecord` 返回对象，projectsEnabled 之后追加：

```ts
    // Missing column (pre-migration read) or NULL → neutral.
    baseColor: String(row.base_color ?? "neutral"),
    // Missing column (pre-migration read) or NULL → default (no accent).
    themeColor: String(row.theme_color ?? "default"),
```

Edit 5 — `upsertSiteSettings` 的 `next` 对象，projectsEnabled 之后追加：

```ts
    baseColor: patch.baseColor ?? existing?.baseColor ?? "neutral",
    themeColor: patch.themeColor ?? existing?.themeColor ?? "default",
```

Edit 6 — INSERT 语句三处同步：

- 列声明：`..., comment_enabled, projects_enabled, base_color, theme_color, updated_at)`
- VALUES：`..., ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`（在 projects_enabled 的 `?` 后加两个 `?`）
- `ON CONFLICT ... DO UPDATE SET`：`projects_enabled = excluded.projects_enabled,` 之后加
  `base_color = excluded.base_color,` 与 `theme_color = excluded.theme_color,`

Edit 7 — args 数组，`next.projectsEnabled ? 1 : 0,` 之后追加：

```ts
      next.baseColor,
      next.themeColor,
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/database test site-settings-defaults
```

Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
cd /Users/zephyr/Code/zlog
git add packages/database/src/site-settings.ts packages/database/test/site-settings-defaults.test.ts
git commit -m "feat(database): site_settings 增加 base_color/theme_color 列（幂等迁移）"
```

---

### Task 6: Web 配置链路（schema 拆分 / site-config / get-site-config / route / provider）

**Files:**
- Create: `apps/web/src/lib/site-settings-schema.ts`
- Create: `apps/web/test/site-settings-theme.test.ts`
- Modify: `apps/web/src/lib/site-config.ts`
- Modify: `apps/web/src/lib/get-site-config.ts`
- Modify: `apps/web/src/components/layout/site-config-provider.tsx`
- Modify: `apps/web/src/app/api/site-settings/route.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/test/site-settings-theme.test.ts`：

```ts
import { describe, it, expect, vi } from "vitest"
import { siteConfigFromRow } from "@/lib/get-site-config"
import { updateSchema } from "@/lib/site-settings-schema"
import type { SiteSettingsRecord } from "@zlog/database"

// get-site-config 在模块级调用 unstable_cache —— 测试里透传为恒等函数。
// （vi.mock 会被 vitest 提升到 import 之上，无需块内引用。）
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}))

const baseRow: SiteSettingsRecord = {
  name: "Zlog",
  title: "Zlog",
  description: "",
  authorName: "Admin",
  logoUrl: "",
  logoInvertDark: false,
  githubUrl: "",
  twitterUrl: "",
  commentEnabled: true,
  projectsEnabled: false,
  baseColor: "neutral",
  themeColor: "default",
}

describe("siteConfigFromRow：配色字段", () => {
  it("原样透传合法值", () => {
    const config = siteConfigFromRow({
      ...baseRow,
      baseColor: "slate",
      themeColor: "blue",
    })
    expect(config.baseColor).toBe("slate")
    expect(config.themeColor).toBe("blue")
  })

  it("脏值（手改 DB）与缺省（无行）回落默认", () => {
    const dirty = siteConfigFromRow({
      ...baseRow,
      baseColor: "mauve",
      themeColor: "cyan",
    })
    expect(dirty.baseColor).toBe("neutral")
    expect(dirty.themeColor).toBe("default")
    const noRow = siteConfigFromRow(null)
    expect(noRow.baseColor).toBe("neutral")
    expect(noRow.themeColor).toBe("default")
  })
})

describe("updateSchema：枚举校验（400 路径）", () => {
  it("接受合法值与空对象（全 optional）", () => {
    expect(
      updateSchema.safeParse({ baseColor: "slate", themeColor: "blue" }).success
    ).toBe(true)
    expect(updateSchema.safeParse({}).success).toBe(true)
  })

  it("拒绝未知枚举", () => {
    expect(updateSchema.safeParse({ baseColor: "mauve" }).success).toBe(false)
    expect(updateSchema.safeParse({ themeColor: "cyan" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test site-settings-theme
```

Expected: FAIL — `siteConfigFromRow` 返回值无 `baseColor`；`@/lib/site-settings-schema` 不存在。

- [ ] **Step 3: 拆出 schema 模块**

创建 `apps/web/src/lib/site-settings-schema.ts`：

```ts
import { z } from "zod"
import { BASE_COLOR_IDS, THEME_COLOR_IDS } from "@/lib/theme-catalog"
import { optionalHttpUrl } from "@/lib/url-validation"

/** Empty, site-relative path, or http(s) — safe for <img src>. */
const optionalLogoUrl = z
  .string()
  .max(500)
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v),
    { message: "Logo must be a relative path or http(s) URL" }
  )

/** PUT /api/site-settings 的部分更新载荷。配色枚举由目录数组派生——
 *  新增颜色只改 theme-catalog.ts 一处。 */
export const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  authorName: z.string().max(100).optional(),
  logoUrl: optionalLogoUrl.optional(),
  logoInvertInDark: z.boolean().optional(),
  githubUrl: optionalHttpUrl.optional(),
  twitterUrl: optionalHttpUrl.optional(),
  commentEnabled: z.boolean().optional(),
  projectsEnabled: z.boolean().optional(),
  baseColor: z.enum(BASE_COLOR_IDS).optional(),
  themeColor: z.enum(THEME_COLOR_IDS).optional(),
})
```

- [ ] **Step 4: 改 `route.ts` 引用与载荷**

`apps/web/src/app/api/site-settings/route.ts`：

Edit 1 — 头部 import 区：删除 `import { z } from "zod"`、`import { optionalHttpUrl } from "@/lib/url-validation"` 与本地 `optionalLogoUrl` / `updateSchema` 定义（整段删），改为：

```ts
import { updateSchema } from "@/lib/site-settings-schema"
```

（`next/server`、`next/cache`、`@zlog/database`、`api-auth`、`get-site-config`、`site-config` 的 import 不动。）

Edit 2 — `dbPatch` 对象，`projectsEnabled: patch.projectsEnabled,` 之后追加：

```ts
    baseColor: patch.baseColor,
    themeColor: patch.themeColor,
```

Edit 3 — 首存分支（`upsertSiteSettings({...})` 三元里），`projectsEnabled: patch.projectsEnabled ?? defaultSiteConfig.projectsEnabled,` 之后追加：

```ts
        baseColor: patch.baseColor ?? defaultSiteConfig.baseColor,
        themeColor: patch.themeColor ?? defaultSiteConfig.themeColor,
```

- [ ] **Step 5: 改 `site-config.ts`**

Edit 1 — 文件顶部追加 import：

```ts
import {
  DEFAULT_BASE_COLOR,
  DEFAULT_THEME_COLOR,
  type BaseColorName,
  type ThemeColorName,
} from "@/lib/theme-catalog"
```

Edit 2 — `SiteConfig` 类型，`projectsEnabled: boolean` 之后追加：

```ts
  /** 主题配色 — shadcn 基准色（外观面板设置）。 */
  baseColor: BaseColorName
  /** 主题配色 — accent 主题（外观面板设置）。 */
  themeColor: ThemeColorName
```

Edit 3 — `defaultSiteConfig`，`projectsEnabled: false,` 之后追加：

```ts
  baseColor: DEFAULT_BASE_COLOR,
  themeColor: DEFAULT_THEME_COLOR,
```

- [ ] **Step 6: 改 `get-site-config.ts`**

Edit 1 — import 区追加：

```ts
import {
  DEFAULT_BASE_COLOR,
  DEFAULT_THEME_COLOR,
  isBaseColorName,
  isThemeColorName,
  type BaseColorName,
  type ThemeColorName,
} from "@/lib/theme-catalog"
```

Edit 2 — `SiteSettingsDto` 类型，`projectsEnabled: boolean` 之后追加：

```ts
  baseColor: BaseColorName
  themeColor: ThemeColorName
```

Edit 3 — `siteConfigFromRow` 返回对象，`projectsEnabled: row.projectsEnabled,` 之后追加：

```ts
    // 成员校验兜底：手改 DB 的脏值不能把 data-* 属性带崩。
    baseColor: isBaseColorName(row.baseColor)
      ? row.baseColor
      : DEFAULT_BASE_COLOR,
    themeColor: isThemeColorName(row.themeColor)
      ? row.themeColor
      : DEFAULT_THEME_COLOR,
```

Edit 4 — `toSettingsDto` 返回对象，`projectsEnabled: config.projectsEnabled,` 之后追加：

```ts
    baseColor: config.baseColor,
    themeColor: config.themeColor,
```

Edit 5 — `loadCachedConfig` 返回对象，`projectsEnabled: config.projectsEnabled,` 之后追加：

```ts
    baseColor: config.baseColor,
    themeColor: config.themeColor,
```

Edit 6 — `getSiteConfig` 的 `return { ...cached, ... }`，`projectsEnabled` 兜底行之后追加：

```ts
      // ?? default: 跨部署旧缓存条目没有配色字段——undefined 会渲染出
      // 无效的 data-* 值，用默认兜底（同 commentEnabled 先例）。
      baseColor: cached.baseColor ?? defaultSiteConfig.baseColor,
      themeColor: cached.themeColor ?? defaultSiteConfig.themeColor,
```

- [ ] **Step 7: 改 `site-config-provider.tsx`**

`apps/web/src/components/layout/site-config-provider.tsx`：

Edit 1 — import 区追加：

```ts
import { isBaseColorName, isThemeColorName } from "@/lib/theme-catalog"
```

Edit 2 — `refreshSiteConfig` 的 `setConfig` 映射，`projectsEnabled` 分支之后追加：

```ts
        baseColor: isBaseColorName(s.baseColor) ? s.baseColor : prev.baseColor,
        themeColor: isThemeColorName(s.themeColor)
          ? s.themeColor
          : prev.themeColor,
```

- [ ] **Step 8: 跑测试确认通过**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test site-settings-theme
```

Expected: PASS（4 个用例）。

- [ ] **Step 9: 全量 web 测试 + typecheck**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test
pnpm --filter @zlog/web typecheck
```

Expected: 全绿（原有 245 + 新增）。

- [ ] **Step 10: 提交**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/src/lib/site-settings-schema.ts apps/web/test/site-settings-theme.test.ts apps/web/src/lib/site-config.ts apps/web/src/lib/get-site-config.ts apps/web/src/components/layout/site-config-provider.tsx apps/web/src/app/api/site-settings/route.ts
git commit -m "feat(web): 配色字段贯通配置链路（schema 拆分 / DTO / 双层兜底）"
```

---

### Task 7: root layout 直出 `data-*` 属性

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: 改 layout**

Edit 1 — `import "./globals.css"` 之后追加一行：

```ts
import "./theme-colors.generated.css"
```

Edit 2 — `<html>` 开标签（当前为 `lang` → `className` → 注释 → `data-scroll-behavior` → `suppressHydrationWarning`），在 `lang` 之后插入两个属性（保持相邻，便于核验 grep）：

```tsx
    <html
      lang={defaultLocale}
      data-base-color={site.baseColor}
      data-theme-color={site.themeColor}
      className="h-full antialiased"
```

其余不动（`data-scroll-behavior`、`suppressHydrationWarning` 保留）。

- [ ] **Step 2: 验证 SSR 直出（dev server 在 :3000 运行中，热更新自动生效）**

```bash
cd /Users/zephyr/Code/zlog
curl -s http://localhost:3000/ | grep -o 'data-base-color="[a-z]*" data-theme-color="[a-z]*"'
```

Expected: `data-base-color="neutral" data-theme-color="default"`

（若 dev server 未运行：`cd apps/web && pnpm dev` 起后台任务再跑 curl；**不要 kill 已存在的 :3000 进程**。若 curl 有响应但没有两个 `data-*` 属性：先刷新一次页面触发重编译再试；仍无则停下来报告，不要重启用户的 dev server。）

- [ ] **Step 3: typecheck**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web typecheck
```

Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): root layout 引入生成 CSS 并直出配色 data-* 属性"
```

---

### Task 8: i18n 键 + 「外观」面板

**Files:**
- Modify: `apps/web/src/lib/i18n/admin.ts`
- Create: `apps/web/src/components/admin/appearance-form.tsx`
- Modify: `apps/web/src/components/admin/settings-dialog.tsx`

- [ ] **Step 1: 加 i18n 键（zh 与 en 同步）**

`apps/web/src/lib/i18n/admin.ts`：

zh Edit 1 — `settingsNavAccount: "账号",` 之后加：

```ts
settingsNavAppearance: "外观",
```

zh Edit 2 — `siteInfoNoChanges: "没有需要保存的修改",` 之后加：

```ts
appearanceInfo: "外观",
appearanceInfoDesc: "选择博客与后台的基准色与主题色。",
appearanceBaseColor: "基准色",
appearanceThemeColor: "主题色",
appearanceHint: "配色应用于前台与后台；线上静态镜像随下一次构建生效。",
appearanceSave: "保存外观",
appearanceSaved: "外观设置已保存",
appearanceSaveFailed: "保存外观设置失败",
appearanceLoadFailed: "外观设置加载失败，正在使用当前显示的值",
```

en Edit 1 — `settingsNavAccount: "Account",` 之后加：

```ts
settingsNavAppearance: "Appearance",
```

en Edit 2 — `siteInfoNoChanges: "Nothing to save — no fields were changed",` 之后加：

```ts
appearanceInfo: "Appearance",
appearanceInfoDesc: "Pick the base and theme colors for the blog and admin.",
appearanceBaseColor: "Base color",
appearanceThemeColor: "Theme color",
appearanceHint:
  "Applies to the blog and admin. The online static mirror picks it up on the next build.",
appearanceSave: "Save appearance",
appearanceSaved: "Appearance saved",
appearanceSaveFailed: "Failed to save appearance",
appearanceLoadFailed:
  "Appearance settings failed to load — showing current values",
```

- [ ] **Step 2: 跑 i18n 测试**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test i18n
```

Expected: PASS（zh/en 键集一致）。

- [ ] **Step 3: 写外观面板组件**

创建 `apps/web/src/components/admin/appearance-form.tsx`：

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import {
  BASE_COLORS,
  THEME_COLORS,
  DEFAULT_BASE_COLOR,
  DEFAULT_THEME_COLOR,
  isBaseColorName,
  isThemeColorName,
  type BaseColorName,
  type ThemeColorName,
} from "@/lib/theme-catalog"

/**
 * 「外观」面板 — 基准色 × 主题色（accent）。
 *
 * 活预览：每个选项按钮同时挂 data-base-color / data-theme-color 两个属性——
 * 被选择的一轴挂本选项 id，另一轴挂表单当前选择——预览即「本选项 × 另一轴
 * 当前选择」的真实组合。两轴都作用于按钮元素本身，变量元素级解析、不依赖
 * ambient html（Neutral 落到与 :root 等值的 neutral 块；Default 无 accent 块
 * → 落回基准色自身主色）。亮暗随面板所处模式自适应（.dark 后代形态）。
 */
export function AppearanceForm({ className }: { className?: string }) {
  const { t } = useT()
  const router = useRouter()
  const site = useSiteConfig()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [baseColor, setBaseColor] = useState<BaseColorName>(DEFAULT_BASE_COLOR)
  const [themeColor, setThemeColor] =
    useState<ThemeColorName>(DEFAULT_THEME_COLOR)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/site-settings")
        if (!res.ok) throw new Error("failed")
        const data = await res.json()
        if (cancelled) return
        const s = data.settings
        if (isBaseColorName(s.baseColor)) setBaseColor(s.baseColor)
        if (isThemeColorName(s.themeColor)) setThemeColor(s.themeColor)
      } catch {
        if (!cancelled) {
          // 同 site-info-form：加载失败不静默回退——提示并退回上下文值。
          toast.error(t("admin.appearanceLoadFailed"))
          if (isBaseColorName(site.baseColor)) setBaseColor(site.baseColor)
          if (isThemeColorName(site.themeColor)) setThemeColor(site.themeColor)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // Initial hydrate only — site context is a fallback.（同 site-info-form）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      // 仅两字段：upsert 为局部合并，不会碰站点信息字段。
      const res = await apiFetch("/api/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseColor, themeColor }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t("admin.appearanceSaveFailed"))
        return
      }
      toast.success(t("admin.appearanceSaved"))
      // 根布局重渲染 → <html> 属性更新 → 全站即时换色。
      router.refresh()
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-[10rem] items-center justify-center",
          className
        )}
      >
        <Spinner size="md" />
      </div>
    )
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div className="space-y-2.5">
        <Label>{t("admin.appearanceBaseColor")}</Label>
        <div className="grid grid-cols-5 gap-2">
          {BASE_COLORS.map((c) => {
            const selected = baseColor === c.id
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                data-base-color={c.id}
                data-theme-color={themeColor}
                onClick={() => setBaseColor(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[11px] leading-none transition-colors",
                  selected
                    ? "border-ring text-foreground ring-2 ring-ring"
                    : "border-border text-muted-foreground hover:border-muted-foreground/50"
                )}
              >
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-md border"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: "var(--primary)" }}
                  />
                </span>
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2.5">
        <Label>{t("admin.appearanceThemeColor")}</Label>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {THEME_COLORS.map((c) => {
            const selected = themeColor === c.id
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                data-base-color={baseColor}
                data-theme-color={c.id}
                onClick={() => setThemeColor(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[11px] leading-none transition-colors",
                  selected
                    ? "border-ring text-foreground ring-2 ring-ring"
                    : "border-border text-muted-foreground hover:border-muted-foreground/50"
                )}
              >
                <span
                  aria-hidden
                  className="size-6 rounded-full border"
                  style={{
                    backgroundColor: "var(--primary)",
                    borderColor: "var(--border)",
                  }}
                />
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("admin.appearanceHint")}</p>

      <Button type="button" onClick={handleSave} disabled={saving}>
        {saving ? t("admin.saving") : t("admin.appearanceSave")}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: 接入 SettingsDialog**

`apps/web/src/components/admin/settings-dialog.tsx`：

Edit 1 — import：`import { SiteInfoForm } ...` 之后加

```ts
import { AppearanceForm } from "@/components/admin/appearance-form"
```

并把 lucide import 改为：

```ts
import { Globe, Palette, UserRound, XIcon } from "lucide-react"
```

Edit 2 — 面板联合类型：

```ts
type SettingsPanel = "site" | "appearance" | "account"
```

Edit 3 — nav 数组，site 项之后插入：

```ts
    { id: "appearance" as const, label: t("admin.settingsNavAppearance"), icon: Palette },
```

Edit 4 — title / description 三元改三分支：

```ts
  const title =
    panel === "site"
      ? t("admin.siteInfo")
      : panel === "appearance"
        ? t("admin.appearanceInfo")
        : t("admin.accountInfo")
  const description =
    panel === "site"
      ? t("admin.siteInfoDesc")
      : panel === "appearance"
        ? t("admin.appearanceInfoDesc")
        : t("admin.settingsAccountDesc")
```

Edit 5 — 内容区，site 的 `<div hidden={panel !== "site"} ...>` 之后插入：

```tsx
                <div hidden={panel !== "appearance"} className="h-full">
                  <AppearanceForm className="h-full" />
                </div>
```

（`selectPanel` 对 recovery-key 的守卫自动覆盖 appearance，无需改。）

- [ ] **Step 5: 测试 + typecheck**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test
pnpm --filter @zlog/web typecheck
```

Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
cd /Users/zephyr/Code/zlog
git add apps/web/src/lib/i18n/admin.ts apps/web/src/components/admin/appearance-form.tsx apps/web/src/components/admin/settings-dialog.tsx
git commit -m "feat(web): 后台「外观」面板——基准色/主题色活预览与保存"
```

---

### Task 9: 收尾验证（全量 / export 冒烟 / 行为核验）

**Files:** 无新改动（除非触发下方「回退方案」，届时按对应 Edit 修改 `appearance-form.tsx` 后补一个提交）

- [ ] **Step 1: 全量测试**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test && pnpm --filter @zlog/database test
```

Expected: 全绿（web 245 + 新增 ≈ 259；database 51 + 2）。

- [ ] **Step 2: export 冒烟（先清本地数据缓存，避免 dev 串扰）**

```bash
cd /Users/zephyr/Code/zlog
rm -rf apps/web/.next/cache/fetch-cache
pnpm --filter @zlog/web export
```

Expected: 构建成功（脚本自带 `check-i18n` + `toggle-force-static add/remove`）。

- [ ] **Step 3: 断言导出产物**

```bash
cd /Users/zephyr/Code/zlog
grep -o 'data-base-color="[a-z]*" data-theme-color="[a-z]*"' apps/web/out/index.html
grep -rl 'data-base-color="gray"' apps/web/out/_next/static/css/ | head -3
```

Expected: 第一行 `data-base-color="neutral" data-theme-color="default"`；第二行列出至少一个 CSS 文件（生成 CSS 被打进产物）。

- [ ] **Step 4: 浏览器行为核验（dev :3000）**

打开 `http://localhost:3000/admin` → 设置 → **外观**，依次核验：

1. 面板显示 5 个基准色 + 8 个主题色，色板为真实 token 渲染（非贴图）；亮暗模式下色板自动取对应模式的色值。
2. 选 **Slate + Blue** → 保存 → 期望：toast「外观设置已保存」；`<html>` 的 `data-base-color="slate" data-theme-color="blue"`；前后台（`/`、`/admin`）全站立即换色，明暗两态都正确。
3. 刷新页面：选择保持（DB 持久化生效）。
4. 选回 **Neutral + Default** → 保存 → 与改动前视觉一致（零回归目检）。
5. 面板选色时（未保存），色板预览即为该组合的真实效果；Default 主题板的圆点 = 当前基准色自身主色。

**回退方案（spec §3.2 预授权）**：若第 2 步发现保存后 `<html>` 属性不随 `router.refresh()` 更新，则把 `appearance-form.tsx` 的 `handleSave` 中：

```diff
-      router.refresh()
+      // router.refresh() 实测不更新 <html> 属性 → 整页刷新应用新配色。
+      window.location.reload()
```

并删除 `import { useRouter } from "next/navigation"` 与 `const router = useRouter()`。重跑 `pnpm --filter @zlog/web typecheck` 后补一个提交：`fix(web): 外观保存后整页刷新以应用 html 属性`。

- [ ] **Step 5: lint + typecheck 终检**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web lint && pnpm --filter @zlog/web typecheck
```

Expected: 无错误。

- [ ] **Step 6: 收尾**

- 确认 `git status` 干净、全部提交落在本地（**不推送**；推送 main 需用户当次明确授权，且会连带部署已开启的 `/projects` Pages）。
- 交付摘要：新文件 8 个、修改 10 个、提交 8 个（Task 1–8）+ 可能的回退提交。

---

## Self-Review 记录（写完后的自检）

1. **Spec 覆盖**：§0 调研结论 → Task 1（数据源/pin SHA）；§1.1–1.2 → Task 1/2；§1.3 生成器与选择器不变式 → Task 3（含 neutral 修订）；§1.4 → Task 7；§2.1 → Task 5；§2.2 → Task 6（含 schema 拆分修订）；§2.3 → Task 7；§3.1–3.2 → Task 8；§3.3 → Task 8 Step 1（10 键：6 个规格键 + appearanceSave/Saved/SaveFailed/LoadFailed，为实施时「核对现有键」的结论）；§4 生效时机/旧缓存/脏值/扩展路径 → Task 6 兜底 + Task 8 hint + Task 9；§5 测试 1–4 → Task 3/4，API 校验 → Task 6，export 冒烟 → Task 9，CDP 视觉 → Task 9 Step 4；§6 清单 → File Structure（差异：`site-settings-schema.ts` 为 spec 修订后新增，`site-config-provider.tsx` 为链路一致性补充，均在修订中有据）。
2. **占位符扫描**：无 TBD/TODO；所有代码步骤为完整代码；唯一分叉「回退方案」为 spec 预授权的二选一，两个分支的代码都写全。
3. **类型一致性**：`generateThemeCss(catalog)` 定义于 Task 3、调用处签名一致；`BASE_COLOR_IDS`/`THEME_COLOR_IDS` 在 Task 2 定义为元组（供 `z.enum`），Task 3/6 使用处一致；`SiteSettingsRecord` 两字段在 Task 5 定义、Task 6 fixture 与测试一致；`AppearanceForm` 仅收 `className`（Task 8 两处引用一致，idPrefix 已按实现简化删除）。
