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
    // 服务器端 @zlog/database 按 base64 解码 ADMIN_PASSWORD_HASH：
    // 配置里的原始 bcrypt 哈希须编码后再传入 env
    expect(env.ADMIN_PASSWORD_HASH).toBe(
      Buffer.from("$2b$10$x", "utf8").toString("base64")
    )
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

describe("buildServerEnv analytics", () => {
  it("配置了流量分析时透传 Vercel/GA4 env", () => {
    const env = buildServerEnv(
      {
        ...base,
        vercelApiToken: "tok",
        vercelProjectId: "prj_123",
        vercelTeamId: "team_9",
        gaPropertyId: "123456",
        gaClientEmail: "svc@x.iam.gserviceaccount.com",
        gaPrivateKey: "-----BEGIN PRIVATE KEY-----abc",
      },
      "/data/zlog.db"
    )
    expect(env.VERCEL_API_TOKEN).toBe("tok")
    expect(env.VERCEL_ANALYTICS_PROJECT_ID).toBe("prj_123")
    expect(env.VERCEL_ANALYTICS_TEAM_ID).toBe("team_9")
    expect(env.GA_PROPERTY_ID).toBe("123456")
    expect(env.GA_CLIENT_EMAIL).toBe("svc@x.iam.gserviceaccount.com")
    expect(env.GA_PRIVATE_KEY).toBe("-----BEGIN PRIVATE KEY-----abc")
  })

  it("未配置流量分析时不注入相关 env", () => {
    const env = buildServerEnv(base, "/data/zlog.db")
    expect(env.VERCEL_API_TOKEN).toBeUndefined()
    expect(env.GA_PROPERTY_ID).toBeUndefined()
  })

  it("传入 lang 文件路径时注入 DESKTOP_LANG_FILE（web /api/lang 依赖）", () => {
    expect(buildServerEnv(base, "/data/zlog.db").DESKTOP_LANG_FILE).toBeUndefined()
    const env = buildServerEnv(base, "/data/zlog.db", "/data/userData/lang.json")
    expect(env.DESKTOP_LANG_FILE).toBe("/data/userData/lang.json")
  })

  it("透传进程 HTTPS_PROXY 给服务器", () => {
    const prevHttps = process.env.HTTPS_PROXY
    const prevHttp = process.env.HTTP_PROXY
    process.env.HTTPS_PROXY = "http://127.0.0.1:65534"
    delete process.env.HTTP_PROXY
    try {
      const env = buildServerEnv(base, "/data/zlog.db")
      expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:65534")
      expect(env.HTTP_PROXY).toBe("http://127.0.0.1:65534")
    } finally {
      if (prevHttps === undefined) delete process.env.HTTPS_PROXY
      else process.env.HTTPS_PROXY = prevHttps
      if (prevHttp === undefined) delete process.env.HTTP_PROXY
      else process.env.HTTP_PROXY = prevHttp
    }
  })

  it("未设置进程代理时不注入 HTTPS_PROXY", () => {
    const keys = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const
    const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {}
    for (const k of keys) {
      prev[k] = process.env[k]
      delete process.env[k]
    }
    try {
      const env = buildServerEnv(base, "/data/zlog.db")
      expect(env.HTTPS_PROXY).toBeUndefined()
      expect(env.HTTP_PROXY).toBeUndefined()
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k]
        else process.env[k] = prev[k]
      }
    }
  })
})
