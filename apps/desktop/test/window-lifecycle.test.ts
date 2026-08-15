import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  shouldHideMainWindowOnClose,
  shouldReloadMainWindow,
} from "../electron/window-lifecycle"

const main = readFileSync(join(__dirname, "../electron/main.ts"), "utf8")

describe("shouldHideMainWindowOnClose", () => {
  it("未退出时红灯隐藏，不销毁", () => {
    expect(shouldHideMainWindowOnClose(false)).toBe(true)
  })

  it("Cmd+Q / 托盘退出时真正关掉", () => {
    expect(shouldHideMainWindowOnClose(true)).toBe(false)
  })
})

describe("shouldReloadMainWindow", () => {
  it("已有同 origin 页面时不刷新，避免关窗再开丢状态", () => {
    expect(
      shouldReloadMainWindow("http://127.0.0.1:4310/admin/posts", "http://127.0.0.1:4310")
    ).toBe(false)
  })

  it("尚无 URL 或端口变了必须重载", () => {
    expect(shouldReloadMainWindow(undefined, "http://127.0.0.1:4310")).toBe(true)
    expect(
      shouldReloadMainWindow("http://127.0.0.1:4310/", "http://127.0.0.1:4311")
    ).toBe(true)
  })

  it("localhost 与 127.0.0.1 同端口不刷新", () => {
    expect(
      shouldReloadMainWindow("http://localhost:4310/admin", "http://127.0.0.1:4310")
    ).toBe(false)
    expect(
      shouldReloadMainWindow("http://[::1]:4310/admin", "http://127.0.0.1:4310")
    ).toBe(false)
  })
})

describe("main window close wiring", () => {
  it("红灯走隐藏，Dock activate 重开，退出旗在 before-quit", () => {
    expect(main).toContain("shouldHideMainWindowOnClose")
    expect(main).toContain("shouldReloadMainWindow")
    expect(main).toContain('app.on("activate"')
    expect(main).toContain('app.on("before-quit"')
  })
})
