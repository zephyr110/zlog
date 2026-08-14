import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Shared call log so the debounce test can assert "no sync before the 3s
// window" without depending on module-level state carried over from earlier
// tests in this file (lastSyncAt persists in sync.ts across tests).
const { mockSyncLog } = vi.hoisted(() => ({ mockSyncLog: [] as string[] }))

vi.mock("../src/db", () => ({
  requireDb: vi.fn(() => ({
    sync: vi.fn().mockImplementation(() => {
      mockSyncLog.push("sync")
      return Promise.resolve({ frame_no: 1, frames_synced: 2 })
    }),
  })),
}))

import { runSync, scheduleSync, getSyncStatus, isSyncConfigured } from "../src/sync"
import { requireDb } from "../src/db"

describe("sync", () => {
  beforeEach(() => {
    delete process.env.TURSO_SYNC_URL
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it("isSyncConfigured 受环境变量控制", () => {
    expect(isSyncConfigured()).toBe(false)
    process.env.TURSO_SYNC_URL = "libsql://example.turso.io"
    expect(isSyncConfigured()).toBe(true)
  })

  it("未配置时 runSync 是空操作且不报错", async () => {
    await expect(runSync()).resolves.toBeUndefined()
    expect(getSyncStatus().configured).toBe(false)
  })

  it("配置后 runSync 记录 lastSyncAt 且并发互斥", async () => {
    process.env.TURSO_SYNC_URL = "libsql://example.turso.io"
    const syncsBefore = mockSyncLog.length
    await Promise.all([runSync(), runSync()])
    // 并发互斥：两次并发调用只触发一次 client.sync()。
    expect(mockSyncLog.length).toBe(syncsBefore + 1)
    const status = getSyncStatus()
    expect(status.configured).toBe(true)
    expect(status.lastSyncAt).toBeTruthy()
    expect(status.lastSyncError).toBeNull()
  })

  it("runSync 失败记录 lastSyncError", async () => {
    process.env.TURSO_SYNC_URL = "libsql://example.turso.io"
    // Fixed vs. brief: `vi.mocked(require("./../src/db"))` is unreliable in
    // ESM. Import the mocked export instead, and use mockReturnValueOnce so
    // the failing client does not leak into the scheduleSync test below.
    vi.mocked(requireDb).mockReturnValueOnce({
      sync: vi.fn().mockRejectedValue(new Error("boom")),
    })
    await expect(runSync()).rejects.toThrow("boom")
    expect(getSyncStatus().lastSyncError).toBe("boom")
  })

  it("scheduleSync 3 秒防抖后触发一次同步", async () => {
    process.env.TURSO_SYNC_URL = "libsql://example.turso.io"
    const syncsBefore = mockSyncLog.length
    scheduleSync()
    scheduleSync()
    // 防抖窗口（<3 秒）内不触发同步。
    await vi.advanceTimersByTimeAsync(2900)
    expect(mockSyncLog.length).toBe(syncsBefore)
    // 3 秒后合并两次调度，只触发一次同步。
    await vi.advanceTimersByTimeAsync(200)
    expect(mockSyncLog.length).toBe(syncsBefore + 1)
    expect(getSyncStatus().lastSyncAt).toBeTruthy()
  })
})
