import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "..")
const main = readFileSync(join(ROOT, "electron/main.ts"), "utf8")
const preload = readFileSync(join(ROOT, "electron/preload.ts"), "utf8")
const settings = readFileSync(join(ROOT, "renderer/settings.js"), "utf8")

describe("下载完成后的重启提示", () => {
  it("托盘与设置窗口的下载完成后都提示重启", () => {
    expect(main.match(/await offerRestartAfterDownload\(/g)).toHaveLength(2)
  })

  it("中英文案都有立即重启 / 稍后重启", () => {
    expect(main.match(/restartNow: "/g)).toHaveLength(2)
    expect(main.match(/restartLater: "/g)).toHaveLength(2)
  })

  it("「立即重启」退出应用；安装器统一在 will-quit 启动（稍后退出也安装）", () => {
    expect(main).toContain('ipcMain.handle("update:install"')
    expect(main).toContain("pendingUpdateInstaller.relaunch = true")
    expect(main).toContain("pendingUpdateInstaller = null")
    expect(main).toContain("launchInstaller(pending.dest, pending.relaunch)")
  })

  it("设置窗口下载时传 latest 供提示文案显示版本号", () => {
    expect(settings).toContain("downloadUpdate(updateInfo.downloadUrl, updateInfo.latest")
    expect(preload).toContain('ipcRenderer.invoke("update:download", url, latest)')
    expect(preload).toContain('ipcRenderer.invoke("update:install")')
  })

  it("设置窗口的已下载状态提供「立即重启」并提示退出时自动安装", () => {
    expect(settings).toContain('updateBtn.textContent = t("about.restartNow")')
    expect(settings).toContain('t("about.installOnQuit")')
    expect(settings).toContain('if (updateUiState === "downloaded")')
  })
})
