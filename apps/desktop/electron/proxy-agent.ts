import { ProxyAgent, Socks5ProxyAgent } from "undici"

/**
 * 按代理 URL 构建 undici dispatcher（http:// → ProxyAgent，socks5 →
 * Socks5ProxyAgent）。与 web 端 analytics-proxy 的策略一致：
 * - socks5h（远端 DNS）降级为 socks5（本地解析，语义差异可接受）
 * - socks4/socks4a 不支持（ProxyAgent 会拒绝 socks 协议抛错）
 *
 * 桌面端网络请求（Vercel 部署等）统一从这里取 dispatcher，避免各模块
 * 各自 new Agent 造成协议分支漂移。
 */

/** 脱敏代理 URL：去掉 userinfo（user:pass@）。代理可能带凭据，写入日志
 *  或控制台前必须经过这里，避免密码落盘。 */
export function redactProxyUrl(url: string): string {
  if (!url.includes("@")) return url
  try {
    const u = new URL(url)
    if (u.username || u.password) {
      u.username = ""
      u.password = ""
      return u.toString()
    }
    return url
  } catch {
    // 非标准 URL（如 socks5://user:pass@host 之外的形态）：兜底替换 userinfo
    return url.replace(/\/\/[^@/\s]+@/, "//***@")
  }
}

export function createProxyDispatcher(
  proxyUrl: string
): ProxyAgent | Socks5ProxyAgent | undefined {
  if (!proxyUrl.trim()) return undefined
  if (/^socks4/i.test(proxyUrl)) {
    console.warn(
      "[proxy] socks4 proxy not supported, running direct:",
      redactProxyUrl(proxyUrl)
    )
    return undefined
  }
  if (/^socks/i.test(proxyUrl)) {
    // socks5/socks5h 之外还有裸 socks:// 写法（部分工具链产出）：归一化
    // 为 socks5 再交给 Socks5ProxyAgent，否则它会同步抛错
    const normalized = proxyUrl
      .replace(/^socks5h:/i, "socks5:")
      .replace(/^socks:/i, "socks5:")
    return new Socks5ProxyAgent(normalized)
  }
  return new ProxyAgent(proxyUrl)
}
