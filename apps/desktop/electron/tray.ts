import { Tray, Menu, nativeImage } from "electron"
import { join } from "node:path"

export interface TrayActions {
  onOpen: () => void
  onSettings: () => void
  onSyncNow: () => void
  onQuit: () => void
}

/**
 * 托盘图标选择：
 * - macOS：模板图标（黑色图形 + alpha）。文件名以 Template 结尾 →
 *   Electron 自动标记为模板图（isTemplateImage），系统按菜单栏
 *   浅色/深色主题自动渲染黑/白（Apple HIG）；@2x 相邻文件自动作为
 *   Retina 尺寸。
 * - Windows/Linux：模板图语义不适用，用彩色图标。
 * - 模板图缺失（派生失败/旧资源）时回退彩色图标。
 */
function trayIcon(): Electron.NativeImage {
  if (process.platform === "darwin") {
    const template = nativeImage.createFromPath(
      join(__dirname, "..", "assets", "trayTemplate.png")
    )
    if (!template.isEmpty()) return template
  }
  return nativeImage
    .createFromPath(join(__dirname, "..", "assets", "tray.png"))
    .resize({ width: 16, height: 16 })
}

export function createTray(actions: TrayActions): Tray {
  const icon = trayIcon()
  const tray = new Tray(icon)
  tray.setToolTip("Zlog")
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开", click: actions.onOpen },
      { label: "设置", click: actions.onSettings },
      { label: "立即同步", click: actions.onSyncNow },
      { type: "separator" },
      { label: "退出", click: actions.onQuit },
    ])
  )
  return tray
}

export function updateTraySyncStatus(tray: Tray, state: string, detail?: unknown): void {
  const suffix = state === "synced" ? "✓ 已同步" : state === "error" ? "⚠ 同步异常" : ""
  tray.setToolTip(`Zlog${suffix}`)
  void detail
}
