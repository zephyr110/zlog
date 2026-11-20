import type { MenuItemConstructorOptions } from "electron"
import type { ResolvedLang } from "./lang"

/** 导航类命令：主进程只发命令 ID，由桌面根壳用路由跳转（不整页刷新）。 */
export type AppNavCommand =
  | "view.site"
  | "view.dashboard"
  | "nav.posts"
  | "nav.comments"
  | "nav.newPost"

export const APP_NAV_PATHS: Record<AppNavCommand, string> = {
  "view.site": "/",
  "view.dashboard": "/admin/dashboard",
  "nav.posts": "/admin/posts",
  "nav.comments": "/admin/comments",
  "nav.newPost": "/admin/posts/new",
}

export interface AppMenuActions {
  navigate: (command: AppNavCommand) => void
  openSettings: () => void
  syncNow: () => void
  checkUpdates: () => void
  openInBrowser: () => void
}

interface Copy {
  file: string
  newPost: string
  settings: string
  syncNow: string
  closeWindow: string
  edit: string
  undo: string
  redo: string
  cut: string
  copy: string
  paste: string
  selectAll: string
  view: string
  openSite: string
  dashboard: string
  posts: string
  comments: string
  resetZoom: string
  zoomIn: string
  zoomOut: string
  fullscreen: string
  reload: string
  forceReload: string
  devTools: string
  window: string
  minimize: string
  zoom: string
  help: string
  openInBrowser: string
  checkUpdates: string
  hide: string
  hideOthers: string
  unhide: string
  quit: string
}

/** 桌面端文案不带句尾标点（与 settings 窗口一致）。 */
const COPY: Record<ResolvedLang, Copy> = {
  zh: {
    file: "文件",
    newPost: "新建文章",
    settings: "设置…",
    syncNow: "立即同步",
    closeWindow: "关闭窗口",
    edit: "编辑",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    paste: "粘贴",
    selectAll: "全选",
    view: "视图",
    openSite: "阅读模式",
    dashboard: "仪表盘",
    posts: "文章",
    comments: "评论",
    resetZoom: "实际大小",
    zoomIn: "放大",
    zoomOut: "缩小",
    fullscreen: "全屏",
    reload: "重新载入",
    forceReload: "强制重新载入",
    devTools: "开发者工具",
    window: "窗口",
    minimize: "最小化",
    zoom: "缩放",
    help: "帮助",
    openInBrowser: "在浏览器中打开当前页",
    checkUpdates: "检查更新",
    hide: "隐藏 Zlog",
    hideOthers: "隐藏其他",
    unhide: "全部显示",
    quit: "退出 Zlog",
  },
  en: {
    file: "File",
    newPost: "New Post",
    settings: "Settings…",
    syncNow: "Sync Now",
    closeWindow: "Close Window",
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    view: "View",
    openSite: "Reading Mode",
    dashboard: "Dashboard",
    posts: "Posts",
    comments: "Comments",
    resetZoom: "Actual Size",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    fullscreen: "Full Screen",
    reload: "Reload",
    forceReload: "Force Reload",
    devTools: "Toggle Developer Tools",
    window: "Window",
    minimize: "Minimize",
    zoom: "Zoom",
    help: "Help",
    openInBrowser: "Open Current Page in Browser",
    checkUpdates: "Check for Updates",
    hide: "Hide Zlog",
    hideOthers: "Hide Others",
    unhide: "Show All",
    quit: "Quit Zlog",
  },
}

/** 原生应用菜单模板。平台差异只影响应用菜单与退出项的位置。 */
export function buildAppMenuTemplate(opts: {
  lang: ResolvedLang
  platform: NodeJS.Platform
  /** 自定义菜单会顶掉 Electron 的默认菜单，开发期需要显式补回调试项。 */
  devTools?: boolean
  actions: AppMenuActions
}): MenuItemConstructorOptions[] {
  const t = COPY[opts.lang]
  const { actions } = opts
  const isMac = opts.platform === "darwin"

  const appMenu: MenuItemConstructorOptions = {
    label: "Zlog",
    submenu: [
      { label: t.settings, accelerator: "CmdOrCtrl+,", click: actions.openSettings },
      { label: t.checkUpdates, click: actions.checkUpdates },
      { type: "separator" },
      { label: t.hide, role: "hide" },
      { label: t.hideOthers, role: "hideOthers" },
      { label: t.unhide, role: "unhide" },
      { type: "separator" },
      { label: t.quit, role: "quit" },
    ],
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: t.file,
    submenu: [
      { label: t.newPost, accelerator: "CmdOrCtrl+N", click: () => actions.navigate("nav.newPost") },
      { label: t.syncNow, click: actions.syncNow },
      { type: "separator" },
      ...(isMac
        ? [{ label: t.closeWindow, role: "close" as const }]
        : [
            { label: t.settings, accelerator: "CmdOrCtrl+,", click: actions.openSettings },
            { type: "separator" as const },
            { label: t.quit, role: "quit" as const },
          ]),
    ],
  }

  const editMenu: MenuItemConstructorOptions = {
    label: t.edit,
    submenu: [
      { label: t.undo, role: "undo" },
      { label: t.redo, role: "redo" },
      { type: "separator" },
      { label: t.cut, role: "cut" },
      { label: t.copy, role: "copy" },
      { label: t.paste, role: "paste" },
      { label: t.selectAll, role: "selectAll" },
    ],
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: t.view,
    submenu: [
      { label: t.openSite, accelerator: "CmdOrCtrl+1", click: () => actions.navigate("view.site") },
      {
        label: t.dashboard,
        accelerator: "CmdOrCtrl+2",
        click: () => actions.navigate("view.dashboard"),
      },
      { label: t.posts, accelerator: "CmdOrCtrl+3", click: () => actions.navigate("nav.posts") },
      {
        label: t.comments,
        accelerator: "CmdOrCtrl+4",
        click: () => actions.navigate("nav.comments"),
      },
      { type: "separator" },
      { label: t.resetZoom, role: "resetZoom" },
      { label: t.zoomIn, role: "zoomIn" },
      { label: t.zoomOut, role: "zoomOut" },
      { type: "separator" },
      { label: t.fullscreen, role: "togglefullscreen" },
      ...(opts.devTools
        ? [
            { type: "separator" as const },
            { label: t.reload, role: "reload" as const },
            { label: t.forceReload, role: "forceReload" as const },
            { label: t.devTools, role: "toggleDevTools" as const },
          ]
        : []),
    ],
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: t.window,
    submenu: [
      { label: t.minimize, role: "minimize" },
      // zoom 角色只在 macOS 存在
      ...(isMac
        ? [
            { label: t.zoom, role: "zoom" as const },
            { type: "separator" as const },
            { role: "front" as const },
          ]
        : []),
    ],
  }

  const helpMenu: MenuItemConstructorOptions = {
    label: t.help,
    role: "help",
    submenu: [
      {
        label: t.openInBrowser,
        accelerator: "CmdOrCtrl+Shift+B",
        click: actions.openInBrowser,
      },
      ...(!isMac ? [{ label: t.checkUpdates, click: actions.checkUpdates }] : []),
    ],
  }

  return [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ]
}
