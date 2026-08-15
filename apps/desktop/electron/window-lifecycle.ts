import { isDesktopLocalUrl } from "./local-url"

/** 红灯关主窗口：未退出时隐藏；Cmd+Q / 托盘退出才真正关掉。 */
export function shouldHideMainWindowOnClose(isQuitting: boolean): boolean {
  return !isQuitting
}

/** 重开已有窗口时是否要重新 loadURL。隐藏后再开不应刷新；
 *  配置保存导致端口变化时必须重载。localhost / 127.0.0.1 / [::1]
 *  视为同一台，与 isDesktopLocalUrl 一致。 */
export function shouldReloadMainWindow(
  currentUrl: string | undefined,
  serverUrl: string
): boolean {
  if (!currentUrl) return true
  return !isDesktopLocalUrl(currentUrl, serverUrl)
}
