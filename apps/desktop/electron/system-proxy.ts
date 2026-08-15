/**
 * 解析本机代理，供 Vercel / GA4 直连失败后回退。
 * 不写死任何端口：地址来自设置覆盖、VPN「系统代理」或进程 env。
 *
 * 顺序：设置里的选填覆盖 → Chromium resolveProxy → OS 原生配置 →
 * 进程 env。env 放最后：从 IDE 启动时经常带着已失效的 HTTPS_PROXY。
 * HTTP 与 SOCKS5 都接受。
 */

import { execFile } from "node:child_process"
import net from "node:net"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const EXEC_OPTS = { timeout: 3_000, encoding: "utf8" as const }

export function parseChromiumProxy(result: string): string | undefined {
  const parts = result
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
  let socks: string | undefined
  for (const part of parts) {
    if (/^DIRECT$/i.test(part)) continue
    const http = /^(PROXY|HTTP|HTTPS)\s+(\S+)/i.exec(part)
    if (http) {
      const host = http[2].replace(/^\[|\]$/g, "")
      if (!host) continue
      if (/^https?:\/\//i.test(host)) return host
      const scheme = http[1].toUpperCase() === "HTTPS" ? "https" : "http"
      return `${scheme}://${host}`
    }
    const sock = /^(SOCKS5h?|SOCKS4a?|SOCKS)\s+(\S+)/i.exec(part)
    if (sock && !socks) {
      const host = sock[2].replace(/^\[|\]$/g, "")
      if (host) socks = toSocksUrl(host)
    }
  }
  return socks
}

/** 输入是否写了端口。Node URL 会丢掉 http:80 / https:443，不能只看 url.port。 */
function rawSpecifiesPort(text: string): boolean {
  const hostPart = text.replace(/^(https?|socks5h?|socks4a?|socks):\/\//i, "").split("/")[0] ?? ""
  const host = hostPart.startsWith("[")
    ? hostPart
    : hostPart.includes("@")
      ? hostPart.slice(hostPart.lastIndexOf("@") + 1)
      : hostPart
  return host.startsWith("[") ? /\]:\d+$/.test(host) : /:\d+$/.test(host)
}

export function isSocksProxyUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === "socks:" || p === "socks4:" || p === "socks5:" || p === "socks5h:"
  } catch {
    return false
  }
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
}

function proxyPort(url: URL): string {
  if (url.port) return url.port
  if (url.protocol === "https:") return "443"
  if (url.protocol === "http:") return "80"
  return ""
}

function sameProxyAuthority(a: string, b: string): boolean {
  try {
    const left = new URL(a)
    const right = new URL(b)
    const sameHost =
      left.hostname === right.hostname ||
      (isLoopbackHost(left.hostname) && isLoopbackHost(right.hostname))
    return sameHost && proxyPort(left) === proxyPort(right)
  } catch {
    return false
  }
}

/** 仅当系统只有 SOCKS、没有同端口 HTTP 时，才把手动 http:// 改成 socks5。
 *  网页代理与 SOCKS 同端口（mixed）时保持 HTTP CONNECT。 */
export function alignHttpUrlWithSocks(
  url: string | undefined,
  socksUrl: string | undefined,
  httpUrl?: string
): string | undefined {
  if (!url) return socksUrl
  if (!socksUrl || isSocksProxyUrl(url)) return url
  if (httpUrl && sameProxyAuthority(url, httpUrl)) return url
  if (sameProxyAuthority(url, socksUrl)) return socksUrl
  return url
}

/** 设置页选填：`http://host:port`、`socks5://host:port` 或 `host:port`。 */
export function parseManualHttpProxy(raw: string | undefined): string | undefined {
  const text = raw?.trim()
  if (!text) return undefined
  try {
    const prefixed = /^(https?|socks5h?|socks4a?|socks):\/\//i.test(text) ? text : `http://${text}`
    const url = new URL(prefixed)
    if (!url.hostname || !rawSpecifiesPort(text)) return undefined
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href.replace(/\/$/, "")
    }
    if (isSocksProxyUrl(url.href)) {
      return toSocksUrl(url.href)
    }
    return undefined
  } catch {
    return undefined
  }
}

export function acceptInheritedEnvProxy(
  url: string | undefined,
  loopbackReachable: boolean
): string | undefined {
  if (!url) return undefined
  try {
    const host = new URL(url).hostname
    if (!isLoopbackHost(host)) return url
    return loopbackReachable ? url : undefined
  } catch {
    return undefined
  }
}

function tcpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const socket = net.connect({ host, port })
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once("connect", () => done(true))
    socket.once("error", () => done(false))
  })
}

export async function isReachableProxyEndpoint(
  url: string,
  timeoutMs = 600
): Promise<boolean> {
  try {
    const parsed = new URL(url)
    const port = Number(proxyPort(parsed))
    if (!parsed.hostname || port <= 0) return false
    if (!isLoopbackHost(parsed.hostname)) return true
    return tcpReachable(parsed.hostname, port, timeoutMs)
  } catch {
    return false
  }
}

export function envHttpProxy(): string | undefined {
  const raw =
    process.env.HTTPS_PROXY?.trim() ||
    process.env.https_proxy?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.http_proxy?.trim() ||
    process.env.ALL_PROXY?.trim() ||
    process.env.all_proxy?.trim()
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
    if (picked) return toHttpUrl(picked)
    const socks = pairs.get("socks") || pairs.get("socks5")
    return socks ? toSocksUrl(socks) : undefined
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

export function parseScutilSocks(stdout: string): string | undefined {
  if (!/SOCKSEnable\s*:\s*1\b/.test(stdout)) return undefined
  const host = /SOCKSProxy\s*:\s*(\S+)/.exec(stdout)?.[1]
  const port = /SOCKSPort\s*:\s*(\d+)/.exec(stdout)?.[1]
  return host && port ? toSocksUrl(`${host}:${port}`) : undefined
}

export function parseScutilHttp(stdout: string): string | undefined {
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

/** macOS `scutil --proxy` 文本。HTTP 优先，否则 SOCKS。 */
export function parseScutilProxy(stdout: string): string | undefined {
  return parseScutilHttp(stdout) || parseScutilSocks(stdout)
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

function toSocksUrl(hostPort: string): string | undefined {
  const value = hostPort.trim()
  if (!value) return undefined
  if (/^socks5h?:\/\//i.test(value) || /^socks:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (!url.hostname || !url.port) return undefined
      return `socks5://${url.hostname}:${url.port}`
    } catch {
      return undefined
    }
  }
  if (/^socks4/i.test(value)) return undefined
  if (/^https?:\/\//i.test(value)) return undefined
  return `socks5://${value}`
}

async function execOut(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, EXEC_OPTS)
  return String(stdout)
}

export async function readOsHttpProxy(): Promise<string | undefined> {
  return (await readOsProxies()).preferred
}

async function readOsProxies(): Promise<{
  preferred?: string
  http?: string
  socks?: string
}> {
  try {
    if (process.platform === "darwin") {
      const stdout = await execOut("scutil", ["--proxy"])
      const http = parseScutilHttp(stdout)
      const socks = parseScutilSocks(stdout)
      return { preferred: http || socks, http, socks }
    }
    if (process.platform === "win32") {
      const preferred = await readWindowsProxy()
      const socks = preferred && isSocksProxyUrl(preferred) ? preferred : undefined
      const http = preferred && !socks ? preferred : undefined
      return { preferred, http, socks }
    }
    if (process.platform === "linux") {
      const preferred = await readLinuxProxy()
      const socks = preferred && isSocksProxyUrl(preferred) ? preferred : undefined
      const http = preferred && !socks ? preferred : undefined
      return { preferred, http, socks }
    }
  } catch {
    return {}
  }
  return {}
}

async function readWindowsProxy(): Promise<string | undefined> {
  const stdout = await execOut("reg", [
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
  ])
  return parseWindowsRegQuery(stdout)
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

/** 设置覆盖 → Chromium → OS → 进程 env。仅纯 SOCKS 时才把 http:// 改写成 socks5。 */
export async function resolveDesktopHttpProxy(opts?: {
  override?: string
  resolveChromium?: () => Promise<string>
}): Promise<string | undefined> {
  const os = await readOsProxies()
  const fromSettings = parseManualHttpProxy(opts?.override)
  if (fromSettings) return alignHttpUrlWithSocks(fromSettings, os.socks, os.http)
  let fromChromium: string | undefined
  if (opts?.resolveChromium) {
    try {
      fromChromium = parseChromiumProxy(await opts.resolveChromium())
    } catch {
      /* 继续读 OS */
    }
  }
  if (fromChromium || os.preferred) {
    return alignHttpUrlWithSocks(fromChromium || os.preferred, os.socks, os.http)
  }
  const fromEnv = envHttpProxy()
  if (!fromEnv) return undefined
  const usable = acceptInheritedEnvProxy(
    fromEnv,
    await isReachableProxyEndpoint(fromEnv)
  )
  return alignHttpUrlWithSocks(usable, os.socks, os.http)
}
