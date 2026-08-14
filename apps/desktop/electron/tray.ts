import { Tray, Menu, nativeImage } from "electron"
import { join } from "node:path"

export interface TrayActions {
  onOpen: () => void
  onSettings: () => void
  onSyncNow: () => void
  onQuit: () => void
}

export function createTray(actions: TrayActions): Tray {
  const icon = nativeImage
    .createFromPath(join(__dirname, "..", "assets", "tray.png"))
    .resize({ width: 16, height: 16 })
  const tray = new Tray(icon)
  tray.setToolTip("Zlog")
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开博客", click: actions.onOpen },
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
