import { describe, it, expect } from "vitest"
import { buildServerEnv } from "../electron/server-env"
import type { DesktopConfig } from "../electron/config-store"

const base: DesktopConfig = {
  adminUsername: "admin",
  adminPasswordHash: "$2b$10$x",
  sessionSecret: "s",
  desktopKey: "k",
}

describe("buildServerEnv", () => {
  it("始终包含本地库路径与凭据 env", () => {
    const env = buildServerEnv(base, "/data/zlog.db")
    expect(env.TURSO_DATABASE_URL).toBe("file:/data/zlog.db")
    expect(env.ADMIN_USERNAME).toBe("admin")
    expect(env.ZLOG_DESKTOP_KEY).toBe("k")
    expect(env.TURSO_SYNC_URL).toBeUndefined()
  })

  it("配置了同步信息时透传 syncUrl/token", () => {
    const env = buildServerEnv(
      { ...base, syncUrl: "libsql://x.turso.io", syncToken: "tok" },
      "/data/zlog.db"
    )
    expect(env.TURSO_SYNC_URL).toBe("libsql://x.turso.io")
    expect(env.TURSO_AUTH_TOKEN).toBe("tok")
  })
})
