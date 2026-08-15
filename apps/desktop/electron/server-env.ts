import type { DesktopConfig } from "./config-store"
import { isSocksProxyUrl } from "./system-proxy"

const LOCAL_NO_PROXY = ["127.0.0.1", "localhost", "::1"]

/** 在已有 NO_PROXY 上并入本机项，避免覆盖用户更长的旁路名单。 */
export function mergeNoProxy(existing: string | undefined): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of [...(existing ?? "").split(","), ...LOCAL_NO_PROXY]) {
    const host = part.trim()
    if (!host || seen.has(host)) continue
    seen.add(host)
    out.push(host)
  }
  return out.join(",")
}

/** 由桌面配置组装服务器 env（纯函数，便于测试）。 */
export function buildServerEnv(
  cfg: DesktopConfig,
  dbPath: string,
  langFilePath?: string,
  /** 系统/VPN HTTP 或 SOCKS5 代理（Electron resolveProxy 或进程 env）。有值才注入。 */
  httpsProxy?: string
): Record<string, string> {
  const env: Record<string, string> = {
    TURSO_DATABASE_URL: `file:${dbPath}`,
    SESSION_SECRET: cfg.sessionSecret,
    ADMIN_USERNAME: cfg.adminUsername,
    // 服务器端 @zlog/database 约定 ADMIN_PASSWORD_HASH 为 base64 编码的
    // bcrypt 哈希（users.ts decodeEnvHash，见 web/.env.local.example）。
    // 桌面配置存储里是原始哈希，转交 env 时编码。
    ADMIN_PASSWORD_HASH: Buffer.from(cfg.adminPasswordHash, "utf8").toString("base64"),
    ZLOG_DESKTOP_KEY: cfg.desktopKey,
  }
  // 语言单一事实源（lang.json）路径：web 端 /api/lang 读它接入统一语言源
  if (langFilePath) env.DESKTOP_LANG_FILE = langFilePath
  if (cfg.syncUrl) env.TURSO_SYNC_URL = cfg.syncUrl
  if (cfg.syncToken) env.TURSO_AUTH_TOKEN = cfg.syncToken
  // 流量分析（线上站点只读报表）：有值才传，未配置则仪表盘显示空状态
  if (cfg.vercelApiToken) env.VERCEL_API_TOKEN = cfg.vercelApiToken
  if (cfg.vercelProjectId) env.VERCEL_ANALYTICS_PROJECT_ID = cfg.vercelProjectId
  if (cfg.vercelTeamId) env.VERCEL_ANALYTICS_TEAM_ID = cfg.vercelTeamId
  if (cfg.gaPropertyId) env.GA_PROPERTY_ID = cfg.gaPropertyId
  if (cfg.gaClientEmail) env.GA_CLIENT_EMAIL = cfg.gaClientEmail
  if (cfg.gaPrivateKey) env.GA_PRIVATE_KEY = cfg.gaPrivateKey
  const proxy = httpsProxy?.trim()
  if (proxy) {
    if (isSocksProxyUrl(proxy)) {
      env.ALL_PROXY = proxy
      env.all_proxy = proxy
    } else {
      env.HTTPS_PROXY = proxy
      env.HTTP_PROXY = proxy
    }
    // Node 18+ undici 会把 127.0.0.1 也丢进代理；本机 Next / libsql
    // 走 VPN 代理会失败。分析请求仍走 HTTPS_PROXY / ALL_PROXY。
    const noProxy = mergeNoProxy(process.env.NO_PROXY || process.env.no_proxy)
    env.NO_PROXY = noProxy
    env.no_proxy = noProxy
  }
  return env
}
