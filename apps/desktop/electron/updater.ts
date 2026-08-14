import { createWriteStream } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { app, net, shell } from "electron"

/**
 * 轻量更新检查：GitHub Releases "latest" API + 平台资产匹配。
 *
 * 为什么不用 electron-updater：产物经 `--publish never` + softprops 上传，
 * 没有 electron-builder 的 latest-mac.yml 等更新元数据；且 macOS 产物未
 * 签名（Squirrel.Mac 自动替换要求签名）。这里做"检查 + 下载 + 引导安装"
 * 的完整子集：发现新版本 → 下载对应平台安装包 → 打开（macOS 打开 dmg /
 * Windows 静默安装 / Linux 打开文件）。
 *
 * 网络走 electron 的 net.fetch（Chromium 栈，自动跟随系统代理——直连
 * GitHub API 在国内网络会被拦，Node fetch 不读系统代理）。
 */

export interface UpdateCheckResult {
  ok: boolean
  hasUpdate: boolean
  current: string
  latest?: string
  downloadUrl?: string
  error?: string
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

/** 语义化版本比较（支持 prerelease：1.1.0-beta.1 < 1.1.0）。 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): { major: number; minor: number; patch: number; pre: string[] } | null => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim())
    if (!m) return null
    return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split(".") : [] }
  }
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0
  for (const k of ["major", "minor", "patch"] as const) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1
  }
  // 无 prerelease 的版本大于有 prerelease 的（1.0.0 > 1.0.0-beta.1）
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1
  // prerelease 逐段比较：数字段数值序，其余字典序；前缀长者为大
  const n = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < n; i++) {
    const xa = pa.pre[i]
    const xb = pb.pre[i]
    if (xa === undefined) return -1
    if (xb === undefined) return 1
    if (xa === xb) continue
    const na = /^\d+$/.test(xa)
    const nb = /^\d+$/.test(xb)
    if (na && nb) return +xa < +xb ? -1 : 1
    if (na !== nb) return na ? -1 : 1
    return xa < xb ? -1 : 1
  }
  return 0
}

/** 按平台+架构匹配 release 资产名（与 electron-builder artifactName 对应：
 *  Zlog-<version>-<arch>.<ext>，Windows 为 Zlog-Setup-<version>.exe）。 */
export function pickAssetUrl(
  assets: ReleaseAsset[],
  platform: NodeJS.Platform,
  arch: string
): string | null {
  if (platform === "win32") {
    const match = assets.find((a) => a.name.includes("Setup") && a.name.endsWith(".exe"))
    return match?.browser_download_url ?? null
  }
  // Linux 端 electron-builder 的 ${arch} 宏历史上产出过 x86_64 与 x64 两种
  // 形态（v1.0.0 实测 x86_64）；arm64 亦可能为 aarch64——宽松匹配两种
  if (platform === "linux") {
    const suffixes = arch === "arm64" ? ["-arm64.AppImage", "-aarch64.AppImage"] : ["-x86_64.AppImage", "-x64.AppImage"]
    const match = assets.find((a) => suffixes.some((s) => a.name.endsWith(s)))
    return match?.browser_download_url ?? null
  }
  const suffix =
    platform === "darwin"
      ? arch === "arm64" ? "-arm64.dmg" : "-x64.dmg"
      : null
  const match = suffix ? assets.find((a) => a.name.endsWith(suffix)) : undefined
  return match?.browser_download_url ?? null
}

/** 拉取 GitHub latest release（不含 prerelease/draft）。 */
export async function fetchLatestRelease(): Promise<{
  tag: string
  htmlUrl: string
  assets: ReleaseAsset[]
} | null> {
  const res = await net.fetch("https://api.github.com/repos/zephyr110/zlog/releases/latest", {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Zlog-Desktop",
    },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    tag_name?: string
    html_url?: string
    assets?: ReleaseAsset[]
  }
  if (!data.tag_name || !Array.isArray(data.assets)) return null
  return { tag: data.tag_name, htmlUrl: data.html_url ?? "", assets: data.assets }
}

/** 同路径进行中下载（防重：重开设置窗口后重复下载同一安装包会双流写坏文件）。 */
const activeDownloads = new Set<string>()

/**
 * 流式下载 release 资产到 dest，按字节推进度（0-100）。
 * 仅接受 GitHub 域（github.com / objects.githubusercontent.com），
 * 渲染层传入的 url 不做其他信任假设。
 */
export async function downloadUpdate(
  url: string,
  dest: string,
  onProgress: (percent: number) => void
): Promise<void> {
  if (activeDownloads.has(dest)) {
    throw new Error("download already in progress")
  }
  activeDownloads.add(dest)
  try {
    const u = new URL(url)
    // 前导点必须保留：endsWith("githubusercontent.com") 会让
    // evilgithubusercontent.com 这类可注册域名通过校验
    if (!(u.hostname === "github.com" || u.hostname.endsWith(".github.com") || u.hostname.endsWith(".githubusercontent.com"))) {
      throw new Error(`refusing to download from ${u.hostname}`)
    }
    const res = await net.fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get("content-length") ?? 0)
    let received = 0
    const ws = createWriteStream(dest)
    // error 监听必须在写入循环开始前挂上：流错误（ENOSPC/EISDIR 等）是
    // 异步事件，循环期间无监听会让 Node 抛 uncaughtException 拖垮主进程
    const writeError = new Promise<never>((_, reject) => ws.on("error", reject))
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      ws.write(Buffer.from(value))
      if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)))
    }
    try {
      await Promise.race([
        new Promise<void>((resolve) => ws.end(() => resolve())),
        writeError,
      ])
    } catch (err) {
      ws.destroy()
      throw err
    }
    onProgress(100)
  } finally {
    // 任何失败路径（fetch/HTTP/流/超时）都必须释放占用，否则同名安装包
    // 在本次会话内永远无法重新下载
    activeDownloads.delete(dest)
  }
}

/** 检查请求超时（GitHub API 挂起时按钮不能永久卡"检查中"）。 */
export const CHECK_TIMEOUT_MS = 10_000
/** 下载超时（133MB dmg 在慢网/代理下较久；网络挂死时兜底返回失败）。 */
export const DOWNLOAD_TIMEOUT_MS = 15 * 60_000

/** 下载完成后按平台打开安装包。 */
export function openDownloadedUpdate(dest: string): void {
  if (process.platform === "win32") {
    // NSIS 静默安装（/S）；未签名会被 SmartScreen 拦，属预期。
    // spawn 失败（安装包被删/被杀软隔离）没有 error 监听会以
    // uncaughtException 拖垮主进程——监听后回退打开所在目录
    const child = spawn(dest, ["/S"], { detached: true, stdio: "ignore" })
    child.on("error", () => {
      void shell.openPath(join(dest, ".."))
    })
    child.unref()
  } else if (process.platform === "darwin") {
    // dmg：Finder 打开，用户拖入 Applications（未签名无法自动替换）
    void shell.openPath(dest)
  } else {
    void shell.openPath(join(dest, "..")) // Linux：打开文件所在目录
  }
}

/** userData/updates 目录（下载落点）。 */
export function updatesDir(): string {
  return join(app.getPath("userData"), "updates")
}
