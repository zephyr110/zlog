/**
 * 代理 URL 工具函数（与 undici 官方 ProxyAgent / Socks5ProxyAgent 配合）。
 *
 * 曾手写 HTTP CONNECT / SOCKS5 dispatcher，但 undici 对自定义 connect
 * 返回的 socket 直接用作传输层：裸 TCP = 明文请求（Google 403 "SSL is
 * required"），自行包 TLS = undici 二次握手断开。官方 Agent 的 httpSocket
 * 机制正确完成隧道 + TLS——GA4 全链路实测通过（Node 22.17 内置 undici
 * 6.21.2 与本地 7.29）。代理 Agent 的构建与超时见 ga-analytics.ts。
 */

const SOCKS_PROTOCOLS = new Set(["socks:", "socks4:", "socks4a:", "socks5:", "socks5h:"])

export function isSocksProxyUrl(url: string): boolean {
  try {
    return SOCKS_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export function isSocks5ProxyUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    // socks5h 归入（远端 DNS 语义差异由调用方处理）
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
    // 保留 userinfo：带认证的 HTTP 代理的 socks 回退同样需要认证
    const creds = u.username
      ? `${u.username}${u.password ? `:${u.password}` : ""}@`
      : ""
    return `socks5://${creds}${u.hostname}:${u.port}`
  } catch {
    return undefined
  }
}
