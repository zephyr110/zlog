import { createClient, type Client } from "@libsql/client"

let client: Client | null = null

export function getDb(): Client | null {
  if (client) return client
  const url = process.env.TURSO_DATABASE_URL
  if (!url) return null
  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    // Desktop (embedded replica): TURSO_SYNC_URL 存在时启用双向同步。
    // offline 让读写都走本地副本，远端故障（断网/配额封禁）时照常可用，
    // 由 sync() 稍后推送/拉取；关闭 readYourWrites，否则每次读都会先向
    // 云端拉帧，云端拒绝读取时每个查询都抛 Sync(...)、整站 500。
    // Web/Vercel 部署不设该变量 → 完全不受影响。
    ...(process.env.TURSO_SYNC_URL
      ? {
          syncUrl: process.env.TURSO_SYNC_URL,
          syncInterval: Number(process.env.TURSO_SYNC_INTERVAL ?? 300),
          offline: true,
          readYourWrites: false,
        }
      : {}),
  })
  return client
}

/**
 * Shared "database must exist" gate for all modules. Throws with the same
 * env-var hint so a missing TURSO_DATABASE_URL surfaces identically
 * everywhere.
 */
export function requireDb(): Client {
  const db = getDb()
  if (!db) {
    throw new Error(
      "TURSO_DATABASE_URL environment variable is required. " +
        "Set it to a libsql:// or file: URL (and TURSO_AUTH_TOKEN for remote databases)."
    )
  }
  return db
}

/**
 * Module-level init-once guard with retry-on-failure, shared by every
 * table module (users, lockout, ...). Returns an async function that
 * runs `init` once and caches the promise; a failed init resets so the
 * next call retries.
 */
export function createTableGuard(init: () => Promise<void>): () => Promise<void> {
  let ready: Promise<void> | null = null
  return () => {
    if (!ready) {
      ready = init().catch((err) => {
        ready = null // reset on failure so next call retries
        throw err
      })
    }
    return ready
  }
}
