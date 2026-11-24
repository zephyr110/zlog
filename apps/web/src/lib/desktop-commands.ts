/** 原生菜单与桌面根壳共享的导航命令。
 *  Electron 主进程侧同一份映射在 apps/desktop/electron/app-menu.ts，
 *  两侧由 apps/web/test/desktop-commands.test.ts 的契约测试对齐。 */
export type DesktopNavCommand =
  | "view.site"
  | "view.dashboard"
  | "nav.posts"
  | "nav.comments"
  | "nav.newPost"

export const DESKTOP_NAV_PATHS: Record<DesktopNavCommand, string> = {
  "view.site": "/",
  "view.dashboard": "/admin/dashboard",
  "nav.posts": "/admin/posts",
  "nav.comments": "/admin/comments",
  "nav.newPost": "/admin/posts/new",
}

export function isDesktopNavCommand(value: unknown): value is DesktopNavCommand {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(DESKTOP_NAV_PATHS, value)
  )
}

/** 桌面内导航前的未保存确认：编辑器把脏状态挂在 window.__zlogEditorDirty。
 *  返回 true 表示可以继续导航。 */
export function confirmDesktopNavigation(message: string): boolean {
  return !window.__zlogEditorDirty || window.confirm(message)
}
