const { execFileSync } = require("node:child_process")
const path = require("node:path")

/**
 * electron-builder afterPack 钩子（dmg/zip 生成前执行）。
 *
 * 无 Apple Developer 证书时 electron-builder 会完全跳过签名，产物
 * "code object is not signed at all"——从 GitHub Release 下载的 dmg
 * 带 quarantine 属性，未签名 app 被 Gatekeeper 拦截，且覆盖安装旧版本
 * 后 LaunchServices 缓存异常（"应用程序已不能再打开"）。
 *
 * 这里对 .app 做 ad-hoc 签名（-s -），消除"未签名"状态：
 * - 替换安装不再触发 LaunchServices 异常，Apple Silicon 上也能运行
 * - Gatekeeper 对 quarantine app 的拦截仍需首次「右键 → 打开」放行
 *   （见 README 首次安装说明）；完全无提示需要 Developer ID + 公证
 *
 * 已签名的 .app 跳过（真实证书签名由 electron-builder 或钥匙串自动
 * 检出完成），只对完全未签名的产物做 ad-hoc。
 */
exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context
  if (electronPlatformName !== "darwin") return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)
  // 已签名（真实证书——electron-builder 的正式签名在 afterPack 之后执行，
  // 但也可能来自机器钥匙串自动检出）→ 跳过 ad-hoc，避免覆盖正式签名
  try {
    execFileSync("codesign", ["-dv", appPath], { stdio: "ignore" })
    console.log(`[after-pack] already signed, skipping ad-hoc: ${appPath}`)
    return
  } catch {
    /* 未签名 → 继续 ad-hoc */
  }
  console.log(`[after-pack] ad-hoc signing ${appPath}`)
  execFileSync("codesign", ["--force", "--deep", "-s", "-", appPath], {
    stdio: "inherit",
  })
}
