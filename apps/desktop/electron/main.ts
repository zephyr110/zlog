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
  main().catch((err) => {
    dialog.showErrorBox("Zlog 启动失败", String(err))
    app.exit(1)
  })
}

async function main() {
  const configStore = new ConfigStore(app.getPath("userData"))
  const dbPath = join(app.getPath("userData"), "zlog.db")
  // standalone 产物嵌套路径（Task 1 spike 结论）：trace root 为 workspace 根
  const serverJsPath = app.isPackaged
    ? join(process.resourcesPath, "standalone", "apps", "web", "server.js")
    : join(app.getAppPath(), "..", "..", "web", ".next", "standalone", "apps", "web", "server.js")

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
    if (!serverManager.url) return
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Zlog",
        autoHideMenuBar: true,
        webPreferences: { preload: join(__dirname, "preload.js") },
      })
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http")) void shell.openExternal(url)
        return { action: "deny" }
      })
      mainWindow.on("closed", () => { mainWindow = null })
    }
    void mainWindow.loadURL(serverManager.url)
    mainWindow.focus()
  }

  function openSettingsWindow() {
    const win = new BrowserWindow({
      width: 560,
      height: 640,
      title: "Zlog 设置",
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.js") },
    })
    void win.loadFile(join(app.getAppPath(), "renderer", "settings.html"), {
      query: { mode: "settings" },
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
  ipcMain.handle("config:save", async (_e, cfg: { username?: string; password?: string; syncUrl?: string; syncToken?: string }) => {
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
      config = { ...config, syncUrl: cfg.syncUrl?.trim() || undefined, syncToken: cfg.syncToken?.trim() || undefined }
    }
    configStore.save(config)
    // 配置变更（同步信息）后重启服务器使 env 生效
    if (server) {
      stopping = true
      server.stop()
      await startServerAndShow(config)
    } else {
      await startServerAndShow(config)
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
      height: 680,
      title: "Zlog 首次设置",
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.js") },
    })
    void firstRunWindow.loadFile(join(app.getAppPath(), "renderer", "settings.html"), {
      query: { mode: "firstrun" },
    })
  } else {
    await startServerAndShow(config)
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
