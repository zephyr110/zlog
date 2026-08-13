import type { DesktopConfig } from "./config-store"

/** 由桌面配置组装服务器 env（纯函数，便于测试）。 */
export function buildServerEnv(
  cfg: DesktopConfig,
  dbPath: string
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
  if (cfg.syncUrl) env.TURSO_SYNC_URL = cfg.syncUrl
  if (cfg.syncToken) env.TURSO_AUTH_TOKEN = cfg.syncToken
  return env
}
