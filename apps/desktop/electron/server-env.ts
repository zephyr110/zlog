import type { DesktopConfig } from "./config-store"

/** 由桌面配置组装服务器 env（纯函数，便于测试）。 */
export function buildServerEnv(
  cfg: DesktopConfig,
  dbPath: string,
  langFilePath?: string
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
  return env
}
