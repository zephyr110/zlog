import { afterEach, describe, expect, it, vi } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DESKTOP_NAV_PATHS,
  isDesktopNavCommand,
  type DesktopNavCommand,
} from "../src/lib/desktop-commands"
import { isDesktopBuild } from "../src/lib/desktop"

const repoRoot = join(__dirname, "..", "..", "..")

/** 命令 ID 与路径的契约：主进程 app-menu.ts 里的映射必须与 web 侧一致 */
function menuNavPaths(): Record<string, string> {
  const source = readFileSync(
    join(repoRoot, "apps/desktop/electron/app-menu.ts"),
    "utf8"
  )
  const block = source.match(
    /APP_NAV_PATHS: Record<AppNavCommand, string> = \{([\s\S]*?)\}/
  )
  if (!block) throw new Error("APP_NAV_PATHS not found in app-menu.ts")
  const entries: Record<string, string> = {}
  for (const m of block[1].matchAll(/["']([\w.]+)["']\s*:\s*["']([^"']+)["']/g)) {
    entries[m[1]] = m[2]
  }
  return entries
}

describe("isDesktopBuild", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("Web 构建（未注入）视为非桌面", () => {
    vi.stubEnv("NEXT_PUBLIC_DESKTOP", "")
    expect(isDesktopBuild()).toBe(false)
  })

  it("仅值为 1 时视为桌面构建", () => {
    vi.stubEnv("NEXT_PUBLIC_DESKTOP", "1")
    expect(isDesktopBuild()).toBe(true)
    vi.stubEnv("NEXT_PUBLIC_DESKTOP", "true")
    expect(isDesktopBuild()).toBe(false)
  })
})

describe("isDesktopNavCommand", () => {
  it("接受全部注册命令，拒绝其他值", () => {
    for (const command of Object.keys(DESKTOP_NAV_PATHS)) {
      expect(isDesktopNavCommand(command)).toBe(true)
    }
    for (const bad of [undefined, null, "", "nav.media", 42, {}]) {
      expect(isDesktopNavCommand(bad)).toBe(false)
    }
  })
})

describe("桌面导航路径", () => {
  it("与主进程菜单映射逐项一致", () => {
    expect(menuNavPaths()).toEqual(DESKTOP_NAV_PATHS)
  })

  it("每条命令都指向真实存在的页面", () => {
    for (const path of Object.values(DESKTOP_NAV_PATHS)) {
      const page = path === "/" ? "src/app/page.tsx" : `src/app${path}/page.tsx`
      const command = Object.keys(DESKTOP_NAV_PATHS).find(
        (k) => DESKTOP_NAV_PATHS[k as DesktopNavCommand] === path
      )
      expect(existsSync(join(__dirname, "..", page)), `${command} → ${page}`).toBe(true)
    }
  })
})
