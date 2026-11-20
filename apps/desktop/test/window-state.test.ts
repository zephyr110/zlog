import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  clampWindowBounds,
  WindowStateStore,
} from "../electron/window-state"

const PRIMARY = { x: 0, y: 0, width: 1440, height: 900 }
const SECONDARY = { x: 1440, y: 0, width: 1920, height: 1080 }

describe("clampWindowBounds", () => {
  it("屏幕内的窗口原样保留", () => {
    const bounds = { x: 100, y: 80, width: 1000, height: 700 }
    expect(clampWindowBounds(bounds, [PRIMARY], PRIMARY)).toEqual(bounds)
  })

  it("超出屏幕的尺寸收缩到工作区", () => {
    expect(
      clampWindowBounds({ x: 0, y: 0, width: 2000, height: 1200 }, [PRIMARY], PRIMARY)
    ).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
  })

  it("完全在屏幕外时居中到主屏", () => {
    expect(
      clampWindowBounds({ x: 5000, y: 5000, width: 1000, height: 700 }, [PRIMARY], PRIMARY)
    ).toEqual({ x: 220, y: 100, width: 1000, height: 700 })
  })

  it("标题栏跑到工作区上方时拉回", () => {
    expect(
      clampWindowBounds({ x: 100, y: -300, width: 1000, height: 700 }, [PRIMARY], PRIMARY)
    ).toEqual({ x: 100, y: 0, width: 1000, height: 700 })
  })

  it("可见部分不足 96px 时视为丢失，重新居中", () => {
    expect(
      clampWindowBounds({ x: -950, y: 100, width: 1000, height: 700 }, [PRIMARY], PRIMARY)
    ).toEqual({ x: 220, y: 100, width: 1000, height: 700 })
  })

  it("保留外接屏（负坐标）上的位置", () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1080 }
    const bounds = { x: -1800, y: 120, width: 1100, height: 700 }
    expect(clampWindowBounds(bounds, [PRIMARY, left], PRIMARY)).toEqual(bounds)
  })

  it("没有可用屏幕信息时退回默认尺寸", () => {
    expect(
      clampWindowBounds({ x: 1, y: 2, width: 900, height: 700 }, [], PRIMARY)
    ).toEqual({ x: 0, y: 0, width: 1280, height: 800 })
  })

  it("工作区小于最小可见量时不把窗口推出屏幕", () => {
    const tiny = { x: 0, y: 0, width: 80, height: 60 }
    expect(
      clampWindowBounds({ x: 0, y: 0, width: 900, height: 700 }, [tiny], tiny)
    ).toEqual({ x: 0, y: 0, width: 80, height: 60 })
  })

  it("非法数值按默认尺寸处理", () => {
    const result = clampWindowBounds(
      { x: Number.NaN, y: 100, width: Number.POSITIVE_INFINITY, height: 700 },
      [PRIMARY],
      PRIMARY
    )
    expect(Number.isFinite(result.x)).toBe(true)
    expect(result.width).toBe(1280)
    expect(result.height).toBe(700)
  })
})

describe("WindowStateStore", () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it("保存后可读回", () => {
    dir = mkdtempSync(join(tmpdir(), "zlog-window-state-"))
    const store = new WindowStateStore(dir)
    expect(store.load()).toBeNull()
    const state = { bounds: { x: 10, y: 20, width: 1200, height: 800 }, maximized: true }
    store.save(state)
    expect(store.load()).toEqual(state)
  })

  it("损坏或含非有限数的文件按无状态处理", () => {
    dir = mkdtempSync(join(tmpdir(), "zlog-window-state-"))
    const store = new WindowStateStore(dir)
    writeFileSync(store.filePath, "{not json")
    expect(store.load()).toBeNull()
    // JSON 里 NaN 会被写成 null
    writeFileSync(
      store.filePath,
      JSON.stringify({ bounds: { x: 0, y: 0, width: Number.NaN, height: 10 } })
    )
    expect(store.load()).toBeNull()
  })

  it("过小的窗口尺寸可读回，由 clamp 兜底放大", () => {
    dir = mkdtempSync(join(tmpdir(), "zlog-window-state-"))
    const store = new WindowStateStore(dir)
    const small = {
      bounds: { x: 100, y: 80, width: 200, height: 150 },
      maximized: false,
    }
    store.save(small)
    expect(store.load()).toEqual(small)
    expect(clampWindowBounds(small.bounds, [PRIMARY], PRIMARY)).toEqual({
      x: 100,
      y: 80,
      width: 320,
      height: 240,
    })
  })
})

describe("主窗口接线", () => {
  const main = readFileSync(join(__dirname, "../electron/main.ts"), "utf8")

  it("启动恢复、拖动节流保存、关闭兜底", () => {
    expect(main).toContain("windowStateStore.load()")
    expect(main).toContain("clampWindowBounds(")
    expect(main).toContain('win.on("move", scheduleSave)')
    expect(main).toContain('win.on("resize", scheduleSave)')
    expect(main).toContain("saveWindowState()")
  })
})
