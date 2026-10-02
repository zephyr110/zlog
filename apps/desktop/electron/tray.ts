import { Tray, Menu, nativeImage } from "electron"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ResolvedLang } from "./lang"

export interface TrayActions {
  onOpen: () => void
  onSettings: () => void
  onSyncNow: () => void
  onCheckUpdate: () => void
  onQuit: () => void
}

const TRAY_LABELS: Record<
  ResolvedLang,
  { open: string; settings: string; sync: string; checkUpdate: string; quit: string }
> = {
  zh: {
    open: "打开",
    settings: "设置",
    sync: "立即同步",
    checkUpdate: "检查更新",
    quit: "退出",
  },
  en: {
    open: "Open",
    settings: "Settings",
    sync: "Sync Now",
    checkUpdate: "Check for Updates",
    quit: "Quit",
  },
}

const SYNC_SUFFIX: Record<
  ResolvedLang,
  { synced: string; error: string; syncing: string }
> = {
  zh: { synced: "✓ 已同步", error: "⚠ 同步异常", syncing: "…同步中" },
  en: { synced: "✓ Synced", error: "⚠ Sync error", syncing: "…Syncing" },
}

/**
 * 托盘图标选择：
 * - macOS：模板图标（黑色图形 + alpha）。系统按菜单栏浅色/深色染成黑/白。
 *   createFromPath 只读一个文件，不会带上旁边的 @2x，所以这里用
 *   createFromBuffer({ scaleFactor: 2 }) 把 36px 标成 18pt，Retina 才不糊。
 * - Windows/Linux：模板图语义不适用，用彩色图标。
 * - 模板图缺失（派生失败/旧资源）时回退彩色图标。
 */
function trayIcon(): Electron.NativeImage {
  if (process.platform === "darwin") {
    const template = macTrayTemplate()
    if (template) return template
  }
  return nativeImage
    .createFromPath(join(__dirname, "..", "assets", "tray.png"))
    .resize({ width: 16, height: 16 })
}

function readPng(file: string): Buffer | null {
  try {
    return existsSync(file) ? readFileSync(file) : null
  } catch {
    return null
  }
}

function macTrayTemplate(): Electron.NativeImage | null {
  const dir = join(__dirname, "..", "assets")
  const p1 = join(dir, "trayTemplate.png")
  const p2 = join(dir, "trayTemplate@2x.png")
  try {
    let image: Electron.NativeImage | null = null
    const retina = readPng(p2)
    if (retina) {
      image = nativeImage.createFromBuffer(retina, { scaleFactor: 2 })
      if (image.isEmpty()) image = null
    }
    const one = nativeImage.createFromPath(p1)
    if (image && !one.isEmpty()) {
      const { width, height } = one.getSize()
      image.addRepresentation({
        scaleFactor: 1,
        width,
        height,
        buffer: one.toPNG(),
      })
    } else if (!image && !one.isEmpty()) {
      image = one
    }
    if (!image || image.isEmpty()) return null
    image.setTemplateImage(true)
    return image
  } catch {
    return null
  }
}

/** 菜单顺序：打开 → 设置 → 立即同步 → 检查更新 → 分隔 → 退出。 */
export function trayMenuLabels(lang: ResolvedLang): string[] {
  const labels = TRAY_LABELS[lang]
  return [labels.open, labels.settings, labels.sync, labels.checkUpdate, labels.quit]
}

function buildMenu(lang: ResolvedLang, actions: TrayActions): Menu {
  const labels = TRAY_LABELS[lang]
  return Menu.buildFromTemplate([
    { label: labels.open, click: actions.onOpen },
    { label: labels.settings, click: actions.onSettings },
    { label: labels.sync, click: actions.onSyncNow },
    { label: labels.checkUpdate, click: actions.onCheckUpdate },
    { type: "separator" },
    { label: labels.quit, click: actions.onQuit },
  ])
}

export function createTray(actions: TrayActions, lang: ResolvedLang): Tray {
  const tray = new Tray(trayIcon())
  tray.setToolTip("Zlog")
  tray.setContextMenu(buildMenu(lang, actions))
  return tray
}

/** 语言切换后重建上下文菜单（托盘菜单文案跟随 resolved 语言）。 */
export function updateTrayLanguage(tray: Tray, lang: ResolvedLang, actions: TrayActions): void {
  tray.setContextMenu(buildMenu(lang, actions))
}

type SyncStatusDetail = {
  configured?: boolean
  syncing?: boolean
  lastSyncError?: string | null
  lastSyncAt?: string | null
}

export function updateTraySyncStatus(
  tray: Tray,
  state: string,
  detail?: unknown,
  lang: ResolvedLang = "zh"
): void {
  const d = (detail ?? {}) as SyncStatusDetail
  // "idle"（30s 轮询）时按 detail 推导真实状态：WalConflict / 云端读取
  // 被封这类错误在下次成功同步前会一直挂在 lastSyncError 上，托盘
  // tooltip 必须持续显示异常，而不是只在同步调用失败的那一刻。
  // "server-exited" 维持无后缀——服务崩溃已有独立弹窗。
  const effective =
    state === "synced"
      ? d.lastSyncError
        ? "error"
        : "synced"
      : state === "error" || state === "server-exited"
        ? state
        : d.lastSyncError
          ? "error"
          : d.syncing
            ? "syncing"
            : d.configured && d.lastSyncAt
              ? "synced"
              : "idle"
  const suffix =
    effective === "synced"
      ? ` ${SYNC_SUFFIX[lang].synced}`
      : effective === "error"
        ? ` ${SYNC_SUFFIX[lang].error}`
        : effective === "syncing"
          ? ` ${SYNC_SUFFIX[lang].syncing}`
          : ""
  tray.setToolTip(`Zlog${suffix}`)
}
