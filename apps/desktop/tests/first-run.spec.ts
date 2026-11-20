import { test, expect, _electron as electron } from "@playwright/test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * 首启向导路径回归测试：此前向导从未被自动化覆盖，settings.js 因
 * contextBridge 全局绑定重名（`const zlog`）整脚本失效、点保存毫无反应
 * 的 bug 在真实安装里被用户发现。此测试确保：向导渲染 → 保存 →
 * 服务器自动启动 → 博客窗口打开 → 配置落盘，全链路可工作。
 */
test("first-run wizard saves config and boots the blog server", async () => {
  const userData = mkdtempSync(join(tmpdir(), "zlog-e2e-fr-"))
  const app = await electron.launch({
    args: [join(__dirname, "..", "dist", "main.js")],
    env: { ...process.env, ZLOG_USER_DATA_DIR: userData },
  })

  try {
    // 1) 无配置启动 → 首启向导窗口
    const wizard = await app.firstWindow()
    await wizard.waitForLoadState("domcontentloaded")
    expect(wizard.url()).toContain("settings.html?mode=firstrun")

    // 2) 向导脚本必须正常运行：首启模式隐藏同步按钮（服务器未启动，
    //    保存前「立即同步」无意义）
    await expect(wizard.locator("#syncBtn")).toBeHidden()

    // 3) 语言可在创建账号前切换，同步可选能力默认折叠
    await expect(wizard.locator("#firstRunLang")).toBeVisible()
    expect(
      await wizard.locator("#syncDetails").evaluate((el) => (el as HTMLDetailsElement).open)
    ).toBe(false)
    await wizard.locator('[data-lang-choice="en"]').click()
    await expect(wizard.locator("#title")).toHaveText("Zlog First-Time Setup")
    await expect(wizard.locator('[data-lang-choice="en"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    // 4) 展开同步后只填 URL：应被成对校验拦下并聚焦 Token
    await wizard.locator("#syncDetails summary").click()
    await wizard.fill("#username", "admin")
    await wizard.fill("#password", "testpass123")
    await wizard.fill("#password2", "testpass123")
    await wizard.fill("#syncUrl", "libsql://example.turso.io")
    await wizard.click("#saveBtn")
    await expect(wizard.locator("#syncToken")).toHaveAttribute("aria-invalid", "true")
    expect(
      await wizard.locator("#syncDetails").evaluate((el) => (el as HTMLDetailsElement).open)
    ).toBe(true)

    // 5) 清空同步后保存
    await wizard.fill("#syncUrl", "")
    await wizard.click("#saveBtn")

    // 6) 向导关闭，博客窗口出现并加载本地服务器
    const blog = await app.waitForEvent("window", {
      predicate: (w) => w.url().startsWith("http://127.0.0.1:"),
      timeout: 120_000,
    })
    await blog.waitForLoadState("domcontentloaded")
    expect(blog.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)

    // 7) 服务器已启动：公开的同步状态路由可达
    const status = await blog.evaluate(async () => {
      const res = await fetch("/api/sync/status")
      return { status: res.status, body: await res.json() }
    })
    expect(status.status).toBe(200)
    expect(status.body.configured).toBe(false) // 未配置同步 URL

    // 8) 配置已落盘（含随机生成的 desktopKey）
    const cfg = JSON.parse(readFileSync(join(userData, "zlog-config.json"), "utf8"))
    expect(cfg.adminUsername).toBe("admin")
    expect(cfg.desktopKey).toBeTruthy()
  } finally {
    await app.close().catch(() => {})
    rmSync(userData, { recursive: true, force: true })
  }
})
