import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  APP_NAV_PATHS,
  buildAppMenuTemplate,
  type AppMenuActions,
} from "../electron/app-menu"

function actions() {
  return {
    navigate: vi.fn(),
    openSettings: vi.fn(),
    syncNow: vi.fn(),
    checkUpdates: vi.fn(),
    openInBrowser: vi.fn(),
  } satisfies AppMenuActions
}

function labels(template: ReturnType<typeof buildAppMenuTemplate>): string[] {
  return template.map((item) => String(item.label ?? item.role ?? ""))
}

describe("APP_NAV_PATHS", () => {
  it("导航命令全部指向站内路径", () => {
    for (const path of Object.values(APP_NAV_PATHS)) {
      expect(path.startsWith("/")).toBe(true)
    }
  })
})

describe("buildAppMenuTemplate", () => {
  it("macOS 首个菜单承载设置、更新与退出", () => {
    const a = actions()
    const template = buildAppMenuTemplate({ lang: "zh", platform: "darwin", actions: a })
    expect(labels(template)[0]).toBe("Zlog")
    const appItems = template[0].submenu as Array<Record<string, unknown>>
    const settings = appItems.find((i) => i.label === "设置…")
    expect(settings?.accelerator).toBe("CmdOrCtrl+,")
    ;(settings?.click as () => void)()
    expect(a.openSettings).toHaveBeenCalled()
    expect(appItems.some((i) => i.role === "quit")).toBe(true)
  })

  it("视图菜单的快捷键走命令而不是整页跳转", () => {
    const a = actions()
    const template = buildAppMenuTemplate({ lang: "zh", platform: "darwin", actions: a })
    const view = template.find((i) => i.label === "视图")!
    const items = view.submenu as Array<Record<string, unknown>>
    const byLabel = (name: string) => items.find((i) => i.label === name)!
    expect(byLabel("阅读模式").accelerator).toBe("CmdOrCtrl+1")
    expect(byLabel("仪表盘").accelerator).toBe("CmdOrCtrl+2")
    expect(byLabel("文章").accelerator).toBe("CmdOrCtrl+3")
    expect(byLabel("评论").accelerator).toBe("CmdOrCtrl+4")
    ;(byLabel("文章").click as () => void)()
    expect(a.navigate).toHaveBeenCalledWith("nav.posts")
  })

  it("Windows 不设应用菜单，设置与退出放进文件菜单", () => {
    const template = buildAppMenuTemplate({ lang: "en", platform: "win32", actions: actions() })
    expect(labels(template)).not.toContain("Zlog")
    const file = template.find((i) => i.label === "File")!
    const items = file.submenu as Array<Record<string, unknown>>
    expect(items.some((i) => i.label === "Settings…")).toBe(true)
    expect(items.some((i) => i.role === "quit")).toBe(true)
    const help = template.find((i) => i.label === "Help")!
    const helpItems = help.submenu as Array<Record<string, unknown>>
    expect(helpItems.some((i) => i.label === "Check for Updates")).toBe(true)
  })

  it("编辑菜单保留系统编辑角色（否则输入框快捷键失效）", () => {
    const template = buildAppMenuTemplate({ lang: "zh", platform: "linux", actions: actions() })
    const edit = template.find((i) => i.label === "编辑")!
    const items = edit.submenu as Array<Record<string, unknown>>
    const roles = items.map((i) => i.role)
    for (const role of ["undo", "redo", "cut", "copy", "paste", "selectAll"]) {
      expect(roles).toContain(role)
    }
  })

  it("主进程接线：安装菜单、广播命令、语言切换后重建", () => {
    const main = readFileSync(join(__dirname, "../electron/main.ts"), "utf8")
    expect(main).toContain("Menu.setApplicationMenu(")
    expect(main).toContain("buildAppMenuTemplate(")
    expect(main).toContain("installApplicationMenu()")
    expect(main).toContain("zlog-desktop-command")
    expect(main).toContain("window.__zlogDesktopShell === true")
    expect(main).toMatch(/if \(menuLang !== currentLang\) installApplicationMenu\(\)/)
  })

  it("新建文章快捷键只有一个归属", () => {
    const template = buildAppMenuTemplate({ lang: "zh", platform: "darwin", actions: actions() })
    const hits: string[] = []
    const walk = (items: Array<Record<string, unknown>>) => {
      for (const item of items) {
        if (item.accelerator === "CmdOrCtrl+N") hits.push(String(item.label))
        if (Array.isArray(item.submenu)) {
          walk(item.submenu as Array<Record<string, unknown>>)
        }
      }
    }
    walk(template as Array<Record<string, unknown>>)
    expect(hits).toEqual(["新建文章"])
  })
})
