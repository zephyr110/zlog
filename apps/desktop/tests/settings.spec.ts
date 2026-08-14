import { test, expect, _electron as electron } from "@playwright/test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * 设置模式 e2e：覆盖 code review 修复的回归面——
 * 1. 表单预填已保存配置（C1 修复：空字段不再被当作"清空"保存）
 * 2. 保存后流量分析凭据不被抹掉（C1）；任意设置保存都会重启服务器
 * 3. 保存成功后按钮复位（I1）
 * 4. 重启（新端口）后站内导航依然在应用内（C2）
 *
 * 注意：种子不配置 syncUrl——本测试不涉及同步（假 syncUrl 会触发
 * 同步引擎抖动，污染测试目标）。同步行为由 first-run 测试与手动验证覆盖。
 */
const SEED = {
  adminUsername: "admin",
  adminPasswordHash: "$2b$10$testtesttesttesttesttesttesttesttesttesttesttesttesttest",
  sessionSecret: "s",
  desktopKey: "k",
  vercelApiToken: "va-tok",
  vercelProjectId: "prj_1",
  gaPropertyId: "123456",
  gaClientEmail: "svc@x.iam.gserviceaccount.com",
  gaPrivateKey: "-----BEGIN PRIVATE KEY-----abc",
}

test("settings mode: prefill, preserve analytics on save, button resets, nav survives restart", async () => {
  const userData = mkdtempSync(join(tmpdir(), "zlog-e2e-set-"))
  writeFileSync(join(userData, "zlog-config.json"), JSON.stringify(SEED))

  const app = await electron.launch({
    args: [join(__dirname, "..", "dist", "main.js")],
    env: { ...process.env, ZLOG_USER_DATA_DIR: userData },
  })

  try {
    // 博客窗口（服务器启动；冷启动在负载下可达 30s+，轮询放宽到 60s）
    let blog: ReturnType<typeof app.firstWindow> | null = null
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const w = app.windows().find((x) => x.url().startsWith("http://127.0.0.1:"))
      if (w) { blog = w; break }
    }
    expect(blog, "blog window should boot").toBeTruthy()

    // 以主进程同款方式打开设置窗口（mode=settings）
    const RES = join(__dirname, "..")
    await app.evaluate(({ BrowserWindow, shell }, p) => {
      const win = new BrowserWindow({
        width: 640, height: 720, title: "Zlog 设置", autoHideMenuBar: true,
        webPreferences: { preload: p.preload },
      })
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) void shell.openExternal(url)
        return { action: "deny" }
      })
      void win.loadFile(p.html, { query: { mode: "settings" } })
      return true
    }, { preload: join(RES, "dist", "preload.js"), html: join(RES, "renderer", "settings.html") })

    let settings: ReturnType<typeof app.firstWindow> | null = null
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300))
      settings = app.windows().find((x) => x.url().includes("settings.html"))
      if (settings) break
    }
    expect(settings, "settings window should open").toBeTruthy()

    // 1) 预填：已保存的流量分析值应回显（C1）；未配置的同步字段应为空
    await settings!.waitForTimeout(800)
    expect(await settings!.inputValue("#syncUrl")).toBe("")
    expect(await settings!.inputValue("#vercelApiToken")).toBe(SEED.vercelApiToken)
    expect(await settings!.inputValue("#gaPrivateKey")).toBe(SEED.gaPrivateKey)

    // 2) 只改一个流量分析字段，保存 → 其余凭据必须保留（C1 回归）。
    //    任意设置保存都会重启服务器；按钮在重启完成后才复位（3-8s），
    //    轮询等待而非固定 sleep
    await settings!.click('.nav-item[data-panel="analytics"]')
    await settings!.fill("#vercelApiToken", "va-tok-2")
    await settings!.click("#saveBtn")
    await expect(settings!.locator("#saveBtn")).toBeEnabled({ timeout: 30_000 })
    expect(await settings!.locator("#saveBtn .spinner").count()).toBe(0)

    // 3) 配置写入且其余凭据保留（C1 回归）
    const cfg = JSON.parse(readFileSync(join(userData, "zlog-config.json"), "utf8"))
    expect(cfg.vercelApiToken).toBe("va-tok-2")
    expect(cfg.gaPrivateKey).toBe(SEED.gaPrivateKey)
    expect(cfg.gaClientEmail).toBe(SEED.gaClientEmail)

    // 4) 保存触发了服务器重启（新端口）；站内 target=_blank 链接仍应用内
    //    导航（C2 回归：用重启后的新端口验证）
    const preSaveUrl = blog!.url()
    await blog!.waitForURL((u) => u !== preSaveUrl, { timeout: 30_000 })
    // URL 变化时导航可能仍在进行——等页面加载完再注入测试链接
    await blog!.waitForLoadState("domcontentloaded", { timeout: 30_000 })
    const blogUrl = blog!.url().replace(/\/$/, "")
    await blog!.evaluate((b) => {
      const a = document.createElement("a")
      a.href = b + "/feed.xml"
      a.target = "_blank"
      a.id = "postSaveLink"
      a.textContent = "TEST"
      a.style.position = "fixed"
      a.style.zIndex = "9999"
      document.body.appendChild(a)
    }, blogUrl)
    const winsBefore = app.windows().length
    await blog!.click("#postSaveLink")
    await blog!.waitForTimeout(2000)
    expect(blog!.url()).toContain("/feed.xml")
    expect(app.windows().length).toBe(winsBefore)
  } finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
  }
})
