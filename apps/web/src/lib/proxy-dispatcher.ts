/**
 * 代理 URL 工具函数（与 undici 官方 ProxyAgent / Socks5ProxyAgent 配合）。
 *
 * 曾手写 HTTP CONNECT / SOCKS5 dispatcher（见 git 历史），但 undici 对
 * 自定义 connect 返回的 socket 直接用作传输层：返回裸 TCP 会以明文请求
 * 到达 Google（403 "SSL is required"），自行包 TLS 会被 undici 二次握手
 * 断开。官方 Agent 的 httpSocket 机制能正确完成隧道 + TLS——GA4 全链路
 * 实测通过（Node 22.17 内置 undici 6.21.2 与本地 7.29）。
 */

export function isSocksProxyUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === "socks:" || p === "socks4:" || p === "socks5:" || p === "socks5h:"
  } catch {
    return false
  }
}

export function isSocks5ProxyUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === "socks:" || p === "socks5:" || p === "socks5h:"
  } catch {
    return false
  }
}

export function proxyListenPort(url: URL): number {
  if (url.port) return Number(url.port)
  if (url.protocol === "https:") return 443
  if (url.protocol === "http:") return 80
  if (isSocks5ProxyUrl(url.href)) return 1080
  return 0
}

export function isCachedProxyEquivalent(cached: string, resolved: string): boolean {
  return cached === resolved || cached === socksUrlForHttpProxy(resolved)
}

export function socksUrlForHttpProxy(httpUrl: string): string | undefined {
  try {
    const u = new URL(httpUrl)
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined
    if (!u.hostname || !u.port) return undefined
    return `socks5://${u.hostname}:${u.port}`
  } catch {
    return undefined
  }
}
