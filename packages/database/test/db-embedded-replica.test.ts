import { describe, it, expect, vi, beforeEach } from "vitest"

const { createClientCalls } = vi.hoisted(() => ({ createClientCalls: [] as unknown[] }))
vi.mock("@libsql/client", () => ({
  createClient: vi.fn((opts: unknown) => {
    createClientCalls.push(opts)
    return {}
  }),
}))

describe("getDb 的嵌入式副本配置", () => {
  beforeEach(() => {
    vi.resetModules()
    createClientCalls.length = 0
    delete process.env.TURSO_DATABASE_URL
    delete process.env.TURSO_AUTH_TOKEN
    delete process.env.TURSO_SYNC_URL
  })

  it("同步配置下以 offline 模式打开：云端不可用时读写仍走本地副本", async () => {
    process.env.TURSO_DATABASE_URL = "file:/tmp/zlog-db-test.db"
    process.env.TURSO_SYNC_URL = "libsql://example.turso.io"
    process.env.TURSO_AUTH_TOKEN = "test-token"

    const { getDb } = await import("../src/db")
    getDb()

    expect(createClientCalls).toHaveLength(1)
    expect(createClientCalls[0]).toMatchObject({
      url: "file:/tmp/zlog-db-test.db",
      syncUrl: "libsql://example.turso.io",
      offline: true,
      readYourWrites: false,
    })
  })

  it("未配置同步时不带副本选项", async () => {
    process.env.TURSO_DATABASE_URL = "file:/tmp/zlog-db-test.db"

    const { getDb } = await import("../src/db")
    getDb()

    const opts = createClientCalls[0] as Record<string, unknown>
    expect(opts.syncUrl).toBeUndefined()
    expect(opts.offline).toBeUndefined()
    expect(opts.readYourWrites).toBeUndefined()
  })
})
