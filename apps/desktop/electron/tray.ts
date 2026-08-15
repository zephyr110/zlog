import { Tray, Menu, nativeImage } from "electron"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ResolvedLang } from "./lang"

export interface TrayActions {
  onOpen: () => void
  onSettings: () => void
  onSyncNow: () => void
  onQuit: () => void
}

const TRAY_LABELS: Record<ResolvedLang, { open: string; settings: string; sync: string; quit: string }> = {
  zh: { open: "打开", settings: "设置", sync: "立即同步", quit: "退出" },
  en: { open: "Open", settings: "Settings", sync: "Sync Now", quit: "Quit" },
}

const SYNC_SUFFIX: Record<ResolvedLang, { synced: string; error: string }> = {
  zh: { synced: "✓ 已同步", error: "⚠ 同步异常" },
  en: { synced: "✓ Synced", error: "⚠ Sync error" },
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

function buildMenu(lang: ResolvedLang, actions: TrayActions): Menu {
  const labels = TRAY_LABELS[lang]
  return Menu.buildFromTemplate([
    { label: labels.open, click: actions.onOpen },
    { label: labels.settings, click: actions.onSettings },
    { label: labels.sync, click: actions.onSyncNow },
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

export function updateTraySyncStatus(
  tray: Tray,
  state: string,
  detail?: unknown,
  lang: ResolvedLang = "zh"
): void {
  const suffix =
    state === "synced"
      ? ` ${SYNC_SUFFIX[lang].synced}`
      : state === "error"
        ? ` ${SYNC_SUFFIX[lang].error}`
        : ""
  tray.setToolTip(`Zlog${suffix}`)
  void detail
}
