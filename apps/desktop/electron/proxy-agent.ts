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
export function createProxyDispatcher(
  proxyUrl: string
): ProxyAgent | Socks5ProxyAgent | undefined {
  if (!proxyUrl.trim()) return undefined
  if (/^socks4/i.test(proxyUrl)) {
    console.warn("[proxy] socks4 proxy not supported, running direct:", proxyUrl)
    return undefined
  }
  if (/^socks/i.test(proxyUrl)) {
    return new Socks5ProxyAgent(proxyUrl.replace(/^socks5h:/i, "socks5:"))
  }
  return new ProxyAgent(proxyUrl)
}
