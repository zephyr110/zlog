import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { join } from "node:path"
import { ConfigStore, type DesktopConfig } from "./config-store"
import { ServerManager } from "./server-manager"
import { buildServerEnv } from "./server-env"
import { createTray, updateTraySyncStatus, type TrayActions } from "./tray"

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
  let firstRunWindow: BrowserWindow | null = null
  let config: DesktopConfig | null = configStore.load()
  const logDir = join(app.getPath("userData"), "logs")

  const tray = createTray({
    onOpen: () => showMainWindow(),
    onSettings: () => openSettingsWindow(),
    onSyncNow: () => void requestSyncNow(),
    onQuit: () => app.quit(),
  })

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
    updateTraySyncStatus(tray, "server-exited")
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
    await serverManager.start(buildServerEnv(cfg, dbPath))
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
      // （GitHub/社交/远程站点）仍走系统浏览器。同窗口点击外部链接时
      // 也不让窗口离开应用（拦截后转交浏览器）。
      const localOrigin = serverManager.url
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(localOrigin)) {
          void mainWindow?.loadURL(url)
        } else {
          void shell.openExternal(url)
        }
        return { action: "deny" }
      })
      mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(localOrigin)) {
          event.preventDefault()
          void shell.openExternal(url)
        }
      })
      mainWindow.on("closed", () => { mainWindow = null })
    }
    void mainWindow.loadURL(serverManager.url)
    mainWindow.focus()
  }

  function openSettingsWindow() {
    const win = new BrowserWindow({
      width: 560,
      height: 700,
      title: "Zlog 设置",
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.js") },
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
    if (!serverManager.url) return
    try {
      const res = await fetch(`${serverManager.url}/api/sync`, {
        method: "POST",
        headers: { "X-Zlog-Desktop-Key": config?.desktopKey ?? "" },
      })
      const body = (await res.json()) as { status?: unknown }
      updateTraySyncStatus(tray, res.ok ? "synced" : "error")
      return body.status as Promise<unknown> as unknown as void
    } catch {
      updateTraySyncStatus(tray, "error")
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
    // 与渲染层同源的防御性校验：非法 syncUrl 会让 libsql 原生客户端
    // 在解析时 panic、整个服务器进程崩溃（真实事故：URL 字段误填用户名）
    if (config.syncUrl && !/^(libsql|file):\/\//.test(config.syncUrl)) {
      return { ok: false, error: "数据库 URL 需以 libsql:// 开头，如 libsql://your-db.turso.io。" }
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
  ipcMain.handle("app:quit", () => app.quit())

  // ── 首启向导 ──
  if (!config) {
    firstRunWindow = new BrowserWindow({
      width: 560,
      height: 900,
      title: "Zlog 首次设置",
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

  // 同步状态轮询（30s，仅供托盘 tooltip）
  setInterval(() => {
    void getSyncStatus().then((s) => updateTraySyncStatus(tray, "idle", s))
  }, 30_000)
}
