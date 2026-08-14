import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { join, resolve, sep } from "node:path"
import { ConfigStore, type DesktopConfig } from "./config-store"
import { LangFile, isLangPref, type LangPref, type ResolvedLang } from "./lang"
import {
  compareVersions,
  downloadUpdate,
  fetchLatestRelease,
  openDownloadedUpdate,
  pickAssetUrl,
  updatesDir,
  type UpdateCheckResult,
} from "./updater"
import { ServerManager } from "./server-manager"
import { buildServerEnv } from "./server-env"
import { isValidSyncUrl } from "./validate"
import { createTray, updateTrayLanguage, updateTraySyncStatus, type TrayActions } from "./tray"

/** 设置类窗口标题（跟随生效语言；语言切换时由 setWindowTitles 更新）。 */
const WINDOW_TITLES: Record<ResolvedLang, { settings: string; firstRun: string }> = {
  zh: { settings: "Zlog 设置", firstRun: "Zlog 首次设置" },
  en: { settings: "Zlog Settings", firstRun: "Zlog First-Time Setup" },
}

// 测试与 CI：可覆盖 userData 目录（Playwright 冒烟测试使用）。
if (process.env.ZLOG_USER_DATA_DIR) {
  app.setPath("userData", process.env.ZLOG_USER_DATA_DIR)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Tray 与 BrowserWindow 都必须在 ready 之后创建，否则
  // "Cannot create Tray before app is ready"（模块级调用 main 会先于 ready）。
  void app.whenReady().then(() =>
    main().catch((err) => {
      dialog.showErrorBox("Zlog 启动失败", String(err))
      app.exit(1)
    })
  )
}

async function main() {
  const configStore = new ConfigStore(app.getPath("userData"))
  const dbPath = join(app.getPath("userData"), "zlog.db")
  // standalone 产物嵌套路径（Task 1 spike 结论）：trace root 为 workspace 根。
  // 用 __dirname 而非 app.getAppPath()：`electron .` 时两者一致，但
  // `electron dist/main.js`（Playwright 冒烟测试的启动方式）下 getAppPath()
  // 是主脚本所在目录（apps/desktop/dist），会拼出 apps/apps/web 的错误路径。
  // dist/../../.. 才是 workspace 根（dist → desktop → apps → 根）。
  const serverJsPath = app.isPackaged
    ? join(process.resourcesPath, "standalone", "apps", "web", "server.js")
    : join(__dirname, "..", "..", "..", "apps", "web", ".next", "standalone", "apps", "web", "server.js")

  let server: ServerManager | null = null
  let mainWindow: BrowserWindow | null = null
  let settingsWindow: BrowserWindow | null = null
  let firstRunWindow: BrowserWindow | null = null
  let config: DesktopConfig | null = configStore.load()

  // ── 语言：单一事实源 = userData/lang.json（见 lang.ts）。
  // systemLocale 只取启动时刻（跟随系统模式）；系统语言变更需重启生效。
  const systemLocale = process.env.ZLOG_LANG || app.getLocale()
  const langFile = new LangFile(app.getPath("userData"))
  let currentLang: ResolvedLang = langFile.loadOrInit(systemLocale).resolved
  // 旧版本可能写入过非法 syncUrl（校验是后加的）——启动时兜底清除，
  // 否则 libsql 原生客户端解析 panic、服务器每次启动即崩溃
  if (config?.syncUrl && !isValidSyncUrl(config.syncUrl)) {
    config = { ...config, syncUrl: undefined, syncToken: undefined }
    configStore.save(config)
  }
  const logDir = join(app.getPath("userData"), "logs")

  // 托盘动作单处构造（createTray 与 updateTrayLanguage 共用）：
  // 两处手写字面量会随 TrayActions 成员演化而漂移
  const trayActions: TrayActions = {
    onOpen: () => showMainWindow(),
    onSettings: () => openSettingsWindow(),
    onSyncNow: () => void requestSyncNow(),
    onQuit: () => app.quit(),
  }
  const tray = createTray(trayActions, currentLang)

  // 崩溃处理：自动重启一次（spec §6），再次崩溃只弹窗提示，不循环。
  let crashRestarts = 0
  // 主动重启（设置保存）时旧进程的 exit 事件会被 onServerExit 误判为崩溃，
  // 导致二次拉起 + 消耗自动重启额度：用一次性 latch 吞掉该次退出。
  let stopping = false
  const onServerExit = (code: number | null) => {
    if (stopping) {
      stopping = false
      return
    }
    updateTraySyncStatus(tray, "server-exited", undefined, currentLang)
    if ((app as unknown as { isQuitting?: boolean }).isQuitting) return
    if (config && crashRestarts < 1) {
      crashRestarts++
      void startServerAndShow(config).catch((err) => {
        dialog.showErrorBox(
          "Zlog 博客服务重启失败",
          `本地博客服务已退出并尝试重启，但重启失败（code ${code}）：${String(err)}。\n数据目录：${app.getPath("userData")}\n日志：${join(logDir, "server.log")}`
        )
      })
      return
    }
    dialog.showErrorBox(
      "Zlog 博客服务异常退出",
      `本地博客服务已退出（code ${code}）。\n数据目录：${app.getPath("userData")}\n日志：${join(logDir, "server.log")}`
    )
  }

  const serverManager = new ServerManager(serverJsPath, logDir, onServerExit)

  async function startServerAndShow(cfg: DesktopConfig) {
    await serverManager.start(buildServerEnv(cfg, dbPath, langFile.filePath))
    server = serverManager
    showMainWindow()
  }

  function showMainWindow() {
    // url 恒为真（端口 0 时返回 http://127.0.0.1:0），必须用 port 判断服务是否已启动
    if (serverManager.port <= 0) return
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Zlog",
        autoHideMenuBar: true,
        // 博客窗口渲染用户可发布的内容，不给 preload：window.zlog 会暴露
        // sessionSecret / adminPasswordHash / desktopKey / syncToken，
        // 博客侧任何 XSS 都可能把这些密钥送出（settings / 首启向导窗口才需要）。
      })
      // 站内跳转策略：admin 的「查看线上」等链接是相对路径（target=_blank，
      // 解析后指向本地 origin）——在应用内导航而非丢给浏览器；外部链接
      // （GitHub/社交/远程站点，仅 http/https）仍走系统浏览器。同窗口点击
      // 外部链接时也不让窗口离开应用（拦截后转交浏览器）。
      //
      // 每次事件实时求值（不缓存 origin）：config:save 会重启服务器并换端口，
      // 缓存的旧 origin 会让保存后的所有站内链接被误判为外部。
      const isLocalUrl = (raw: string): boolean => {
        try {
          const u = new URL(raw)
          if (u.protocol !== "http:" && u.protocol !== "https:") return false
          return u.origin === new URL(serverManager.url).origin
        } catch {
          return false
        }
      }
      const openExternalIfWeb = (raw: string) => {
        if (/^https?:\/\//.test(raw)) void shell.openExternal(raw)
      }
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isLocalUrl(url)) {
          void mainWindow?.loadURL(url)
        } else {
          openExternalIfWeb(url) // javascript:/file:/自定义协议一律丢弃
        }
        return { action: "deny" }
      })
      mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!isLocalUrl(url)) {
          event.preventDefault()
          openExternalIfWeb(url)
        }
      })
      mainWindow.on("closed", () => { mainWindow = null })
    }
    void mainWindow.loadURL(serverManager.url)
    mainWindow.focus()
  }

  function openSettingsWindow() {
    // 单实例：托盘/重复点击只聚焦已有窗口，不叠开多个设置窗口
    // （多窗口会让 settingsWindow ref 互相覆盖，语言切换广播丢目标）
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      // macOS 上 app 未激活（托盘常驻菜单栏）时仅 focus() 不生效：
      // 需 show + restore + app.focus({steal:true}) 才能置前
      if (settingsWindow.isMinimized()) settingsWindow.restore()
      settingsWindow.show()
      settingsWindow.focus()
      app.focus({ steal: true })
      return
    }
    // 720 宽：左侧栏 208px + 内容区；侧栏固定，内容区内部滚动
    const win = new BrowserWindow({
      width: 720,
      height: 720,
      title: WINDOW_TITLES[currentLang].settings,
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.js") },
    })
    settingsWindow = win
    win.on("closed", () => {
      // 只在自身仍是当前引用时清空：关闭后立即重开时，若旧窗口的
      // closed 回调晚于新窗口赋值执行，会把新窗口的引用抹掉，
      // 下次托盘点击又叠开一个窗口
      if (settingsWindow === win) settingsWindow = null
    })
    openExternalLinksInBrowser(win)
    void win.loadFile(join(__dirname, "..", "renderer", "settings.html"), {
      query: { mode: "settings" },
    })
  }

  /** 设置类窗口中的外链（Turso 控制台/文档）一律交给系统浏览器，
   *  不在应用内新开窗口。 */
  function openExternalLinksInBrowser(win: BrowserWindow) {
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        void shell.openExternal(url)
      }
      return { action: "deny" }
    })
  }

  async function requestSyncNow(): Promise<void> {
    // url 恒为真（端口 0 时返回 http://127.0.0.1:0），必须用 port 判断
    if (serverManager.port <= 0) return
    try {
      const res = await fetch(`${serverManager.url}/api/sync`, {
        method: "POST",
        headers: { "X-Zlog-Desktop-Key": config?.desktopKey ?? "" },
      })
      const body = (await res.json()) as { status?: unknown }
      updateTraySyncStatus(tray, res.ok ? "synced" : "error", undefined, currentLang)
      return body.status as Promise<unknown> as unknown as void
    } catch {
      updateTraySyncStatus(tray, "error", undefined, currentLang)
    }
  }

  async function getSyncStatus(): Promise<unknown> {
    if (!serverManager.url) return { configured: false }
    try {
      const res = await fetch(`${serverManager.url}/api/sync/status`)
      return await res.json()
    } catch {
      return { configured: false, error: "server-down" }
    }
  }

  // ── IPC ──
  ipcMain.handle("config:load", () => configStore.load())
  ipcMain.handle("config:save", async (_e, cfg: {
    username?: string
    password?: string
    syncUrl?: string
    syncToken?: string
    vercelApiToken?: string
    vercelProjectId?: string
    vercelTeamId?: string
    gaPropertyId?: string
    gaClientEmail?: string
    gaPrivateKey?: string
  }) => {
    if (!config) {
      const passwordHash = bcrypt.hashSync(String(cfg.password ?? ""), 10)
      config = {
        adminUsername: String(cfg.username || "admin"),
        adminPasswordHash: passwordHash,
        sessionSecret: randomBytes(32).toString("hex"),
        desktopKey: randomBytes(32).toString("hex"),
        syncUrl: cfg.syncUrl?.trim() || undefined,
        syncToken: cfg.syncToken?.trim() || undefined,
      }
    } else {
      config = {
        ...config,
        syncUrl: cfg.syncUrl?.trim() || undefined,
        syncToken: cfg.syncToken?.trim() || undefined,
        // 流量分析（可选，仅设置模式填写）
        vercelApiToken: cfg.vercelApiToken?.trim() || undefined,
        vercelProjectId: cfg.vercelProjectId?.trim() || undefined,
        vercelTeamId: cfg.vercelTeamId?.trim() || undefined,
        gaPropertyId: cfg.gaPropertyId?.trim() || undefined,
        gaClientEmail: cfg.gaClientEmail?.trim() || undefined,
        gaPrivateKey: cfg.gaPrivateKey?.trim() || undefined,
      }
    }
    // 与渲染层同源的防御性校验（唯一权威实现见 validate.ts）：非法
    // syncUrl 会让 libsql 原生客户端解析时 panic、拖垮整个服务器进程
    // （真实事故：URL 字段误填用户名）。校验先于 config 合并执行。
    if (cfg.syncUrl?.trim() && !isValidSyncUrl(cfg.syncUrl.trim())) {
      return { ok: false, error: "数据库 URL 需以 libsql:// 开头，如 libsql://your-db.turso.io" }
    }
    configStore.save(config)
    // 配置变更（同步信息）后重启服务器使 env 生效
    if (server) {
      stopping = true
      server.stop()
    }
    try {
      await startServerAndShow(config)
    } catch (err) {
      // 重启失败（如 30s 健康检查超时）：弹窗告知；finally 复位 stopping，
      // 否则后续每次 onServerExit 都被吞掉，崩溃处理整场会话失效。
      dialog.showErrorBox(
        "Zlog 博客服务启动失败",
        `本地博客服务启动失败：${String(err)}。\n数据目录：${app.getPath("userData")}\n日志：${join(logDir, "server.log")}`
      )
      return { ok: false }
    } finally {
      stopping = false
    }
    // 首启/配置变更后立即执行一次初始同步（设计文档 §4 承诺"首次同步
    // 全量拉取"；libsql 的 syncInterval 首个周期要等 300s，不能依赖它）。
    if (config.syncUrl) {
      void requestSyncNow()
    }
    firstRunWindow?.close()
    firstRunWindow = null
    return { ok: true }
  })
  ipcMain.handle("sync:now", () => requestSyncNow())
  ipcMain.handle("sync:status", () => getSyncStatus())
  ipcMain.handle("app:openDataDir", () => {
    void shell.openPath(app.getPath("userData"))
  })
  ipcMain.handle("app:version", () => app.getVersion())
  ipcMain.handle("app:quit", () => app.quit())

  // ── 更新检查与下载（关于面板） ───────────────────────────────────
  // GitHub API 走 net.fetch（Chromium 栈，跟随系统代理）。
  ipcMain.handle("update:check", async (): Promise<UpdateCheckResult> => {
    const current = app.getVersion()
    try {
      const release = await fetchLatestRelease()
      if (!release) return { ok: false, hasUpdate: false, current, error: "fetch" }
      const latest = release.tag.replace(/^v/, "")
      const hasUpdate = compareVersions(latest, current) > 0
      return {
        ok: true,
        hasUpdate,
        current,
        latest,
        downloadUrl: hasUpdate
          ? (pickAssetUrl(release.assets, process.platform, process.arch) ?? undefined)
          : undefined,
      }
    } catch (err) {
      return { ok: false, hasUpdate: false, current, error: String(err) }
    }
  })
  ipcMain.handle("update:download", async (_e, url: unknown) => {
    if (typeof url !== "string" || !url.startsWith("https://")) {
      return { ok: false, error: "invalid url" }
    }
    let dest: string
    try {
      // 文件名兜底空串（URL 尾 / 时 pathname 末段为空）→ 退化为 "update"
      dest = join(updatesDir(), new URL(url).pathname.split("/").pop() || "update")
    } catch {
      return { ok: false, error: "invalid url" }
    }
    const sendProgress = (percent: number) => {
      try {
        // 窗口可能在下载中被关闭：webContents 已销毁时 send 抛异常，
        // 捕获后下载继续（孤儿包留在 updatesDir，重开窗口可重新下载）
        settingsWindow?.webContents.send("update:progress", { percent })
      } catch {
        // 忽略：进度无人接收，下载仍须完成
      }
    }
    try {
      await downloadUpdate(url, dest, sendProgress)
      // 只下载不自动打开：由用户在设置窗口确认后触发（update:open）
      return { ok: true, dest }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  ipcMain.handle("update:open", (_e, dest: unknown) => {
    // 只允许打开 updatesDir 内的文件（渲染层传路径不可信）。
    // resolve 后校验：前缀匹配防不住 "../" 段，须归一化再比较
    if (typeof dest !== "string") return { ok: false, error: "invalid dest" }
    const base = resolve(updatesDir())
    const target = resolve(dest)
    if (target !== base && !target.startsWith(`${base}${sep}`)) {
      return { ok: false, error: "outside updates dir" }
    }
    openDownloadedUpdate(target)
    return { ok: true }
  })

  // ── 语言（单一事实源 lang.json；每次读盘，设置窗口与 /api/lang 共享）──
  ipcMain.handle("lang:get", () => langFile.loadOrInit(systemLocale))
  ipcMain.handle("lang:set", (_e, pref: unknown) => {
    if (!isLangPref(pref)) return { ok: false, error: "invalid pref" }
    const state = langFile.setPref(pref, systemLocale)
    currentLang = state.resolved
    // 设置类窗口标题 + 托盘菜单 + tooltip 后缀跟随新语言
    updateTrayLanguage(tray, currentLang, trayActions)
    for (const w of [settingsWindow, firstRunWindow]) {
      if (w && !w.isDestroyed()) {
        const isFirstRun = w === firstRunWindow
        w.setTitle(
          isFirstRun ? WINDOW_TITLES[currentLang].firstRun : WINDOW_TITLES[currentLang].settings
        )
      }
    }
    // 广播给博客/admin 主窗口（无 preload）：i18n-provider 监听
    // "zlog-lang-change" 事件即时切换，无需刷新。
    if (mainWindow && !mainWindow.isDestroyed()) {
      void mainWindow.webContents
        .executeJavaScript(
          `window.dispatchEvent(new CustomEvent("zlog-lang-change", { detail: ${JSON.stringify(state)} }))`
        )
        .catch((err) => {
          // 页面正在导航/崩溃时广播失败：博客窗口停留在旧语言，
          // 下次整页加载时 i18n-provider 会从 /api/lang 重新同步
          console.warn("zlog-lang-change broadcast failed:", err)
        })
    }
    return { ok: true, state }
  })

  // ── 首启向导 ──
  if (!config) {
    // 800 + useContentSize：高度按网页内容算（不含标题栏）。760 含窗框时
    // 品牌/CTA 间距加大后主按钮会被裁到折线以下。
    firstRunWindow = new BrowserWindow({
      width: 560,
      height: 800,
      useContentSize: true,
      title: WINDOW_TITLES[currentLang].firstRun,
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.js") },
    })
    openExternalLinksInBrowser(firstRunWindow)
    // 与 serverJsPath 同理：`electron dist/main.js` 下 getAppPath() 指向
    // dist/，必须用 __dirname 相对路径（dist/../renderer）。
    void firstRunWindow.loadFile(join(__dirname, "..", "renderer", "settings.html"), {
      query: { mode: "firstrun" },
    })
  } else {
    await startServerAndShow(config)
    // 启动路径同样立即执行首次同步（与 config:save 后一致），
    // 否则要等 libsql syncInterval（300s）首个周期
    if (config.syncUrl) {
      void requestSyncNow()
    }
  }

  app.on("second-instance", () => showMainWindow())

  app.on("will-quit", () => {
    ;(app as unknown as { isQuitting: boolean }).isQuitting = true
    serverManager.stop()
  })

  // 同步状态轮询（30s，仅供托盘 tooltip）。同时从 lang.json 重读生效
  // 语言：web 端（/api/lang）切换语言不会走 lang:set IPC，主进程内存值
  // 会陈旧——轮询时顺带同步托盘菜单与 tooltip 语言（最长滞后一个周期）。
  setInterval(() => {
    currentLang = langFile.loadOrInit(systemLocale).resolved
    updateTrayLanguage(tray, currentLang, trayActions)
    void getSyncStatus().then((s) => updateTraySyncStatus(tray, "idle", s, currentLang))
  }, 30_000)
}
