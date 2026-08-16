import { gunzipSync } from "node:zlib"
import { fetch, type Dispatcher } from "undici"
import type { DesktopConfig } from "./config-store"
import { createProxyDispatcher } from "./proxy-agent"
import { encodeEnvHash } from "./server-env"

/**
 * 一键部署到 Vercel（upload deployment，无需 Git 集成）。
 *
 * 流程：校验 token → 查/建项目 → 配置环境变量（复用本地 config 的
 * Turso 同步与 admin 凭据）→ 拉取官方仓库 tarball（与 app 版本匹配的
 * tag，匿名可下载）→ 上传部署 → 轮询构建状态 → 返回线上地址。
 *
 * 用户只需：注册 Vercel → 生成 API token → 粘贴到设置 → 点部署。
 * 全程无 GitHub 账号、无命令行、无手动环境变量（详见
 * docs/superpowers/specs/2026-08-15-one-click-deploy-design.md）。
 */

export type DeployPhase =
  | "validating" // 校验 token
  | "project" // 查/建项目
  | "env" // 配置环境变量
  | "source" // 拉取源码
  | "upload" // 创建部署
  | "building" // 轮询构建
  | "done"
  | "failed"

export interface DeployProgress {
  phase: DeployPhase
  message?: string
  url?: string
  error?: string
}

const API_BASE = "https://api.vercel.com"
const SOURCE_REPO = "zephyr110/zlog"
/** 拉取官方仓库 tarball（与 app 版本匹配的 tag；匿名下载无需账号）。 */
function sourceTarballUrl(version: string): string {
  return `https://codeload.github.com/${SOURCE_REPO}/tar.gz/refs/tags/v${version}`
}

const REQUEST_TIMEOUT_MS = 15_000
/** 上传部署（整个源码树内联 JSON）比普通 API 调用大得多——放宽超时。 */
const UPLOAD_TIMEOUT_MS = 90_000
const SOURCE_DOWNLOAD_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 5_000
const BUILD_TIMEOUT_MS = 10 * 60_000

/** 部署时排除的路径片段（node_modules / 构建产物 / 文档 / 桌面端等）。
 *  按路径段匹配（split("/") 后的单个段），"desktop" 命中 apps/desktop。 */
const EXCLUDED_SEGMENTS = [
  "node_modules",
  ".next",
  "out",
  ".git",
  ".claude",
  "docs",
  "coverage",
  "dist",
  "release",
  "desktop",
  "test",
  ".env",
]

// ── 纯函数：tar.gz 解析 ────────────────────────────────────────────────

export interface TarEntry {
  path: string
  data: Buffer
}

/** 解析 ustar tar 二进制（已解压 gzip）。支持 pax 扩展头/longlink/目录。 */
export function parseTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0
  let pendingLongName: string | null = null
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const name = readTarString(header, 0, 100)
    if (!name) break
    const size = parseInt(readTarString(header, 124, 12).trim() || "0", 8)
    if (!Number.isFinite(size) || size < 0) break // 非法 size：中止而非死循环
    const type = String.fromCharCode(header[156] || 48)
    const prefix = readTarString(header, 345, 155)
    let fullPath = pendingLongName ?? (prefix ? `${prefix}/${name}` : name)
    pendingLongName = null
    offset += 512
    const dataLen = Math.ceil(size / 512) * 512
    if (type === "L" || type === "K") {
      // longlink：数据即长名称（用于下一个条目）
      pendingLongName = buf
        .subarray(offset, offset + size)
        .toString("utf8")
        .replace(/\0+$/, "")
      offset += dataLen
      continue
    }
    if (type === "g" || type === "x") {
      // pax 全局/扩展头（GitHub codeload tarball 以 pax_global_header 开头）：
      // 跳过其数据，不产生条目
      offset += dataLen
      continue
    }
    if (type === "5") {
      // 目录：无数据
      offset += dataLen
      continue
    }
    const data = buf.subarray(offset, offset + size)
    offset += dataLen
    entries.push({ path: fullPath, data: Buffer.from(data) })
  }
  return entries
}

/** 解压 gzip 后解析 tar；返回 { path, data }（路径已去顶层目录前缀）。
 *  顶层目录取第一个目录条目（type '5'），而不是 entries[0]——真实
 *  codeload tarball 以 pax_global_header（type 'g'）开头，按 entries[0]
 *  剥离会把所有真实文件过滤掉。 */
export function parseTarGz(gz: Buffer): TarEntry[] {
  const tar = gunzipSync(gz)
  const entries = parseTar(tar)
  const top = entries.find((e) => e.path.includes("/"))?.path.split("/")[0]
  if (!top) return []
  return entries
    .filter((e) => e.path.startsWith(`${top}/`))
    .map((e) => ({ path: e.path.slice(top.length + 1), data: e.data }))
}

function readTarString(buf: Buffer, start: number, len: number): string {
  const end = buf.indexOf(0, start)
  const slice = buf.subarray(start, end >= 0 && end < start + len ? end : start + len)
  return slice.toString("utf8")
}

/** 部署文件清单：过滤排除项与无关文件。返回 { files, skipped }。 */
export function buildDeployFiles(entries: TarEntry[]): {
  files: { file: string; data: string }[]
  skipped: string[]
} {
  const files: { file: string; data: string }[] = []
  const skipped: string[] = []
  for (const e of entries) {
    const segments = e.path.split("/")
    if (segments.some((s) => EXCLUDED_SEGMENTS.includes(s))) continue
    // 只保留文本源码（忽略二进制/大文件——统计跳过项，避免线上静默缺文件）
    if (e.data.length > 1_000_000) {
      skipped.push(`${e.path} (${e.data.length} bytes)`)
      continue
    }
    const text = e.data.toString("utf8")
    // 注意 \u0000 转义——字面 NUL 会让 git 把整个文件当二进制
    if (text.includes("\u0000")) {
      skipped.push(`${e.path} (binary)`)
      continue
    }
    files.push({ file: e.path, data: text })
  }
  return flattenWorkspace(files, skipped)
}

/**
 * 打平为单项目部署结构（Vercel upload deployment 对 rootDirectory 的
 * workspace 子目录支持不佳——实测 install 要求 lockfile 在 cwd、next
 * 检测要求 package.json 在检测目录）：
 * - apps/web/** 提升为部署根（package.json / next.config.ts / src 等）
 * - packages/database、packages/core 保留（workspace 成员）
 * - pnpm-lock.yaml 的 importer 键 "apps/web" 改为 "."（部署根 = 原 apps/web）
 * 部署后构建在部署根跑：lockfile/package.json/next 全部在 cwd，标准单
 * 项目结构，无 workspace 子目录问题。
 */
export function flattenWorkspace(
  filtered: { file: string; data: string }[],
  skipped: string[]
): { files: { file: string; data: string }[]; skipped: string[] } {
  // 用 Map 去重：先放非 apps/web 文件（根配置 + packages/**），
  // apps/web 提升件随后覆盖同名根文件（package.json / tsconfig 等）
  const flatMap = new Map<string, { file: string; data: string }>()
  for (const f of filtered) {
    if (f.file.startsWith("apps/web/")) continue
    flatMap.set(f.file, f)
  }
  for (const f of filtered) {
    if (!f.file.startsWith("apps/web/")) continue
    // 键与值对象的 file 都要去前缀（后续按 file 字段写文件/上传）
    const lifted = f.file.slice("apps/web/".length)
    let data = f.data
    // 打平后 __dirname 即部署根（workspace 根）——next.config 里指向
    // workspace 根的 "../.." 会越界到 /vercel，导致 Turbopack 解析
    // 不到 @zlog/*（Module not found）
    if (lifted === "next.config.ts") {
      // 打平后 __dirname 即部署根（workspace 根）——next.config 里指向
      // workspace 根的 "../.." 会越界到 /vercel；同时用 resolveAlias 把
      // workspace 包直接指向源码，绕开 Turbopack 对 pnpm symlink 的
      // 解析差异（实测 symlink 存在但 Module not found）
      data = data.replace(
        'root: path.join(__dirname, "../..")',
        `root: __dirname,
      resolveAlias: {
        "@zlog/auth": "./packages/auth/src/index.ts",
        "@zlog/core": "./packages/core/src/index.ts",
        "@zlog/database": "./packages/database/src/index.ts",
      }`
      )
    } else if (lifted === "tsconfig.json") {
      // tsc 类型检查不读 resolveAlias——tsconfig paths 同样别名到源码
      data = data.replace(
        '"paths": {\n      "@/*": ["./src/*"]\n    }',
        '"paths": {\n      "@/*": ["./src/*"],\n      "@zlog/auth": ["./packages/auth/src/index.ts"],\n      "@zlog/core": ["./packages/core/src/index.ts"],\n      "@zlog/database": ["./packages/database/src/index.ts"]\n    }'
      )
    }
    flatMap.set(lifted, { file: lifted, data })
  }
  const flat = [...flatMap.values()]
  // importer 键适配：部署根的 package.json（原 apps/web）对应 lockfile 的
  // "." importer。原 lockfile 已有 "."（zlog 根）——块级重建：删除原
  // "." importer，把 apps/web importer 改键为 "."
  const lock = flat.find((f) => f.file === "pnpm-lock.yaml")
  if (lock) {
    lock.data = rekeyWebImporter(lock.data)
  }
  return { files: flat, skipped }
}

/**
 * 把 pnpm-lock.yaml 的 importer 从 workspace 结构适配为打平结构：
 * - 删除原 "." importer（zlog 根——部署不需要其依赖）
 * - apps/web importer 改键为 "."（部署根 = 原 apps/web）
 * 纯行处理（2 空格缩进 = importer 键，4+ 空格 = 键下内容，0 缩进 = 顶级键）。
 */
export function rekeyWebImporter(lockText: string): string {
  const lines = lockText.split("\n")
  const importersIdx = lines.findIndex((l) => l === "importers:")
  if (importersIdx < 0) return lockText
  // 收集 importer 块（importers: 之后到下一个 0 缩进键）
  interface Block { key: string; lines: string[] }
  const blocks: Block[] = []
  let cur: Block | null = null
  for (let i = importersIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith("  ") && !line.startsWith("    ")) {
      if (cur) blocks.push(cur)
      cur = { key: line.trim(), lines: [line] }
    } else if (line.startsWith("    ") || line === "") {
      if (cur) cur.lines.push(line)
    } else {
      break
    }
  }
  if (cur) blocks.push(cur)
  const web = blocks.find((b) => b.key === "apps/web:")
  const root = blocks.find((b) => b.key === "'.':" || b.key === ".:")
  if (!web || !root) return lockText
  // 重建：web 块（键改 '.'）替换 root 块的位置，删除原 web 块
  // 键行必须是 2 空格缩进的裸键 `.:`——pnpm 11 对引号键 `'.':` 的
  // frozen 校验不匹配（实测 "specifiers don't match"）
  const webLines = ["  .:", ...web.lines.slice(1)]
  const webBlock: Block = { key: "'.':", lines: webLines }
  const out: string[] = []
  for (const b of blocks) {
    if (b === root) {
      out.push(...webBlock.lines)
    } else if (b !== web) {
      out.push(...b.lines)
    }
  }
  return [
    ...lines.slice(0, importersIdx + 1),
    ...out,
    ...lines.slice(importersIdx + 1 + blocks.reduce((n, b) => n + b.lines.length, 0)),
  ].join(String.fromCharCode(10))
}

// ── 纯函数：环境变量清单 ───────────────────────────────────────────────

export interface DeployEnv {
  key: string
  value: string
  target: string[]
}

/** 从本地 config 组装 Vercel 环境变量（复用同步与 admin 凭据）。 */
export function buildEnvList(cfg: DesktopConfig): DeployEnv[] {
  const env: DeployEnv[] = [
    {
      key: "TURSO_DATABASE_URL",
      value: cfg.syncUrl ?? "",
      target: ["production"],
    },
    {
      key: "TURSO_AUTH_TOKEN",
      value: cfg.syncToken ?? "",
      target: ["production"],
    },
    {
      key: "ADMIN_USERNAME",
      value: cfg.adminUsername,
      target: ["production"],
    },
    {
      key: "ADMIN_PASSWORD_HASH",
      value: encodeEnvHash(cfg.adminPasswordHash),
      target: ["production"],
    },
    {
      // 复用本地会话密钥：每次部署重新生成会旋转线上签名密钥，
      // 使线上所有已登录用户（含管理员）静默登出
      key: "SESSION_SECRET",
      value: cfg.sessionSecret,
      target: ["production"],
    },
  ]
  // 可选透传：流量分析凭据
  if (cfg.vercelApiToken) {
    env.push({ key: "VERCEL_API_TOKEN", value: cfg.vercelApiToken, target: ["production"] })
  }
  if (cfg.vercelProjectId) {
    env.push({ key: "VERCEL_ANALYTICS_PROJECT_ID", value: cfg.vercelProjectId, target: ["production"] })
  }
  if (cfg.vercelTeamId) {
    env.push({ key: "VERCEL_ANALYTICS_TEAM_ID", value: cfg.vercelTeamId, target: ["production"] })
  }
  if (cfg.gaPropertyId) {
    env.push({ key: "GA_PROPERTY_ID", value: cfg.gaPropertyId, target: ["production"] })
  }
  if (cfg.gaClientEmail) {
    env.push({ key: "GA_CLIENT_EMAIL", value: cfg.gaClientEmail, target: ["production"] })
  }
  if (cfg.gaPrivateKey) {
    env.push({ key: "GA_PRIVATE_KEY", value: cfg.gaPrivateKey, target: ["production"] })
  }
  return env
}

/** 部署前置检查：同步配置缺失时返回缺什么。 */
export function missingSyncConfig(cfg: DesktopConfig): string | null {
  if (!cfg.syncUrl || !cfg.syncToken) {
    return "sync"
  }
  if (!cfg.syncUrl.startsWith("libsql://")) {
    return "syncUrl"
  }
  return null
}

// ── VercelDeployer ─────────────────────────────────────────────────────

export class VercelDeployError extends Error {
  constructor(
    message: string,
    readonly kind: "token" | "conflict" | "build" | "network" | "api" | "canceled"
  ) {
    super(message)
  }
}

interface VercelDeployOptions {
  token: string
  projectName: string
  /** app 版本（用于拉取匹配的官方仓库 tag）。 */
  version: string
  config: DesktopConfig
  /** 已解析的系统/手动代理（http:// 或 socks5://）；无则直连。 */
  proxyUrl?: string
  onProgress: (p: DeployProgress) => void
  /** 注入用（测试）。 */
  fetchImpl?: typeof fetch
  /** 注入用（测试）。 */
  now?: () => number
  /** 轮询间隔（测试可缩短）。 */
  pollIntervalMs?: number
}

export class VercelDeployer {
  private readonly token: string
  private readonly projectName: string
  private readonly version: string
  private readonly config: DesktopConfig
  private readonly onProgress: (p: DeployProgress) => void
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly pollIntervalMs: number
  private readonly dispatcher: Dispatcher | undefined
  /** 取消信号：传给所有进行中的请求，cancel() 能真正中止而非只靠检查点。 */
  private readonly controller = new AbortController()
  private cancelled = false

  constructor(opts: VercelDeployOptions) {
    // 参数校验：必填项缺失直接拒绝（避免运行到中途才暴露 undefined）
    if (!opts.token || !opts.projectName || !opts.version) {
      throw new VercelDeployError("部署参数不完整（token/项目名/版本）", "api")
    }
    this.token = opts.token
    this.projectName = opts.projectName
    this.version = opts.version
    this.config = opts.config
    this.onProgress = opts.onProgress
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.now = opts.now ?? Date.now
    this.pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS
    this.dispatcher = createProxyDispatcher(opts.proxyUrl ?? "")
  }

  cancel(): void {
    this.cancelled = true
    this.controller.abort()
  }

  private async request(
    path: string,
    init?: { method?: string; body?: unknown; timeoutMs?: number }
  ): Promise<{ status: number; body: unknown }> {
    // 组合取消信号与请求超时：AbortSignal.any 让 cancel() 立即中止在途请求
    const timeoutSignal = AbortSignal.timeout(init?.timeoutMs ?? REQUEST_TIMEOUT_MS)
    const signal = AbortSignal.any([this.controller.signal, timeoutSignal])
    try {
      const res = await this.fetchImpl(`${API_BASE}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        dispatcher: this.dispatcher as never,
        signal,
      } as never)
      const text = await res.text()
      let body: unknown = null
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }
      return { status: res.status, body }
    } catch (err) {
      // 取消优先于网络错误报告（用户主动取消不应显示成连接失败）
      if (this.cancelled || this.controller.signal.aborted) {
        throw new VercelDeployError("部署已取消", "canceled")
      }
      const cause =
        typeof err === "object" && err && "cause" in err
          ? String((err as { cause: unknown }).cause)
          : ""
      throw new VercelDeployError(
        `无法连接 Vercel API：${err instanceof Error ? err.message : String(err)}${cause ? `（${cause.slice(0, 200)}）` : ""}`,
        "network"
      )
    }
  }

  private ensureNotCancelled(): void {
    if (this.cancelled) throw new VercelDeployError("部署已取消", "canceled")
  }

  /** 校验 token 并返回用户信息。 */
  async validateToken(): Promise<void> {
    this.onProgress({ phase: "validating", message: "正在校验 Token…" })
    // 注意：user 端点是 /v2/user——/v9/user 返回 400 "Invalid API version"
    const { status } = await this.request("/v2/user")
    if (status === 401 || status === 403) {
      throw new VercelDeployError(
        "Token 无效或权限不足——请到 Vercel 控制台 Settings → Tokens 重新生成",
        "token"
      )
    }
    if (status !== 200) {
      throw new VercelDeployError(`Vercel API 返回异常（HTTP ${status}）`, "api")
    }
  }

  /** 查项目；不存在则创建。返回 projectId。 */
  async ensureProject(): Promise<string> {
    this.onProgress({ phase: "project", message: "正在准备 Vercel 项目…" })
    this.ensureNotCancelled()
    const existing = await this.request(`/v9/projects/${encodeURIComponent(this.projectName)}`)
    if (existing.status === 200) {
      const id = (existing.body as { id?: string }).id
      if (!id) throw new VercelDeployError("Vercel 项目响应缺少 id", "api")
      return id
    }
    if (existing.status !== 404) {
      if (existing.status === 403 || existing.status === 401) {
        throw new VercelDeployError("Token 无权创建项目——请在 Vercel 设置里允许创建项目", "token")
      }
      throw new VercelDeployError(
        `查询项目失败（HTTP ${existing.status}）`,
        existing.status === 409 ? "conflict" : "api"
      )
    }
    this.ensureNotCancelled()
    const created = await this.request("/v13/projects", {
      method: "POST",
      body: { name: this.projectName, framework: "nextjs" },
    })
    if (created.status !== 200 && created.status !== 201) {
      if (created.status === 409) {
        throw new VercelDeployError(
          `项目名 "${this.projectName}" 已被占用——换个名字重试`,
          "conflict"
        )
      }
      throw new VercelDeployError(`创建项目失败（HTTP ${created.status}）`, "api")
    }
    const id = (created.body as { id?: string }).id
    if (!id) throw new VercelDeployError("Vercel 创建项目响应缺少 id", "api")
    return id
  }

  /**
   * 持久化项目构建配置。仅靠部署请求的 projectSettings 时，Vercel 的
   * 框架检测在已存在项目上读项目级设置（rootDirectory 缺失 → 在仓库根
   * 找 next → "No Next.js version detected"）。
   */
  async configureProject(projectId: string): Promise<void> {
    this.ensureNotCancelled()
    const res = await this.request(`/v9/projects/${projectId}`, {
      method: "PATCH",
      body: {
        framework: "nextjs",
        // 打平结构：部署根即项目根——清掉可能残留的 rootDirectory
        rootDirectory: null,
        buildCommand:
          "corepack enable && corepack prepare pnpm@11.14.0 --activate && pnpm build",
        installCommand:
          "corepack enable && corepack prepare pnpm@11.14.0 --activate && pnpm install --frozen-lockfile",
      },
    })
    if (res.status !== 200) {
      throw new VercelDeployError(`配置项目失败（HTTP ${res.status}）`, "api")
    }
  }

  /** 配置环境变量（逐条 upsert——重复部署同项目时覆盖旧值）。 */
  async setEnv(projectId: string): Promise<void> {
    this.onProgress({ phase: "env", message: "正在配置环境变量…" })
    const envList = buildEnvList(this.config)
    for (const e of envList) {
      this.ensureNotCancelled()
      const res = await this.request(
        `/v10/projects/${projectId}/env?upsert=true`,
        {
          method: "POST",
          body: { key: e.key, value: e.value, target: e.target, type: "encrypted" },
        }
      )
      if (res.status !== 200 && res.status !== 201) {
        throw new VercelDeployError(`设置环境变量 ${e.key} 失败（HTTP ${res.status}）`, "api")
      }
    }
  }

  /** 拉取官方仓库 tarball，返回部署文件清单。 */
  async fetchSource(version: string): Promise<{ file: string; data: string }[]> {
    this.onProgress({ phase: "source", message: "正在获取博客代码…" })
    this.ensureNotCancelled()
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(SOURCE_DOWNLOAD_TIMEOUT_MS)])
    try {
      const res = await this.fetchImpl(sourceTarballUrl(version), {
        dispatcher: this.dispatcher as never,
        signal,
      } as never)
      if (!res.ok) {
        // 404 通常是版本 tag 不存在（dev/未发布版本）——与网络问题区分
        if (res.status === 404) {
          throw new VercelDeployError(
            `未找到与当前版本 v${version} 匹配的代码包——请升级到已发布版本后重试`,
            "api"
          )
        }
        throw new VercelDeployError(
          `拉取代码失败（HTTP ${res.status}）——请检查网络/代理后重试`,
          "network"
        )
      }
      const gz = Buffer.from(await res.arrayBuffer())
      const entries = parseTarGz(gz)
      const { files, skipped } = buildDeployFiles(entries)
      if (files.length === 0) {
        throw new VercelDeployError("代码包解析结果为空", "api")
      }
      if (skipped.length > 0) {
        // 跳过项只提示不中断（多为图片等二进制资源）
        console.warn("[deploy] skipped files:", skipped.slice(0, 10))
      }
      return files
    } catch (err) {
      if (err instanceof VercelDeployError) throw err
      if (this.cancelled || this.controller.signal.aborted) {
        throw new VercelDeployError("部署已取消", "canceled")
      }
      throw new VercelDeployError(
        `拉取代码失败：${err instanceof Error ? err.message : String(err)}`,
        "network"
      )
    }
  }

  /** 创建部署并轮询到完成。返回线上地址。 */
  async deploy(files: { file: string; data: string }[], projectId: string): Promise<string> {
    this.onProgress({ phase: "upload", message: "正在上传代码…" })
    this.ensureNotCancelled()
    const created = await this.request("/v13/deployments", {
      method: "POST",
      body: {
        name: this.projectName,
        files,
        // 显式 production target：不传时 Vercel 按 preview 部署，构建注入
        // preview env（未设置）→ 运行时缺 TURSO_DATABASE_URL 等
        target: "production",
        projectSettings: {
          framework: "nextjs",
          // 不 cd ../..：Vercel 把 rootDirectory 当虚拟根，向上 cd 会越界
          // 到 /（ERR_PNPM_NO_PKG_MANIFEST）。命令在 rootDirectory 跑；
          // corepack 固定 pnpm@11（Vercel 检测 lockfile v9 默认用 pnpm 10，
          // 但显式 11.14 与本地一致）；pnpm-lock.yaml 已由 buildDeployFiles
          // 复制到 apps/web，frozen-lockfile 与 next 检测都能找到它
          buildCommand:
            "corepack enable && corepack prepare pnpm@11.14.0 --activate && pnpm build",
          installCommand:
            "corepack enable && corepack prepare pnpm@11.14.0 --activate && pnpm install --frozen-lockfile",
        },
      },
      // 整个源码树内联 JSON——远超普通 API 请求体，放宽超时
      timeoutMs: UPLOAD_TIMEOUT_MS,
    })
    if (created.status !== 200 && created.status !== 201) {
      throw new VercelDeployError(
        `创建部署失败（HTTP ${created.status}）——${describeApiError(created.body)}`,
        "api"
      )
    }
    const deploymentId = (created.body as { id?: string }).id
    if (!deploymentId) throw new VercelDeployError("Vercel 部署响应缺少 id", "api")

    this.onProgress({ phase: "building", message: "正在云端构建（约 2-5 分钟）…" })
    const deadline = this.now() + BUILD_TIMEOUT_MS
    for (;;) {
      this.ensureNotCancelled()
      if (this.now() > deadline) {
        throw new VercelDeployError("构建超时（10 分钟）——请稍后到 Vercel 控制台查看", "build")
      }
      // 先查状态再 sleep：快速完成的构建无需多等一个轮询间隔
      const { status, body } = await this.request(`/v13/deployments/${deploymentId}`)
      if (status !== 200) {
        throw new VercelDeployError(`查询部署状态失败（HTTP ${status}）`, "api")
      }
      const readyState = (body as { readyState?: string }).readyState
      if (readyState === "READY") break
      if (readyState === "ERROR" || readyState === "CANCELED") {
        const err = (body as { error?: { message?: string } }).error
        throw new VercelDeployError(
          `云端构建失败：${err?.message ?? "未知错误"}`,
          "build"
        )
      }
      await sleep(this.pollIntervalMs)
    }
    this.ensureNotCancelled()
    // 优先用部署响应自带的 url（新项目 alias 可能尚未挂载）
    const deployUrl = (created.body as { url?: string }).url
    const url =
      typeof deployUrl === "string" && deployUrl
        ? deployUrl.replace(/^https?:\/\//, "")
        : await this.projectAlias(projectId)
    this.onProgress({ phase: "done", url })
    return url
  }

  /** 取项目生产域名（alias 可能滞后——调用方已有 deployment url 时用那个）。 */
  private async projectAlias(projectId: string): Promise<string> {
    const project = await this.request(`/v9/projects/${projectId}`)
    const alias = (project.body as { alias?: string[] }).alias
    const url = alias?.find((a) => a.includes("vercel.app")) ?? alias?.[0]
    if (!url) throw new VercelDeployError("部署成功但未获取到线上地址", "api")
    return url
  }

  /** 完整流程。 */
  async run(): Promise<string> {
    await this.validateToken()
    const projectId = await this.ensureProject()
    await this.configureProject(projectId)
    await this.setEnv(projectId)
    const files = await this.fetchSource(this.version)
    return this.deploy(files, projectId)
  }
}

function describeApiError(body: unknown): string {
  if (typeof body === "object" && body && "error" in body) {
    const e = (body as { error: { message?: string } }).error
    if (e?.message) return e.message.slice(0, 200)
  }
  return "请检查输入后重试"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
