import { describe, it, expect } from "vitest"
import { gzipSync } from "node:zlib"
import {
  buildDeployFiles,
  buildEnvList,
  missingSyncConfig,
  parseTar,
  parseTarGz,
  VercelDeployer,
  VercelDeployError,
  type DeployProgress,
} from "../electron/vercel-deploy"
import type { DesktopConfig } from "../electron/config-store"

const base: DesktopConfig = {
  adminUsername: "admin",
  adminPasswordHash: "$2b$10$x",
  sessionSecret: "s",
  desktopKey: "k",
}

// ── tar 构造辅助 ───────────────────────────────────────────────────────

function tarHeader(name: string, size: number, type: "file" | "dir" = "file"): Buffer {
  const h = Buffer.alloc(512)
  h.write(name, 0, 100, "utf8")
  h.write(size.toString(8).padStart(11, "0"), 124, 11, "ascii")
  h.write("0000000", 136, 7, "ascii")
  h[156] = type === "dir" ? 53 : 48 // '5' | '0'
  h.write("0000644", 100, 7, "ascii")
  h.write("0000000", 108, 7, "ascii")
  h.write("0000000", 116, 7, "ascii")
  h.write("        ", 148, 8, "ascii")
  h.write("ustar", 257, 5, "ascii")
  h.write("00", 263, 2, "ascii")
  return h
}

function tarEntry(name: string, data: Buffer): Buffer {
  const header = tarHeader(name, data.length)
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512)
  data.copy(padded)
  return Buffer.concat([header, padded])
}

function tarDir(name: string): Buffer {
  return tarHeader(name, 0, "dir")
}

function makeTar(entries: Buffer[]): Buffer {
  return Buffer.concat([...entries, Buffer.alloc(1024)])
}

function makeTarGz(entries: Buffer[]): Buffer {
  return gzipSync(makeTar(entries))
}

// ── parseTar / parseTarGz ──────────────────────────────────────────────

describe("parseTarGz", () => {
  it("解压并去掉顶层目录前缀", () => {
    const gz = makeTarGz([
      tarDir("zlog-main/"),
      tarEntry("zlog-main/package.json", Buffer.from('{"name":"zlog"}')),
      tarEntry("zlog-main/apps/web/next.config.ts", Buffer.from("export default {}")),
    ])
    const entries = parseTarGz(gz)
    expect(entries.map((e) => e.path).sort()).toEqual([
      "apps/web/next.config.ts",
      "package.json",
    ])
    expect(entries[0].data.toString()).toBe('{"name":"zlog"}')
  })

  it("空 tar 返回空数组", () => {
    expect(parseTarGz(gzipSync(Buffer.alloc(1024)))).toEqual([])
  })

  it("parseTar 处理无顶层目录的条目", () => {
    const tar = makeTar([tarEntry("a.txt", Buffer.from("hi"))])
    const entries = parseTar(tar)
    expect(entries).toHaveLength(1)
    expect(entries[0].path).toBe("a.txt")
  })
})

// ── buildDeployFiles ───────────────────────────────────────────────────

describe("buildDeployFiles", () => {
  it("排除 node_modules/.next/docs/desktop 与二进制", () => {
    const entries = [
      { path: "package.json", data: Buffer.from("{}") },
      { path: "node_modules/undici/index.js", data: Buffer.from("x") },
      { path: "apps/web/.next/server.js", data: Buffer.from("x") },
      { path: "apps/desktop/electron/main.ts", data: Buffer.from("x") },
      { path: "docs/spec.md", data: Buffer.from("x") },
      { path: "apps/web/src/app/page.tsx", data: Buffer.from("export default Page") },
    ]
    const files = buildDeployFiles(entries)
    expect(files.map((f) => f.file).sort()).toEqual([
      "apps/web/src/app/page.tsx",
      "package.json",
    ])
  })

  it("跳过含 NUL 的二进制与超大文件", () => {
    const files = buildDeployFiles([
      { path: "a.png", data: Buffer.from([0x89, 0x50, 0x00, 0x47]) },
      { path: "big.bin", data: Buffer.alloc(1_500_000) },
      { path: "ok.txt", data: Buffer.from("text") },
    ])
    expect(files.map((f) => f.file)).toEqual(["ok.txt"])
  })
})

// ── buildEnvList / missingSyncConfig ───────────────────────────────────

describe("buildEnvList", () => {
  it("生成必需 env（admin 哈希 base64 编码）", () => {
    const env = buildEnvList({ ...base, syncUrl: "libsql://x.turso.io", syncToken: "tok" })
    const keys = env.map((e) => e.key)
    expect(keys).toContain("TURSO_DATABASE_URL")
    expect(keys).toContain("TURSO_AUTH_TOKEN")
    expect(keys).toContain("ADMIN_USERNAME")
    expect(keys).toContain("ADMIN_PASSWORD_HASH")
    expect(keys).toContain("SESSION_SECRET")
    const hash = env.find((e) => e.key === "ADMIN_PASSWORD_HASH")
    expect(hash?.value).toBe(Buffer.from("$2b$10$x", "utf8").toString("base64"))
    expect(env.find((e) => e.key === "TURSO_DATABASE_URL")?.value).toBe("libsql://x.turso.io")
    // SESSION_SECRET 每次生成（随机）
    expect(env.find((e) => e.key === "SESSION_SECRET")?.value).toMatch(/^[0-9a-f]{64}$/)
  })

  it("透传可选流量分析凭据", () => {
    const env = buildEnvList({
      ...base,
      syncUrl: "libsql://x",
      syncToken: "t",
      gaPropertyId: "123",
      gaClientEmail: "svc@x.iam.gserviceaccount.com",
      gaPrivateKey: "KEY",
    })
    const ga = env.find((e) => e.key === "GA_PROPERTY_ID")
    expect(ga?.value).toBe("123")
  })
})

describe("missingSyncConfig", () => {
  it("缺同步配置时返回原因", () => {
    expect(missingSyncConfig(base)).toBe("sync")
    expect(missingSyncConfig({ ...base, syncUrl: "http://bad", syncToken: "t" })).toBe("syncUrl")
    expect(
      missingSyncConfig({ ...base, syncUrl: "libsql://x", syncToken: "t" })
    ).toBeNull()
  })
})

// ── VercelDeployer（mock fetch） ───────────────────────────────────────

describe("VercelDeployer", () => {
  function fakeFetch(
    routes: Record<string, { status: number; body: unknown }>
  ): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const route = routes[url] ?? { status: 404, body: { error: { message: "not found" } } }
      return new Response(JSON.stringify(route.body), {
        status: route.status,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch
  }

  const cfg: DesktopConfig = {
    ...base,
    syncUrl: "libsql://x.turso.io",
    syncToken: "tok",
  }
  const progress: DeployProgress[] = []
  const onProgress = (p: DeployProgress) => progress.push(p)

  it("完整流程：校验 → 建项目 → env → 部署 → 轮询到 READY 返回 URL", async () => {
    const apiRoutes = fakeFetch({
      "https://api.vercel.com/v9/user": { status: 200, body: { id: "u1" } },
      "https://api.vercel.com/v9/projects/zlog-blog": { status: 404, body: {} },
      "https://api.vercel.com/v13/projects": {
        status: 200,
        body: { id: "prj_1" },
      },
      "https://api.vercel.com/v10/projects/prj_1/env": {
        status: 200,
        body: { key: "TURSO_DATABASE_URL" },
      },
      "https://api.vercel.com/v13/deployments": {
        status: 200,
        body: { id: "dpl_1" },
      },
      "https://api.vercel.com/v13/deployments/dpl_1": {
        status: 200,
        body: { readyState: "READY" },
      },
      "https://api.vercel.com/v9/projects/prj_1": {
        status: 200,
        body: { alias: ["zlog-blog.vercel.app"] },
      },
    })
    // codeload 源码拉取：返回构造的 tar.gz
    const sourceUrl = "https://codeload.github.com/zephyr110/zlog/tar.gz/refs/tags/v1.0.0"
    const gz = makeTarGz([
      tarDir("zlog-1.0.0/"),
      tarEntry("zlog-1.0.0/package.json", Buffer.from('{"name":"zlog"}')),
      tarEntry("zlog-1.0.0/apps/web/next.config.ts", Buffer.from("export default {}")),
      tarEntry("zlog-1.0.0/node_modules/x/index.js", Buffer.from("x")),
    ])
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === sourceUrl) {
        return new Response(new Uint8Array(gz), { status: 200 })
      }
      return apiRoutes(String(input), init)
    }) as typeof fetch

    const deployer = new VercelDeployer({
      token: "tok",
      projectName: "zlog-blog",
      version: "1.0.0",
      config: cfg,
      onProgress,
      fetchImpl,
      pollIntervalMs: 5,
    })
    const url = await deployer.run()
    expect(url).toBe("zlog-blog.vercel.app")
    expect(progress.map((p) => p.phase)).toContain("done")
  })

  it("token 无效（401）→ VercelDeployError kind=token", async () => {
    const fetchImpl = fakeFetch({
      "https://api.vercel.com/v9/user": { status: 401, body: { error: {} } },
    })
    const deployer = new VercelDeployer({
      token: "bad",
      projectName: "p",
      version: "1.0.0",
      config: cfg,
      onProgress,
      fetchImpl,
    })
    await expect(deployer.run()).rejects.toMatchObject({ kind: "token" })
  })

  it("项目名冲突（409）→ kind=conflict", async () => {
    const fetchImpl = fakeFetch({
      "https://api.vercel.com/v9/user": { status: 200, body: { id: "u" } },
      "https://api.vercel.com/v9/projects/p": { status: 404, body: {} },
      "https://api.vercel.com/v13/projects": { status: 409, body: {} },
    })
    const deployer = new VercelDeployer({
      token: "t",
      projectName: "p",
      version: "1.0.0",
      config: cfg,
      onProgress,
      fetchImpl,
    })
    await expect(deployer.run()).rejects.toMatchObject({ kind: "conflict" })
  })

  it("构建失败（ERROR）→ kind=build 且带构建错误信息", async () => {
    const apiRoutes = fakeFetch({
      "https://api.vercel.com/v9/user": { status: 200, body: { id: "u" } },
      "https://api.vercel.com/v9/projects/p": { status: 200, body: { id: "prj" } },
      "https://api.vercel.com/v10/projects/prj/env": { status: 200, body: {} },
      "https://api.vercel.com/v13/deployments": {
        status: 200,
        body: { id: "dpl" },
      },
      "https://api.vercel.com/v13/deployments/dpl": {
        status: 200,
        body: { readyState: "ERROR", error: { message: "pnpm build failed" } },
      },
    })
    const gz = makeTarGz([
      tarDir("zlog-1.0.0/"),
      tarEntry("zlog-1.0.0/package.json", Buffer.from("{}")),
    ])
    const sourceUrl = "https://codeload.github.com/zephyr110/zlog/tar.gz/refs/tags/v1.0.0"
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === sourceUrl) {
        return new Response(new Uint8Array(gz), { status: 200 })
      }
      return apiRoutes(String(input), init)
    }) as typeof fetch
    const deployer = new VercelDeployer({
      token: "t",
      projectName: "p",
      version: "1.0.0",
      config: cfg,
      onProgress,
      fetchImpl,
      pollIntervalMs: 5,
    })
    await expect(deployer.run()).rejects.toMatchObject({
      kind: "build",
    })
    await expect(deployer.run()).rejects.toThrow(/pnpm build failed/)
  })
})
