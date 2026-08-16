import { requireDb } from "./db"

let lastSyncAt: string | null = null
let lastSyncError: string | null = null
let syncInFlight: Promise<void> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function isSyncConfigured(): boolean {
  return !!process.env.TURSO_SYNC_URL
}

/** 立即同步一次；并发调用共享同一个进行中的 promise。 */
export async function runSync(): Promise<void> {
  if (!isSyncConfigured()) return
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    try {
      await requireDb().sync()
      lastSyncAt = new Date().toISOString()
      lastSyncError = null
    } catch (err) {
      lastSyncError = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      syncInFlight = null
    }
  })()
  return syncInFlight
}

/** 写操作后的防抖同步触发器；未配置时为空操作（Vercel 上零影响）。 */
export function scheduleSync(): void {
  if (!isSyncConfigured()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void runSync().catch(() => {})
  }, 3000)
}

export function getSyncStatus() {
  return {
    configured: isSyncConfigured(),
    syncing: syncInFlight !== null,
    lastSyncAt,
    lastSyncError,
  }
}
