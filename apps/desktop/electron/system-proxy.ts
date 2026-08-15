/**
 * 解析本机 HTTP 代理，供 Vercel / GA4 直连失败后回退。
 * 不写死任何端口：地址来自设置覆盖、VPN「系统代理」或进程 env。
 *
 * 顺序：设置里的选填覆盖 → HTTPS_PROXY 等 env → Chromium
 * resolveProxy → OS 原生配置。只接受 HTTP/HTTPS；纯 SOCKS 无法交给 undici。
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const EXEC_OPTS = { timeout: 3_000, encoding: "utf8" as const }

export function parseChromiumProxy(result: string): string | undefined {
  const parts = result
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
  for (const part of parts) {
    if (/^DIRECT$/i.test(part)) continue
    const m = /^(PROXY|HTTP|HTTPS)\s+(\S+)/i.exec(part)
    if (!m) continue
    const host = m[2].replace(/^\[|\]$/g, "")
    if (!host) continue
    if (/^https?:\/\//i.test(host)) return host
    const scheme = m[1].toUpperCase() === "HTTPS" ? "https" : "http"
    return `${scheme}://${host}`
  }
  return undefined
}

/** 输入是否写了端口。Node URL 会丢掉 http:80 / https:443，不能只看 url.port。 */
function rawSpecifiesPort(text: string): boolean {
  const hostPart = text.replace(/^https?:\/\//i, "").split("/")[0] ?? ""
  const host = hostPart.startsWith("[")
    ? hostPart
    : hostPart.includes("@")
      ? hostPart.slice(hostPart.lastIndexOf("@") + 1)
      : hostPart
  return host.startsWith("[") ? /\]:\d+$/.test(host) : /:\d+$/.test(host)
}

/** 设置页选填：`http://host:port` 或 `host:port`。空=自动；SOCKS/缺端口无效。 */
export function parseManualHttpProxy(raw: string | undefined): string | undefined {
  const text = raw?.trim()
  if (!text || /^socks/i.test(text)) return undefined
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `http://${text}`)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    if (!url.hostname || !rawSpecifiesPort(text)) return undefined
    return url.href.replace(/\/$/, "")
  } catch {
    return undefined
  }
}

export function envHttpProxy(): string | undefined {
  const raw =
    process.env.HTTPS_PROXY?.trim() ||
    process.env.https_proxy?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.http_proxy?.trim()
  return raw || undefined
}

/** Windows Internet Settings：`http=host:port;https=host:port` 或 `host:port`。 */
export function parseWindowsProxyServer(raw: string): string | undefined {
  const text = raw.trim()
  if (!text) return undefined
  const pairs = new Map<string, string>()
  if (text.includes("=")) {
    for (const part of text.split(";")) {
      const eq = part.indexOf("=")
      if (eq < 0) continue
      const proto = part.slice(0, eq).trim().toLowerCase()
      const addr = part.slice(eq + 1).trim()
      if (proto && addr) pairs.set(proto, addr)
    }
    const picked = pairs.get("https") || pairs.get("http")
    return picked ? toHttpUrl(picked) : undefined
  }
  return toHttpUrl(text)
}

export function parseWindowsRegQuery(stdout: string): string | undefined {
  const enable = /ProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout)
  if (!enable || parseInt(enable[1], 16) === 0) return undefined
  const server = /ProxyServer\s+REG_SZ\s+(\S+)/i.exec(stdout)
  return server ? parseWindowsProxyServer(server[1]) : undefined
}

/** GNOME：mode + https/http host/port（gsettings 带引号 / uint32）。 */
export function parseGnomeManualProxy(input: {
  mode: string
  httpsHost: string
  httpsPort: string
  httpHost: string
  httpPort: string
}): string | undefined {
  const mode = stripGsettings(input.mode)
  if (mode !== "manual") return undefined
  const httpsHost = stripGsettings(input.httpsHost)
  const httpHost = stripGsettings(input.httpHost)
  const httpsPort = stripGsettings(input.httpsPort)
  const httpPort = stripGsettings(input.httpPort)
  if (httpsHost && httpsPort) return toHttpUrl(`${httpsHost}:${httpsPort}`)
  if (httpHost && httpPort) return toHttpUrl(`${httpHost}:${httpPort}`)
  return undefined
}

/** macOS `scutil --proxy` 文本。 */
export function parseScutilProxy(stdout: string): string | undefined {
  const httpsOn = /HTTPSEnable\s*:\s*1\b/.test(stdout)
  const httpOn = /HTTPEnable\s*:\s*1\b/.test(stdout)
  if (httpsOn) {
    const host = /HTTPSProxy\s*:\s*(\S+)/.exec(stdout)?.[1]
    const port = /HTTPSPort\s*:\s*(\d+)/.exec(stdout)?.[1]
    if (host && port) return toHttpUrl(`${host}:${port}`)
  }
  if (httpOn) {
    const host = /HTTPProxy\s*:\s*(\S+)/.exec(stdout)?.[1]
    const port = /HTTPPort\s*:\s*(\d+)/.exec(stdout)?.[1]
    if (host && port) return toHttpUrl(`${host}:${port}`)
  }
  return undefined
}

function stripGsettings(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "").replace(/^uint32\s+/i, "")
}

function toHttpUrl(hostPort: string): string | undefined {
  const value = hostPort.trim()
  if (!value || /^socks/i.test(value)) return undefined
  if (/^https?:\/\//i.test(value)) return value
  return `http://${value}`
}

async function execOut(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, EXEC_OPTS)
  return String(stdout)
}

export async function readOsHttpProxy(): Promise<string | undefined> {
  try {
    if (process.platform === "win32") return await readWindowsProxy()
    if (process.platform === "darwin") return await readMacProxy()
    if (process.platform === "linux") return await readLinuxProxy()
  } catch {
    return undefined
  }
  return undefined
}

async function readWindowsProxy(): Promise<string | undefined> {
  const stdout = await execOut("reg", [
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
  ])
  return parseWindowsRegQuery(stdout)
}

async function readMacProxy(): Promise<string | undefined> {
  return parseScutilProxy(await execOut("scutil", ["--proxy"]))
}

async function readLinuxProxy(): Promise<string | undefined> {
  try {
    const [mode, httpsHost, httpsPort, httpHost, httpPort] = await Promise.all([
      execOut("gsettings", ["get", "org.gnome.system.proxy", "mode"]),
      execOut("gsettings", ["get", "org.gnome.system.proxy.https", "host"]),
      execOut("gsettings", ["get", "org.gnome.system.proxy.https", "port"]),
      execOut("gsettings", ["get", "org.gnome.system.proxy.http", "host"]),
      execOut("gsettings", ["get", "org.gnome.system.proxy.http", "port"]),
    ])
    const parsed = parseGnomeManualProxy({
      mode,
      httpsHost,
      httpsPort,
      httpHost,
      httpPort,
    })
    if (parsed) return parsed
  } catch {
    /* 非 GNOME 或未安装 gsettings */
  }
  try {
    const type = (
      await execOut("kreadconfig5", [
        "--file",
        "kioslaverc",
        "--group",
        "Proxy Settings",
        "--key",
        "ProxyType",
      ])
    ).trim()
    // 1 = 手动；其它（0 无 / 2 PAC / 3 自动 / 4 应用配置）不读 host
    if (type === "1") {
      const https = (
        await execOut("kreadconfig5", [
          "--file",
          "kioslaverc",
          "--group",
          "Proxy Settings",
          "--key",
          "httpsProxy",
        ])
      ).trim()
      const http = (
        await execOut("kreadconfig5", [
          "--file",
          "kioslaverc",
          "--group",
          "Proxy Settings",
          "--key",
          "httpProxy",
        ])
      ).trim()
      const picked = https && https !== "None" ? https : http
      if (picked && picked !== "None") return toHttpUrl(picked)
    }
  } catch {
    /* 非 KDE */
  }
  return undefined
}

/** 设置覆盖 → env → Chromium 系统代理 → OS 原生配置。 */
export async function resolveDesktopHttpProxy(opts?: {
  override?: string
  resolveChromium?: () => Promise<string>
}): Promise<string | undefined> {
  const fromSettings = parseManualHttpProxy(opts?.override)
  if (fromSettings) return fromSettings
  const fromEnv = envHttpProxy()
  if (fromEnv) return fromEnv
  if (opts?.resolveChromium) {
    try {
      const parsed = parseChromiumProxy(await opts.resolveChromium())
      if (parsed) return parsed
    } catch {
      /* 继续读 OS */
    }
  }
  return readOsHttpProxy()
}
