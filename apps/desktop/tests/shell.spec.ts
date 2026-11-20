import { test, expect, _electron as electron } from "@playwright/test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import bcrypt from "bcryptjs"

/** 原生菜单 → 主进程 executeJavaScript → 桌面根壳 → App Router 的完整链路。 */
test("desktop shell: mode switch and native menu navigate in-app", async () => {
  const userData = mkdtempSync(join(tmpdir(), "zlog-e2e-shell-"))
  writeFileSync(
    join(userData, "zlog-config.json"),
    JSON.stringify({
      adminUsername: "admin",
      adminPasswordHash: bcrypt.hashSync("testpass", 10),
      sessionSecret: "e2e-secret",
      desktopKey: "e2e-key",
    })
  )

  const app = await electron.launch({
    args: [join(__dirname, "..", "dist", "main.js")],
    env: { ...process.env, ZLOG_USER_DATA_DIR: userData },
  })

  try {
    const win = await app.firstWindow()
    // 首个窗口先是 about:blank，等主进程把本地服务地址载入后再取 base
    await win.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 30_000 })
    await win.waitForLoadState("domcontentloaded")
    const base = win.url().replace(/\/$/, "")

    // 直接建会话，绕开登录表单的水合时序
    const login = await win.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password: "testpass" },
    })
    expect(login.ok()).toBe(true)

    await win.goto(`${base}/admin/dashboard`)
    await expect(win.getByRole("group", { name: /桌面模式|Desktop mode/ })).toBeVisible()
    await expect(win.getByRole("button", { name: /^写作$|^Writing$/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    // 根壳已挂载（主进程据此决定是否退回整页跳转）；等待水合完成
    await win.waitForFunction(() => window.__zlogDesktopShell === true)

    // 视图 → 阅读模式：站内跳转，不整页刷新
    const clickedReading = await app.evaluate(({ Menu }) => {
      const view = Menu.getApplicationMenu()?.items.find(
        (item) => item.label === "视图" || item.label === "View"
      )
      const entry = view?.submenu?.items.find(
        (item) => item.label === "阅读模式" || item.label === "Reading Mode"
      )
      entry?.click()
      return Boolean(entry)
    })
    expect(clickedReading).toBe(true)
    await win.waitForURL(`${base}/`, { timeout: 15_000 })
    await expect(win.getByRole("button", { name: /^阅读$|^Reading$/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    // 阅读页切回写作：回到刚才停留的后台页面
    await win.getByRole("button", { name: /^写作$|^Writing$/ }).click()
    await win.waitForURL(/\/admin\/dashboard$/, { timeout: 15_000 })

    // 视图 → 文章
    const clickedPosts = await app.evaluate(({ Menu }) => {
      const view = Menu.getApplicationMenu()?.items.find(
        (item) => item.label === "视图" || item.label === "View"
      )
      const entry = view?.submenu?.items.find(
        (item) => item.label === "文章" || item.label === "Posts"
      )
      entry?.click()
      return Boolean(entry)
    })
    expect(clickedPosts).toBe(true)
    await win.waitForURL(/\/admin\/posts$/, { timeout: 15_000 })
  } finally {
    // 启动失败时 app 可能没起来；清理失败不能盖掉真实错误
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
  }
})
