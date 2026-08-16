import { describe, it, expect } from "vitest"
import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BINARY_DATA_PREFIX,
  buildDeployFiles,
  buildEnvList,
  missingSyncConfig,
  parseTar,
  parseTarGz,
  rekeyWebImporter,
  splitDeployFiles,
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

/** pax 扩展头（type 'g'）——真实 codeload tarball 的开头条目。 */
function paxGlobalHeader(name: string): Buffer {
  const data = Buffer.from(`${name}\0`)
  const header = tarHeader(name, data.length)
  header[156] = 103 // 'g'
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512)
  data.copy(padded)
  return Buffer.concat([header, padded])
}

/** 真实格式的 tar.gz：pax_global_header 开头 + 顶层目录。 */
function realTarGz(repoDir: string, entries: Buffer[]): Buffer {
  return makeTarGz([
    paxGlobalHeader("pax_global_header"),
    ...entries,
  ])
}

function makeTarGz(entries: Buffer[]): Buffer {
  return gzipSync(makeTar(entries))
}

// ── parseTar / parseTarGz ──────────────────────────────────────────────

describe("parseTarGz", () => {
  it("真实 codeload 格式（pax_global_header 开头）解压并去顶层目录前缀", () => {
    const gz = realTarGz("zlog-main", [
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

  it("longlink（type L）为下一个条目提供长名称", () => {
    const longName = "zlog-main/" + "a".repeat(120) + ".ts"
    // L 条目：header 名 "././@PaxHeader"（type L），数据 = 长名
    const lHeader = tarHeader("././@PaxHeader", longName.length + 1)
    lHeader[156] = 76 // 'L'
    const lPadded = Buffer.alloc(Math.ceil((longName.length + 1) / 512) * 512)
    Buffer.from(`${longName}\0`).copy(lPadded)
    // 后续条目：真实文件名（截断到 100 字符内的占位——解析器应用 L 名）
    const real = tarEntry("zlog-main/truncated-name.ts", Buffer.from("export const x = 1"))
    const tar = makeTar([tarDir("zlog-main/"), Buffer.concat([lHeader, lPadded]), real])
    const entries = parseTar(tar)
    expect(entries[0].path).toBe(longName)
  })

  it("pax 'x' 的 path 键覆盖下一条目名称", () => {
    const longPath = `zlog-main/${"b".repeat(110)}.ts`
    const tar = makeTar([
      tarDir("zlog-main/"),
      tarPaxX(paxRecord("path", longPath)),
      tarEntry("zlog-main/short.ts", Buffer.from("export const x = 1")),
    ])
    const entries = parseTar(tar)
    expect(entries[0].path).toBe(longPath)
  })

  it("pax 'x' 优先于 longlink（先 L 后 x 时用 x 的名称）", () => {
    // L 给一个名，x 给另一个——x 必须胜出，且 L 名不被 x 头吞掉
    const viaLonglink = `zlog-main/${"c".repeat(110)}-via-longlink.ts`
    const viaPax = `zlog-main/${"d".repeat(110)}-via-pax.ts`
    const lHeader = tarHeader("././@PaxHeader", viaLonglink.length + 1)
    lHeader[156] = 76 // 'L'
    const lPadded = Buffer.alloc(Math.ceil((viaLonglink.length + 1) / 512) * 512)
    Buffer.from(`${viaLonglink}\0`).copy(lPadded)
    const tar = makeTar([
      tarDir("zlog-main/"),
      Buffer.concat([lHeader, lPadded]),
      tarPaxX(paxRecord("path", viaPax)),
      tarEntry("zlog-main/short.ts", Buffer.from("export const x = 1")),
    ])
    const entries = parseTar(tar)
    expect(entries[0].path).toBe(viaPax)
  })
})

/** pax 记录："<len> key=value\n"，len 是整个记录（含 "<len> " 前缀）字节数。 */
function paxRecord(key: string, value: string): string {
  const body = `${key}=${value}\n`
  let record = `0 ${body}`
  for (let i = 0; i < 2; i++) record = `${record.length} ${body}`
  return record
}

/** pax 'x' 扩展头条目（header 名 ././@PaxHeader，type 'x'，数据 = 记录）。 */
function tarPaxX(record: string): Buffer {
  const header = tarHeader("././@PaxHeader", record.length)
  header[156] = 120 // 'x'
  const padded = Buffer.alloc(Math.ceil(record.length / 512) * 512)
  Buffer.from(record).copy(padded)
  return Buffer.concat([header, padded])
}

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
    const { files, skipped } = buildDeployFiles(entries)
    expect(files.map((f) => f.file).sort()).toEqual([
      "package.json",
      "src/app/page.tsx",
    ])
    expect(skipped).toHaveLength(0)
  })

  it("跳过含 NUL 的二进制与超大文件并统计", () => {
    const { files, skipped } = buildDeployFiles([
      { path: "a.png", data: Buffer.from([0x89, 0x50, 0x00, 0x47]) },
      { path: "big.bin", data: Buffer.alloc(1_500_000) },
      { path: "ok.txt", data: Buffer.from("text") },
    ])
    expect(files.map((f) => f.file)).toEqual(["ok.txt"])
    expect(skipped).toHaveLength(2)
    expect(skipped[0]).toContain("a.png")
  })

  it("排除 .env.* 变体（段完全匹配不到的点文件名）", () => {
    const { files } = buildDeployFiles([
      { path: "apps/web/.env.local", data: Buffer.from("SECRET=1") },
      { path: "apps/web/.env.production", data: Buffer.from("SECRET=2") },
      { path: ".env.local.example", data: Buffer.from("example") },
      { path: "apps/web/.gitignore", data: Buffer.from("x") },
      { path: "ok.ts", data: Buffer.from("text") },
    ])
    // .gitignore 等普通点文件保留，env 变体全部排除
    expect(files.map((f) => f.file)).toEqual(["ok.ts", ".gitignore"])
  })

  it("public/ 下的二进制资源以 base64 上传（logo 等必需资产）", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02])
    const { files, skipped } = buildDeployFiles([
      { path: "apps/web/public/zlog-logo.png", data: png },
      { path: "src/app/page.tsx", data: Buffer.from("export default Page") },
    ])
    const logo = files.find((f) => f.file === "public/zlog-logo.png")
    expect(logo?.data.startsWith("data:application/octet-stream;base64,")).toBe(true)
    // base64 数据可还原为原始字节
    const restored = Buffer.from(
      logo!.data.slice("data:application/octet-stream;base64,".length),
      "base64"
    )
    expect(restored.equals(png)).toBe(true)
    expect(skipped).toHaveLength(0)
  })

  it("public/ 下超大二进制仍跳过；非 public 二进制仍跳过", () => {
    const { files, skipped } = buildDeployFiles([
      { path: "apps/web/public/huge.bin", data: Buffer.alloc(5 * 1024 * 1024) },
      { path: "apps/web/src/assets/blob.bin", data: Buffer.from([0x00, 0x01]) },
      { path: "ok.ts", data: Buffer.from("text") },
    ])
    expect(files.map((f) => f.file)).toEqual(["ok.ts"])
    expect(skipped).toHaveLength(2)
    expect(skipped[0]).toContain("huge.bin")
  })
})

// ── splitDeployFiles ───────────────────────────────────────────────────

describe("splitDeployFiles", () => {
  it("拆出二进制（还原原始字节）与文本两类", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])
    const { textFiles, binaryFiles } = splitDeployFiles([
      { file: "package.json", data: "{}" },
      {
        file: "public/logo.png",
        data: `${BINARY_DATA_PREFIX}${png.toString("base64")}`,
      },
    ])
    expect(textFiles).toEqual([{ file: "package.json", data: "{}" }])
    expect(binaryFiles).toHaveLength(1)
    expect(binaryFiles[0].file).toBe("public/logo.png")
    expect(binaryFiles[0].buffer.equals(png)).toBe(true)
  })
})

// ── rekeyWebImporter ───────────────────────────────────────────────────

describe("rekeyWebImporter", () => {
  const lockText = [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  .:",
    "    devDependencies:",
    "      typescript: 5.9.2",
    "",
    "  apps/web:",
    "    dependencies:",
    "      next: 16.0.0",
    "",
    "packages:",
    "  next@16.0.0:",
    "    version: 16.0.0",
    "",
  ].join("\n")

  it("真实格式（importers: 后有空行）重映射键且无重复行", () => {
    const out = rekeyWebImporter(lockText)
    const outLines = out.split("\n")
    // 键重映射：apps/web → "."，原 "." 删除
    expect(outLines).toContain("  .:")
    expect(outLines).not.toContain("  apps/web:")
    // 回归：off-by-one 曾把最后一块末行重复拼进尾部（空行也复现）
    expect(outLines.filter((l) => l === "      next: 16.0.0")).toHaveLength(1)
    // 原 "." 块（typescript）按设计被 web 块替换删除——不应残留
    expect(outLines.filter((l) => l === "      typescript: 5.9.2")).toHaveLength(0)
    // 尾部（packages: 之后）原样保留
    expect(out).toContain("packages:")
    expect(out).toContain("  next@16.0.0:")
  })

  it("无 apps/web importer 时原样返回", () => {
    const text = "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    devDependencies:\n      x: 1.0.0\n"
    expect(rekeyWebImporter(text)).toBe(text)
  })

  it("真实 pnpm-lock.yaml 重映射后 importers 尾部与 packages 区域逐字一致", () => {
    const lock = readFileSync(join(__dirname, "../../../pnpm-lock.yaml"), "utf8")
    const out = rekeyWebImporter(lock)
    expect(out).not.toContain("\n  apps/web:")
    expect(out).toContain("\n  .:")
    // 尾部区域（packages: 之后）必须逐字等于原文件——off-by-one 会在此暴露
    expect(out.slice(out.indexOf("packages:"))).toBe(lock.slice(lock.indexOf("packages:")))
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
    // SESSION_SECRET 复用本地会话密钥（每次部署重新生成会登出线上所有用户）
    expect(env.find((e) => e.key === "SESSION_SECRET")?.value).toBe("s")
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
      "https://api.vercel.com/v2/user": { status: 200, body: { id: "u1" } },
      "https://api.vercel.com/v9/projects/zlog-blog": { status: 404, body: {} },
      "https://api.vercel.com/v13/projects": {
        status: 200,
        body: { id: "prj_1" },
      },
      "https://api.vercel.com/v9/projects/prj_1": {
        status: 200,
        body: { id: "prj_1", alias: ["zlog-blog.vercel.app"] },
      },
      "https://api.vercel.com/v10/projects/prj_1/env?upsert=true": {
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
    const gz = realTarGz("zlog-1.0.0", [
      tarDir("zlog-1.0.0/"),
      tarEntry("zlog-1.0.0/package.json", Buffer.from('{"name":"zlog"}')),
      // 真实形态的 next.config.ts（含 turbopack root 注入锚点——兼容层
      // 重写成功与否直接决定云端构建能否解析 @zlog/*）
      tarEntry(
        "zlog-1.0.0/apps/web/next.config.ts",
        Buffer.from(
          'import path from "node:path"\nconst nextConfig = { turbopack: { root: path.join(__dirname, "../..") } }\nexport default nextConfig'
        )
      ),
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
      "https://api.vercel.com/v2/user": { status: 401, body: { error: {} } },
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
      "https://api.vercel.com/v2/user": { status: 200, body: { id: "u" } },
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
      "https://api.vercel.com/v2/user": { status: 200, body: { id: "u" } },
      "https://api.vercel.com/v9/projects/p": { status: 200, body: { id: "prj", alias: ["p.vercel.app"] } },
      "https://api.vercel.com/v9/projects/prj": { status: 200, body: { id: "prj", alias: ["p.vercel.app"] } },
      "https://api.vercel.com/v10/projects/prj/env?upsert=true": { status: 200, body: {} },
      "https://api.vercel.com/v13/deployments": {
        status: 200,
        body: { id: "dpl" },
      },
      "https://api.vercel.com/v13/deployments/dpl": {
        status: 200,
        body: { readyState: "ERROR", error: { message: "pnpm build failed" } },
      },
    })
    const gz = realTarGz("zlog-1.0.0", [
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

  it("fetchSource 网络抖动时重试后成功", async () => {
    const sourceUrl = "https://codeload.github.com/zephyr110/zlog/tar.gz/refs/tags/v1.0.0"
    const gz = realTarGz("zlog-1.0.0", [
      tarDir("zlog-1.0.0/"),
      tarEntry("zlog-1.0.0/package.json", Buffer.from('{"name":"zlog"}')),
    ])
    let calls = 0
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url === sourceUrl) {
        calls++
        if (calls === 1) throw new TypeError("fetch failed: network down")
        return new Response(new Uint8Array(gz), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
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
    const files = await deployer.fetchSource("1.0.0")
    expect(calls).toBe(2)
    expect(files.some((f) => f.file === "package.json")).toBe(true)
  })

  it("fetchSource 404（版本不存在）不重试", async () => {
    let calls = 0
    const fetchImpl = (async (input: string | URL | Request) => {
      calls++
      if (String(input).includes("codeload")) {
        return new Response("Not Found", { status: 404 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    }) as typeof fetch
    const deployer = new VercelDeployer({
      token: "t",
      projectName: "p",
      version: "9.9.9",
      config: cfg,
      onProgress,
      fetchImpl,
      pollIntervalMs: 5,
    })
    await expect(deployer.fetchSource("9.9.9")).rejects.toMatchObject({ kind: "api" })
    expect(calls).toBe(1)
  })

  it("setEnv 并行写入：所有 env 请求同时发出而非串行", async () => {
    const envFired: string[] = []
    const release: (() => void)[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/v10/projects/prj/env?upsert=true")) {
        envFired.push(url)
        // 挂起直到测试释放——串行实现下后续请求不会发出
        await new Promise<void>((r) => release.push(r))
        return new Response(JSON.stringify({}), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    }) as typeof fetch
    const deployer = new VercelDeployer({
      token: "t",
      projectName: "p",
      version: "1.0.0",
      config: { ...cfg, syncUrl: "libsql://x", syncToken: "tok" },
      onProgress,
      fetchImpl,
      pollIntervalMs: 5,
    })
    const p = deployer.setEnv("prj")
    await new Promise((r) => setTimeout(r, 20))
    // 5 条必需 env 全部在途（串行实现此刻只发了 1 条）
    expect(envFired).toHaveLength(5)
    release.forEach((r) => r())
    await p
  })

  it("deploy 二进制文件走 /v2/now/files sha 引用（data 前缀不直接进 create）", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02])
    let uploadedBody: Buffer | null = null
    let uploadedDigest = ""
    let createBody: { files?: unknown[] } = {}
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === "https://api.vercel.com/v2/now/files") {
        uploadedBody = Buffer.from((init?.body as Buffer) ?? Buffer.alloc(0))
        uploadedDigest = String((init?.headers as Record<string, string>)["x-now-digest"])
        return new Response(
          JSON.stringify({
            urls: ["https://dmmcy.cloudfront.net/abc123sha"],
          }),
          { status: 200 }
        )
      }
      if (url === "https://api.vercel.com/v13/deployments") {
        createBody = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({ id: "dpl", url: "p.vercel.app" }), { status: 200 })
      }
      if (url === "https://api.vercel.com/v13/deployments/dpl") {
        return new Response(JSON.stringify({ readyState: "READY" }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 })
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
    const url = await deployer.deploy(
      [
        { file: "package.json", data: "{}" },
        { file: "public/logo.png", data: `${BINARY_DATA_PREFIX}${png.toString("base64")}` },
      ],
      "prj"
    )
    // 上传的原始字节与 sha1 digest 正确
    expect(uploadedBody?.equals(png)).toBe(true)
    expect(uploadedDigest).toBe(createHash("sha1").update(png).digest("hex"))
    // create 的 files 数组：文本用 data，二进制用 sha 引用
    expect(createBody.files).toEqual([
      { file: "package.json", data: "{}" },
      { file: "public/logo.png", sha: "abc123sha" },
    ])
    expect(url).toBe("p.vercel.app")
  })
})
