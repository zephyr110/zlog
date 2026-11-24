import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  bounds: Bounds
  maximized: boolean
}

export const DEFAULT_BOUNDS: Bounds = { x: 0, y: 0, width: 1280, height: 800 }

/** 至少留出这么多像素在屏幕内，用户才抓得到标题栏/边框。 */
const MIN_VISIBLE = 96
const MIN_SAVED_WIDTH = 320
const MIN_SAVED_HEIGHT = 240

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function overlap(a: Bounds, b: Bounds): { width: number; height: number } {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 把保存的窗口区域夹回当前屏幕；窗口完全在屏幕外则居中到主屏。
 *  外接显示器拔出、分辨率变化后，旧坐标可能落在不存在的区域。 */
export function clampWindowBounds(
  saved: Bounds,
  workAreas: Bounds[],
  primary: Bounds
): Bounds {
  if (workAreas.length === 0) return { ...DEFAULT_BOUNDS }

  const width = isFiniteNumber(saved.width)
    ? Math.max(saved.width, MIN_SAVED_WIDTH)
    : DEFAULT_BOUNDS.width
  const height = isFiniteNumber(saved.height)
    ? Math.max(saved.height, MIN_SAVED_HEIGHT)
    : DEFAULT_BOUNDS.height
  const x = isFiniteNumber(saved.x) ? saved.x : primary.x
  const y = isFiniteNumber(saved.y) ? saved.y : primary.y

  // 选与旧窗口重叠最多的屏幕；足够可见就只在它内部做微调。
  let target = primary
  let best = 0
  for (const area of workAreas) {
    const { width: w, height: h } = overlap({ x, y, width, height }, area)
    const score = Math.max(0, w) * Math.max(0, h)
    if (score > best) {
      best = score
      target = area
    }
  }

  const fitWidth = Math.min(width, target.width)
  const fitHeight = Math.min(height, target.height)
  const visible = overlap(
    { x, y, width: fitWidth, height: fitHeight },
    target
  )
  const usable =
    visible.width >= MIN_VISIBLE && visible.height >= MIN_VISIBLE
  const anchored = usable
    ? { x, y, width: fitWidth, height: fitHeight }
    : {
        width: fitWidth,
        height: fitHeight,
        x: Math.round(target.x + (target.width - fitWidth) / 2),
        y: Math.round(target.y + (target.height - fitHeight) / 2),
      }

  // 工作区比最小可见量还小时上下界会倒挂，clamp 会把窗口推出屏幕，退回工作区原点
  const xLo = target.x - fitWidth + MIN_VISIBLE
  const xHi = target.x + target.width - MIN_VISIBLE
  const yLo = target.y
  const yHi = target.y + target.height - MIN_VISIBLE
  return {
    width: fitWidth,
    height: fitHeight,
    x: Math.round(xLo > xHi ? target.x : clamp(anchored.x, xLo, xHi)),
    y: Math.round(yLo > yHi ? target.y : clamp(anchored.y, yLo, yHi)),
  }
}

/** 主窗口几何状态的本地存储（与 zlog-config.json 同目录，不含秘密）。 */
export class WindowStateStore {
  constructor(private readonly dir: string) {}

  get filePath(): string {
    return join(this.dir, "window-state.json")
  }

  load(): WindowState | null {
    if (!existsSync(this.filePath)) return null
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<WindowState>
      const b = raw.bounds
      if (
        !b ||
        !isFiniteNumber(b.x) ||
        !isFiniteNumber(b.y) ||
        !isFiniteNumber(b.width) ||
        !isFiniteNumber(b.height)
      ) {
        return null
      }
      return { bounds: b, maximized: raw.maximized === true }
    } catch {
      return null
    }
  }

  save(state: WindowState): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), { mode: 0o600 })
  }
}
