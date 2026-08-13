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
    ADMIN_PASSWORD_HASH: cfg.adminPasswordHash,
    ZLOG_DESKTOP_KEY: cfg.desktopKey,
  }
  if (cfg.syncUrl) env.TURSO_SYNC_URL = cfg.syncUrl
  if (cfg.syncToken) env.TURSO_AUTH_TOKEN = cfg.syncToken
  return env
}
