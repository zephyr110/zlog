# Zlog 桌面端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 zlog 打包为 macOS/Windows/Linux 三平台桌面应用：Electron 壳内嵌 Next.js standalone 服务器，本地 SQLite + Turso embedded replica 双向同步。

**Architecture:** Electron 主进程管理 Next.js standalone 子进程（`ELECTRON_RUN_AS_NODE=1` 复用 Electron 内嵌 Node）的生命周期；子进程是数据库唯一持有者（`file:` 本地库 + libsql `syncUrl`/`syncInterval` 原生同步）；BrowserWindow 指向 `http://127.0.0.1:<port>`。设计文档：`docs/superpowers/specs/2026-08-13-desktop-app-design.md`。

**Tech Stack:** Electron 37、electron-builder 26、Next.js 16.2.10 standalone、@libsql/client 0.17.4（embedded replica）、TypeScript、vitest、@playwright/test。

**Plan-time refinement（相对设计文档的优化）:** 核实 `@libsql/core@0.17.4` 后确认 `createClient` 原生支持 `syncUrl` + `syncInterval`（库内定时同步）。因此**周期同步由 libsql 客户端内置**（服务器进程内，仍是单一 DB 持有者），主进程不再需要周期调度器，只保留手动"立即同步"（经桌面密钥调用 `/api/sync`）。设计文档 §5.2/§3.2 的"调度在主进程"相应简化。

## Global Constraints

- Node ≥ 20，pnpm 11（workspace `packageManager` 声明）
- 提交信息一律英文；Husky pre-commit 自动跑 `pnpm check`（web 的 lint + typecheck）
- `AGENTS.md`：写任何 Next.js 代码前先读 `node_modules/next/dist/docs/` 相关指南；遵守 Next 16 弃用通告
- 严格 TS（`strict: true`）；所有新增代码过 typecheck
- 桌面端服务器只绑定 `127.0.0.1`（绝不 `0.0.0.0`）；`NEXT_TELEMETRY_DISABLED=1`
- 新依赖版本：electron `^37.2.0`、electron-builder `^26.0.12`、vitest `^3.2.4`、@playwright/test `^1.54.1`、bcryptjs `^3.0.3`（与 @zlog/auth 一致）
- 所有测试可离线运行（不依赖真实 Turso/网络）

---

### Task 1: Spike — 验证桌面构建假设（里程碑 M1）

**Files:**
- 无代码产物；命令验证；结果记录到本任务步骤（失败则停止并上报）

**Interfaces:**
- Produces: 三项假设的验证结论（后续任务依赖）：(a) Next 16 standalone 产物可运行且响应 `PORT`/`HOSTNAME`；(b) `ELECTRON_RUN_AS_NODE=1` 可用 Electron 二进制执行 Node 脚本；(c) 空 `file:` DB 可被 web 应用初始化建表

- [ ] **Step 1: 验证 standalone 构建**

Run:
```bash
cd /Users/zephyr/Code/zlog/.claude/worktrees/footer-refine
# 在 next.config.ts 临时加入 output:"standalone"（只做验证，不提交），然后：
pnpm --filter @zlog/web build 2>&1 | tail -5
ls apps/web/.next/standalone/apps/web/server.js
```
Expected: `server.js` 存在。若 Next 16 弃用 standalone 或路径变化 → **停止并上报**。
> **Spike 结论（Task 1，已记录）：** 本 monorepo 的 trace root 是 workspace 根（`turbopack.root` 所致），standalone 产物**嵌套**在 `apps/web/.next/standalone/apps/web/server.js`。全计划统一按此嵌套路径处理，不设 `outputFileTracingRoot`（避免 workspace 包追踪断裂）。`.next/static` 与 `public/*` 需显式拷入 standalone（见 Task 10）。

- [ ] **Step 2: 验证 PORT/HOSTNAME 与运行**

Run:
```bash
cd apps/web/.next/standalone
PORT=31415 HOSTNAME=127.0.0.1 node server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:31415/
kill %1
```
Expected: `200`。若端口不生效或绑定错误 → 调整计划中的端口策略。

- [ ] **Step 3: 验证 ELECTRON_RUN_AS_NODE**

Run:
```bash
npx electron -e "process.env.ELECTRON_RUN_AS_NODE"  # 不可行，正确做法：
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "console.log('node-ok')"
```
Expected: 输出 `node-ok`。若失败 → 停止并上报（server-manager 依赖此机制）。

- [ ] **Step 4: 验证空 file: DB 可建表**

Run:
```bash
cd /Users/zephyr/Code/zlog/.claude/worktrees/footer-refine
TURSO_DATABASE_URL=file:/tmp/zlog-spike.db SESSION_SECRET=spike NEXT_PUBLIC_SITE_URL=http://localhost PORT=31416 HOSTNAME=127.0.0.1 \
  node apps/web/.next/standalone/server.js &
sleep 2
curl -s -o /dev/null -w "home:%{http_code} " http://127.0.0.1:31416/
curl -s -o /dev/null -w "api:%{http_code}\n" http://127.0.0.1:31416/api/posts
kill %1
```
Expected: `home:200 api:200`（空库不报错，表按需创建）。

- [ ] **Step 5: 清理 spike 改动**

Run: 撤销 Step 1 的临时 config 改动，`git status` 确认干净。

---

### Task 2: NEXT_DESKTOP standalone 构建模式（M1）

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `package.json`（根，scripts）

**Interfaces:**
- Consumes: Task 1 结论 (a)
- Produces: `NEXT_DESKTOP=1` 时 `pnpm --filter @zlog/web build` 产出 `apps/web/.next/standalone/server.js`；根脚本 `pnpm build:desktop`

- [ ] **Step 1: 读现有配置再动手（AGENTS.md 要求）**

Run:
```bash
cd /Users/zephyr/Code/zlog/.claude/worktrees/footer-refine
cat apps/web/next.config.ts apps/web/scripts/toggle-force-static.mjs
cat node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md 2>/dev/null | head -60
```
Expected: 理解现有 `NEXT_EXPORT` 切换模式与 Next 16 `output` 文档。

- [ ] **Step 2: 修改 next.config.ts**

Edit `apps/web/next.config.ts` — 顶部新增一行，`output` 分支加入 desktop：

```ts
const isExport = process.env.NEXT_EXPORT === "true"
const isDesktop = process.env.NEXT_DESKTOP === "true"

const nextConfig: NextConfig = {
  ...(isExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
      }
    : isDesktop
      ? {
          output: "standalone" as const,
        }
      : {
          // Server/Vercel only — static export cannot emit redirects, so
          // apps/web/src/app/category/[name]/page.tsx handles that path.
          async redirects() {
```
（原有注释与 `redirects` 分支保持不动；desktop 分支的注释写：`// Desktop only — self-contained server for the Electron shell.`）

- [ ] **Step 3: 添加根脚本**

Edit 根 `package.json` scripts，加入：

```json
"build:desktop": "NEXT_DESKTOP=1 pnpm --filter @zlog/web build",
```
（本脚本仅供开发调试；最终构建由 Task 10 的 `prepare-standalone.mjs` 以 spawn env 方式驱动，避免 Windows shell 不认内联 env。）

- [ ] **Step 4: 验证**

Run:
```bash
pnpm build:desktop 2>&1 | tail -3
ls apps/web/.next/standalone/apps/web/server.js   # 嵌套路径（见 Task 1 spike 结论）
pnpm build 2>&1 | tail -3   # 回归：普通 SSR 构建不受影响
```
Expected: standalone 产物存在（嵌套路径）；普通构建仍成功。

- [ ] **Step 5: 提交**

```bash
git add apps/web/next.config.ts package.json
git commit -m "feat(web): add NEXT_DESKTOP standalone build mode"
```

---

### Task 3: @zlog/database 同步能力（syncUrl + sync.ts）（M2）

**Files:**
- Modify: `packages/database/src/db.ts`
- Create: `packages/database/src/sync.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/database/package.json`（devDeps vitest）
- Create: `packages/database/vitest.config.ts`
- Test: `packages/database/test/sync.test.ts`

**Interfaces:**
- Consumes: Task 1 结论（libsql 0.17 支持 `syncUrl`/`syncInterval`/`sync()`）
- Produces:
  - `getDb()` 在 `TURSO_SYNC_URL` 存在时附带 `syncUrl`/`syncInterval`/`readYourWrites`
  - `isSyncConfigured(): boolean`
  - `runSync(): Promise<void>`（幂等、并发互斥）
  - `scheduleSync(): void`（3s debounce，静默）
  - `getSyncStatus(): { configured, syncing, lastSyncAt, lastSyncError }`
  - index.ts 导出以上四个函数

- [ ] **Step 1: 写失败测试**

Create `packages/database/test/sync.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../src/db", () => ({
  requireDb: () => ({ sync: vi.fn().mockResolvedValue({ frame_no: 1, frames_synced: 2 }) }),
}))

import { runSync, scheduleSync, getSyncStatus, isSyncConfigured } from "../src/sync"

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
    await Promise.all([runSync(), runSync()])
    const status = getSyncStatus()
    expect(status.configured).toBe(true)
    expect(status.lastSyncAt).toBeTruthy()
    expect(status.lastSyncError).toBeNull()
  })

  it("runSync 失败记录 lastSyncError", async () => {
    process.env.TURSO_SYNC_URL = "libsql://example.turso.io"
    vi.mocked(require("./../src/db")).requireDb.mockReturnValue({
      sync: vi.fn().mockRejectedValue(new Error("boom")),
    })
    await expect(runSync()).rejects.toThrow("boom")
    expect(getSyncStatus().lastSyncError).toBe("boom")
  })

  it("scheduleSync 3 秒防抖后触发一次同步", async () => {
    process.env.TURSO_SYNC_URL = "libsql://example.turso.io"
    scheduleSync()
    scheduleSync()
    expect(getSyncStatus().lastSyncAt).toBeNull()
    await vi.advanceTimersByTimeAsync(3100)
    expect(getSyncStatus().lastSyncAt).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/database && pnpm dlx vitest run test/sync.test.ts -v`
Expected: FAIL — `Cannot find module '../src/sync'`

- [ ] **Step 3: 实现 db.ts 与 sync.ts**

Edit `packages/database/src/db.ts` 的 `getDb()`：

```ts
export function getDb(): Client | null {
  if (client) return client
  const url = process.env.TURSO_DATABASE_URL
  if (!url) return null
  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    // Desktop (embedded replica): TURSO_SYNC_URL 存在时启用双向同步；
    // syncInterval 由 libsql 客户端内置（秒），readYourWrites 保证本
    // 端写入立即可读。Web/Vercel 部署不设该变量 → 完全不受影响。
    ...(process.env.TURSO_SYNC_URL
      ? {
          syncUrl: process.env.TURSO_SYNC_URL,
          syncInterval: Number(process.env.TURSO_SYNC_INTERVAL ?? 300),
          readYourWrites: true,
        }
      : {}),
  })
  return client
}
```

Create `packages/database/src/sync.ts`：

```ts
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
```

Edit `packages/database/src/index.ts` 末尾追加导出：

```ts
export { runSync, scheduleSync, getSyncStatus, isSyncConfigured } from "./sync"
```

Edit `packages/database/package.json` devDependencies 追加：

```json
"vitest": "^3.2.4"
```

Create `packages/database/vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { environment: "node" },
})
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @zlog/database test`
Expected: 5 tests PASS（先 `pnpm install` 装 vitest）

- [ ] **Step 5: 提交**

```bash
git add packages/database
git commit -m "feat(database): add embedded-replica sync support (syncUrl + runSync)"
```

---

### Task 4: 写操作触发同步的调用点（M2）

**Files:**
- Modify: `packages/database/src/content.ts`（4 处）
- Modify: `packages/database/src/media.ts`（2 处）
- Modify: `packages/database/src/comments.ts`（4 处）
- Modify: `packages/database/src/site-settings.ts`（1 处）

**Interfaces:**
- Consumes: Task 3 的 `scheduleSync()`
- Produces: 所有语义写操作完成后触发防抖同步（Vercel 上仍为空操作）

- [ ] **Step 1: content.ts 加入调用点**

Edit `packages/database/src/content.ts`：文件顶部 import 区新增：

```ts
import { scheduleSync } from "./sync"
```

在每个语义写函数**最后一个语句之后**（return 之前）追加 `scheduleSync()`：

- `savePost`（约 L172 起）
- `deletePost`（约 L219 起）
- `movePost`（约 L232 起）
- `setPostPinned`（约 L245 起）

参考（以 `deletePost` 为例，实际插入点在函数末尾）：

```ts
export async function deletePost(slug: string): Promise<boolean> {
  // ... 现有删除逻辑 ...
  scheduleSync()
  return result
}
```

- [ ] **Step 2: media.ts 加入调用点**

同 Step 1 模式：`insertMedia`、`deleteMedia` 末尾追加 `scheduleSync()`（`setMediaSha` 是上传辅助写入，跳过）。

- [ ] **Step 3: comments.ts 加入调用点**

同 Step 1 模式：`createComment`、`createReply`、`markCommentRead`、`deleteComment` 末尾追加 `scheduleSync()`。

- [ ] **Step 4: site-settings.ts 加入调用点**

同 Step 1 模式：`upsertSiteSettings` 末尾追加 `scheduleSync()`。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @zlog/web typecheck && pnpm --filter @zlog/database test`
Expected: 通过（typecheck 覆盖 workspace 包）

```bash
git add packages/database
git commit -m "feat(database): trigger debounced sync after semantic writes"
```

---

### Task 5: /api/sync 与 /api/sync/status 路由（M2）

**Files:**
- Create: `apps/web/src/app/api/sync/route.ts`
- Create: `apps/web/src/app/api/sync/status/route.ts`

**Interfaces:**
- Consumes: Task 3 的 `runSync`/`getSyncStatus`/`isSyncConfigured`；现有 `@/lib/api-auth` 的 `requireAuth`；`process.env.ZLOG_DESKTOP_KEY`
- Produces:
  - `POST /api/sync`：admin JWT **或** `X-Zlog-Desktop-Key` 头通过鉴权；执行同步
  - `GET /api/sync/status`：公开，返回同步状态（仅同步元信息，无敏感数据）

- [ ] **Step 1: 实现 /api/sync**

Create `apps/web/src/app/api/sync/route.ts`：

```ts
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { runSync, getSyncStatus, isSyncConfigured } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"

export async function POST(request: NextRequest) {
  const user = await requireAuth(request)

  // Desktop shell 调用：本地环回地址 + 每次启动随机生成的密钥头。
  const key = process.env.ZLOG_DESKTOP_KEY
  const supplied = request.headers.get("x-zlog-desktop-key")
  const keyOk =
    !!key &&
    !!supplied &&
    supplied.length === key.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(key))

  if (!user && !keyOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!isSyncConfigured()) {
    return NextResponse.json({ error: "sync not configured" }, { status: 400 })
  }
  try {
    await runSync()
    return NextResponse.json({ ok: true, status: getSyncStatus() })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: getSyncStatus(),
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: 实现 /api/sync/status**

Create `apps/web/src/app/api/sync/status/route.ts`：

```ts
import { NextResponse } from "next/server"
import { getSyncStatus } from "@zlog/database"

export async function GET() {
  return NextResponse.json(getSyncStatus())
}
```

- [ ] **Step 3: 验证**

Run:
```bash
pnpm --filter @zlog/web typecheck
# 手工验证（本地 dev；用 3100 端口避免与既有 dev 实例冲突）：
PORT=3100 pnpm dev &
sleep 3
curl -s http://localhost:3100/api/sync/status
curl -s -X POST http://localhost:3100/api/sync -o /dev/null -w "%{http_code}\n"          # 401
curl -s -X POST -H "X-Zlog-Desktop-Key: wrong" http://localhost:3100/api/sync -o /dev/null -w "%{http_code}\n"  # 401
kill %1
```
Expected: status 返回 `{"configured":false,...}`；未鉴权 POST 返回 401。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/app/api/sync
git commit -m "feat(web): add /api/sync and /api/sync/status routes"
```

---

### Task 6: 桌面包脚手架 + 图标生成（M1）

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/scripts/gen-icons.mjs`
- Create: `apps/desktop/build/.gitkeep`
- Modify: 根 `package.json`（scripts.test）
- Modify: `pnpm-workspace.yaml`（无改动——`apps/*` 已覆盖；确认即可）

**Interfaces:**
- Produces: `@zlog/desktop` 包（可安装依赖、可 typecheck、可测）；`apps/desktop/assets/tray.png`（32×32）、`apps/desktop/build/icon.png`（512×512）由 `pnpm gen:icons` 生成

- [ ] **Step 1: 创建 package.json**

Create `apps/desktop/package.json`：

```json
{
  "name": "@zlog/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "pnpm build && electron .",
    "start": "electron .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:smoke": "playwright test",
    "package": "pnpm gen:icons && pnpm build && pnpm build:standalone && electron-builder --publish never",
    "package:dir": "pnpm gen:icons && pnpm build && pnpm build:standalone && electron-builder --dir --publish never",
    "gen:icons": "node scripts/gen-icons.mjs",
    "build:standalone": "node scripts/prepare-standalone.mjs"
  },
  "dependencies": {
    "bcryptjs": "^3.0.3"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.1",
    "@types/node": "^20",
    "electron": "^37.2.0",
    "electron-builder": "^26.0.12",
    "typescript": "^5",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

Create `apps/desktop/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "outDir": "dist",
    "rootDir": "electron",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["electron/**/*.ts"]
}
```

- [ ] **Step 3: 创建 vitest.config.ts**

Create `apps/desktop/vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { environment: "node" },
})
```

- [ ] **Step 4: 创建图标生成脚本**

Create `apps/desktop/scripts/gen-icons.mjs`（零依赖 PNG 生成，占位图标）：

```js
import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, "ascii")
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** 纯色 RGBA PNG（8-bit，filter none）。 */
function png(size, rgba) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(size * stride)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x++) {
      const o = y * stride + 1 + x * 4
      raw[o] = rgba[0]
      raw[o + 1] = rgba[1]
      raw[o + 2] = rgba[2]
      raw[o + 3] = rgba[3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

// 占位图标：深灰方块（后续设计正式图标时替换）。
const COLOR = [38, 38, 38, 255]
mkdirSync(join(root, "assets"), { recursive: true })
mkdirSync(join(root, "build"), { recursive: true })
writeFileSync(join(root, "assets/tray.png"), png(32, COLOR))
writeFileSync(join(root, "build/icon.png"), png(512, COLOR))
console.log("generated assets/tray.png + build/icon.png")
```

- [ ] **Step 5: 根 package.json 增加 test 脚本**

Edit 根 `package.json` scripts 加入：

```json
"test": "pnpm --filter @zlog/database test && pnpm --filter @zlog/desktop test",
```

- [ ] **Step 6: 安装、生成图标并验证**

Run:
```bash
pnpm install
pnpm --filter @zlog/desktop gen:icons
file apps/desktop/assets/tray.png apps/desktop/build/icon.png
pnpm --filter @zlog/desktop typecheck   # 此时 electron/ 目录还不存在，tsc 报错前先建目录：
mkdir -p apps/desktop/electron && touch apps/desktop/electron/.gitkeep
pnpm --filter @zlog/desktop typecheck
```
Expected: `PNG image data, 32 x 32` / `512 x 512`；typecheck 通过。

- [ ] **Step 7: 提交**

```bash
git add apps/desktop pnpm-lock.yaml package.json
git commit -m "chore(desktop): scaffold electron package with icon generation"
```

---

### Task 7: config-store（M1）

**Files:**
- Create: `apps/desktop/electron/config-store.ts`
- Test: `apps/desktop/test/config-store.test.ts`

**Interfaces:**
- Consumes: 无（纯 Node fs）
- Produces: `class ConfigStore { constructor(dir: string); readonly filePath: string; load(): DesktopConfig | null; save(cfg: DesktopConfig): void }`；`interface DesktopConfig { adminUsername: string; adminPasswordHash: string; sessionSecret: string; desktopKey: string; syncUrl?: string; syncToken?: string }`

- [ ] **Step 1: 写失败测试**

Create `apps/desktop/test/config-store.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigStore, type DesktopConfig } from "../electron/config-store"

function validConfig(): DesktopConfig {
  return {
    adminUsername: "admin",
    adminPasswordHash: "$2b$10$abc",
    sessionSecret: "secret",
    desktopKey: "key-123",
    syncUrl: "libsql://example.turso.io",
    syncToken: "token",
  }
}

describe("ConfigStore", () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "zlog-cfg-")) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("文件不存在时 load 返回 null", () => {
    expect(new ConfigStore(dir).load()).toBeNull()
  })

  it("save 后 load 往返一致", () => {
    const store = new ConfigStore(dir)
    store.save(validConfig())
    expect(store.load()).toEqual(validConfig())
  })

  it("损坏的 JSON 返回 null", () => {
    writeFileSync(join(dir, "zlog-config.json"), "{not json")
    expect(new ConfigStore(dir).load()).toBeNull()
  })

  it("缺关键字段视为未配置", () => {
    writeFileSync(join(dir, "zlog-config.json"), JSON.stringify({ adminUsername: "x" }))
    expect(new ConfigStore(dir).load()).toBeNull()
  })

  it("save 在 POSIX 上写 0600 权限", () => {
    if (process.platform === "win32") return
    const store = new ConfigStore(dir)
    store.save(validConfig())
    const { mode } = require("node:fs").statSync(store.filePath)
    expect(mode & 0o777).toBe(0o600)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @zlog/desktop test`
Expected: FAIL — `Cannot find module '../electron/config-store'`

- [ ] **Step 3: 实现 config-store**

Create `apps/desktop/electron/config-store.ts`：

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface DesktopConfig {
  adminUsername: string
  adminPasswordHash: string
  sessionSecret: string
  /** Desktop shell 调用 /api/sync 的共享密钥（随服务器 env 传递）。 */
  desktopKey: string
  syncUrl?: string
  syncToken?: string
}

/** 本地配置读写。路径可注入以便测试（主进程传 userData 目录）。 */
export class ConfigStore {
  constructor(private readonly dir: string) {}

  get filePath(): string {
    return join(this.dir, "zlog-config.json")
  }

  load(): DesktopConfig | null {
    if (!existsSync(this.filePath)) return null
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<DesktopConfig>
      if (!raw.adminUsername || !raw.adminPasswordHash || !raw.sessionSecret || !raw.desktopKey) {
        return null
      }
      return raw as DesktopConfig
    } catch {
      return null
    }
  }

  save(cfg: DesktopConfig): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    writeFileSync(this.filePath, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  }
}
```

- [ ] **Step 4: 修正测试中的权限断言并运行**

Edit `apps/desktop/test/config-store.test.ts` 最后一个用例替换为：

```ts
  it("save 在 POSIX 上写 0600 权限", () => {
    if (process.platform === "win32") return
    const store = new ConfigStore(dir)
    store.save(validConfig())
    const { mode } = require("node:fs").statSync(store.filePath)
    expect(mode & 0o777).toBe(0o600)
  })
```

Run: `pnpm --filter @zlog/desktop test`
Expected: 5 tests PASS

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/electron/config-store.ts apps/desktop/test
git commit -m "feat(desktop): add config store with 0600 permissions"
```

---

### Task 8: server-manager（M1 核心）

**Files:**
- Create: `apps/desktop/electron/server-manager.ts`
- Test: `apps/desktop/test/server-manager.test.ts`

**Interfaces:**
- Consumes: Task 1 结论 (b) `ELECTRON_RUN_AS_NODE=1`
- Produces:
  - `class ServerManager { constructor(serverJsPath: string, logDir: string, onExit: (code: number | null) => void, waitHealthy?: (port: number, timeoutMs: number) => Promise<void>); reservePort(): Promise<number>; start(env: Record<string, string>): Promise<void>; get url(): string; get port(): number; stop(): void }`
  - `start()` 内部：`spawn(process.execPath, [serverJsPath], { env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: "1", PORT, HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] })`，stdout/stderr 追加写 `logDir/server.log`；`waitHealthy(port, 30_000)` 轮询 `GET /` 直到 200

- [ ] **Step 1: 写失败测试**

Create `apps/desktop/test/server-manager.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const spawnMock = vi.fn()
vi.mock("node:child_process", () => ({ spawn: spawnMock }))

import { ServerManager } from "../electron/server-manager"

function fakeChild() {
  const events: Record<string, Function[]> = {}
  return {
    stdout: { on: vi.fn((ev, cb) => cb?.("stdout-data")) },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    on: (ev: string, cb: Function) => { events[ev] = [...(events[ev] || []), cb] },
    emit: (ev: string, ...args: unknown[]) => (events[ev] || []).forEach((cb) => cb(...args)),
  }
}

describe("ServerManager", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "zlog-srv-"))
    spawnMock.mockReset()
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("start 以 ELECTRON_RUN_AS_NODE 拉起服务器并绑定 127.0.0.1", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const onExit = vi.fn()
    const mgr = new ServerManager("/fake/server.js", dir, onExit)
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [bin, args, opts] = spawnMock.mock.calls[0]
    expect(bin).toBe(process.execPath)
    expect(args).toEqual(["/fake/server.js"])
    expect(opts.env.ELECTRON_RUN_AS_NODE).toBe("1")
    expect(opts.env.HOSTNAME).toBe("127.0.0.1")
    expect(Number(opts.env.PORT)).toBeGreaterThan(0)
    expect(mgr.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it("服务器退出触发 onExit 回调", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const onExit = vi.fn()
    const mgr = new ServerManager("/fake/server.js", dir, onExit)
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    child.emit("exit", 1)
    expect(onExit).toHaveBeenCalledWith(1)
  })

  it("stop 终止子进程", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const mgr = new ServerManager("/fake/server.js", dir, vi.fn(), async () => {})
    await mgr.start({ TURSO_DATABASE_URL: "file:test.db", SESSION_SECRET: "s" })
    mgr.stop()
    expect(child.kill).toHaveBeenCalled()
  })
})
```

注意：`start()` 中 `waitHealthy` 会真实 fetch——测试通过构造函数第 4 参注入 `async () => {}` 跳过健康检查（接口已声明该参数）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @zlog/desktop test`
Expected: FAIL — `Cannot find module '../electron/server-manager'`

- [ ] **Step 3: 实现 server-manager**

Create `apps/desktop/electron/server-manager.ts`：

```ts
import { spawn, type ChildProcess } from "node:child_process"
import { createWriteStream, mkdirSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "node:net"

/** 管理 Next standalone 服务器子进程（数据库唯一持有者）。 */
export class ServerManager {
  private child: ChildProcess | null = null
  private currentPort = 0
  private logStream: ReturnType<typeof createWriteStream> | null = null

  constructor(
    private readonly serverJsPath: string,
    private readonly logDir: string,
    private readonly onExit: (code: number | null) => void,
    /** 测试注入点：健康检查函数。 */
    private readonly waitHealthy: (port: number, timeoutMs: number) => Promise<void> = waitHealthyDefault
  ) {}

  /** 探测一个空闲端口（释放后交给子进程使用；竞态窗口可接受）。 */
  async reservePort(): Promise<number> {
    const srv = createServer()
    await new Promise<void>((resolve, reject) => {
      srv.once("error", reject)
      srv.listen(0, "127.0.0.1", () => resolve())
    })
    const addr = srv.address()
    const port = typeof addr === "object" && addr ? addr.port : 0
    await new Promise<void>((resolve) => srv.close(() => resolve()))
    return port
  }

  async start(env: Record<string, string>): Promise<void> {
    this.currentPort = await this.reservePort()
    mkdirSync(this.logDir, { recursive: true })
    this.logStream = createWriteStream(join(this.logDir, "server.log"), { flags: "a" })
    this.child = spawn(process.execPath, [this.serverJsPath], {
      env: {
        ...process.env,
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(this.currentPort),
        HOSTNAME: "127.0.0.1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.child.stdout?.on("data", (d: Buffer) => this.logStream?.write(d))
    this.child.stderr?.on("data", (d: Buffer) => this.logStream?.write(d))
    this.child.on("exit", (code) => {
      this.child = null
      this.onExit(code)
    })
    await this.waitHealthy(this.currentPort, 30_000)
  }

  get url(): string {
    return `http://127.0.0.1:${this.currentPort}`
  }

  get port(): number {
    return this.currentPort
  }

  stop(): void {
    if (this.child) {
      this.child.kill()
      this.child = null
    }
    this.logStream?.end()
    this.logStream = null
  }
}

async function waitHealthyDefault(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) return
    } catch {
      // 未就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`server did not become healthy within ${timeoutMs}ms`)
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @zlog/desktop test`
Expected: 3 tests PASS

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/electron/server-manager.ts apps/desktop/test/server-manager.test.ts
git commit -m "feat(desktop): add standalone server process manager"
```

---

### Task 9: 主进程 + 首启/设置窗口 + 托盘（M1/M2）

**Files:**
- Create: `apps/desktop/electron/preload.ts`
- Create: `apps/desktop/electron/main.ts`
- Create: `apps/desktop/electron/tray.ts`
- Create: `apps/desktop/renderer/settings.html`
- Create: `apps/desktop/renderer/settings.js`
- Create: `apps/desktop/test/main-flow.test.ts`（config→env 组装逻辑测试）

**Interfaces:**
- Consumes: `ConfigStore`/`DesktopConfig`（Task 7）、`ServerManager`（Task 8）
- Produces:
  - preload 暴露 `window.zlog`: `loadConfig()/saveConfig(cfg)/runSyncNow()/getSyncStatus()/openDataDir()/quit()`
  - `main.ts`：单例锁、`ZLOG_USER_DATA_DIR` 覆盖、首启向导（`settings.html?mode=firstrun`）、`startApp(cfg)` 组装服务器 env、设置窗口、托盘、退出清理
  - IPC: `config:load`、`config:save`、`sync:now`、`sync:status`、`app:openDataDir`、`app:quit`
  - 服务器 env 组装（test 覆盖）：`TURSO_DATABASE_URL=file:<userData>/zlog.db`、`TURSO_SYNC_URL`/`TURSO_AUTH_TOKEN`（有则传）、`SESSION_SECRET`、`ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`、`ZLOG_DESKTOP_KEY`

- [ ] **Step 1: 实现 server-env（纯函数）与 preload**

Create `apps/desktop/electron/server-env.ts`：

```ts
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
```

Create `apps/desktop/electron/preload.ts`：

```ts
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("zlog", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke("config:save", cfg),
  runSyncNow: () => ipcRenderer.invoke("sync:now"),
  getSyncStatus: () => ipcRenderer.invoke("sync:status"),
  openDataDir: () => ipcRenderer.invoke("app:openDataDir"),
  quit: () => ipcRenderer.invoke("app:quit"),
})
```

- [ ] **Step 2: 实现 main.ts**

Create `apps/desktop/electron/main.ts`：

```ts
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { join } from "node:path"
import { ConfigStore, type DesktopConfig } from "./config-store"
import { ServerManager } from "./server-manager"
import { buildServerEnv } from "./server-env"
import { createTray, updateTraySyncStatus, type TrayActions } from "./tray"

// 测试与 CI：可覆盖 userData 目录（Playwright 冒烟测试使用）。
if (process.env.ZLOG_USER_DATA_DIR) {
  app.setPath("userData", process.env.ZLOG_USER_DATA_DIR)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  main().catch((err) => {
    dialog.showErrorBox("Zlog 启动失败", String(err))
    app.exit(1)
  })
}

async function main() {
  const configStore = new ConfigStore(app.getPath("userData"))
  const dbPath = join(app.getPath("userData"), "zlog.db")
  // standalone 产物嵌套路径（Task 1 spike 结论）：trace root 为 workspace 根
  const serverJsPath = app.isPackaged
    ? join(process.resourcesPath, "standalone", "apps", "web", "server.js")
    : join(app.getAppPath(), "..", "..", "web", ".next", "standalone", "apps", "web", "server.js")

  let server: ServerManager | null = null
  let mainWindow: BrowserWindow | null = null
  let firstRunWindow: BrowserWindow | null = null
  let config: DesktopConfig | null = configStore.load()
  const logDir = join(app.getPath("userData"), "logs")

  const tray = createTray({
    onOpen: () => showMainWindow(),
    onSettings: () => openSettingsWindow(),
    onSyncNow: () => void requestSyncNow(),
    onQuit: () => app.quit(),
  })

  // 崩溃处理：自动重启一次（spec §6），再次崩溃只弹窗提示，不循环。
  let crashRestarts = 0
  const onServerExit = (code: number | null) => {
    updateTraySyncStatus(tray, "server-exited")
    if ((app as unknown as { isQuitting?: boolean }).isQuitting) return
    if (config && crashRestarts < 1) {
      crashRestarts++
      void startServerAndShow(config).catch((err) => {
        dialog.showErrorBox(
          "Zlog 博客服务重启失败",
          `本地博客服务已退出并尝试重启，但重启失败（code ${code}）：${String(err)}。\n数据目录：${app.getPath("userData")}\n日志：${join(logDir, "server.log")}`
        )
      })
      return
    }
    dialog.showErrorBox(
      "Zlog 博客服务异常退出",
      `本地博客服务已退出（code ${code}）。\n数据目录：${app.getPath("userData")}\n日志：${join(logDir, "server.log")}`
    )
  }

  const serverManager = new ServerManager(serverJsPath, logDir, onServerExit)

  async function startServerAndShow(cfg: DesktopConfig) {
    await serverManager.start(buildServerEnv(cfg, dbPath))
    server = serverManager
    showMainWindow()
  }

  function showMainWindow() {
    if (!serverManager.url) return
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Zlog",
        autoHideMenuBar: true,
        webPreferences: { preload: join(__dirname, "preload.js") },
      })
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http")) void shell.openExternal(url)
        return { action: "deny" }
      })
      mainWindow.on("closed", () => { mainWindow = null })
    }
    void mainWindow.loadURL(serverManager.url)
    mainWindow.focus()
  }

  function openSettingsWindow() {
    const win = new BrowserWindow({
      width: 560,
      height: 640,
      title: "Zlog 设置",
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.js") },
    })
    void win.loadFile(join(app.getAppPath(), "renderer", "settings.html"), {
      query: { mode: "settings" },
    })
  }

  async function requestSyncNow(): Promise<void> {
    if (!serverManager.url) return
    try {
      const res = await fetch(`${serverManager.url}/api/sync`, {
        method: "POST",
        headers: { "X-Zlog-Desktop-Key": config?.desktopKey ?? "" },
      })
      const body = (await res.json()) as { status?: unknown }
      updateTraySyncStatus(tray, res.ok ? "synced" : "error")
      return body.status as Promise<unknown> as unknown as void
    } catch {
      updateTraySyncStatus(tray, "error")
    }
  }

  async function getSyncStatus(): Promise<unknown> {
    if (!serverManager.url) return { configured: false }
    try {
      const res = await fetch(`${serverManager.url}/api/sync/status`)
      return await res.json()
    } catch {
      return { configured: false, error: "server-down" }
    }
  }

  // ── IPC ──
  ipcMain.handle("config:load", () => configStore.load())
  ipcMain.handle("config:save", async (_e, cfg: Partial<DesktopConfig>) => {
    if (!config) {
      // 首启：组装完整配置
      const passwordHash = bcrypt.hashSync(String(cfg.adminPasswordHash ?? ""), 10)
      config = {
        adminUsername: String(cfg.adminUsername ?? "admin"),
        adminPasswordHash: passwordHash,
        sessionSecret: randomBytes(32).toString("hex"),
        desktopKey: randomBytes(32).toString("hex"),
        syncUrl: cfg.syncUrl?.trim() || undefined,
        syncToken: cfg.syncToken?.trim() || undefined,
      }
    } else {
      config = { ...config, ...cfg }
    }
    configStore.save(config)
    // 配置变更（同步信息）后重启服务器使 env 生效
    if (server) {
      server.stop()
      await startServerAndShow(config)
    } else {
      await startServerAndShow(config)
    }
    firstRunWindow?.close()
    firstRunWindow = null
    return { ok: true }
  })
  ipcMain.handle("sync:now", () => requestSyncNow())
  ipcMain.handle("sync:status", () => getSyncStatus())
  ipcMain.handle("app:openDataDir", () => {
    void shell.openPath(app.getPath("userData"))
  })
  ipcMain.handle("app:quit", () => app.quit())

  // ── 首启向导 ──
  if (!config) {
    firstRunWindow = new BrowserWindow({
      width: 560,
      height: 680,
      title: "Zlog 首次设置",
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.js") },
    })
    void firstRunWindow.loadFile(join(app.getAppPath(), "renderer", "settings.html"), {
      query: { mode: "firstrun" },
    })
  } else {
    await startServerAndShow(config)
  }

  app.on("second-instance", () => showMainWindow())

  app.on("will-quit", () => {
    ;(app as unknown as { isQuitting: boolean }).isQuitting = true
    serverManager.stop()
  })

  // 同步状态轮询（30s，仅供托盘 tooltip）
  setInterval(() => {
    void getSyncStatus().then((s) => updateTraySyncStatus(tray, "idle", s))
  }, 30_000)
}
```

- [ ] **Step 3: 实现 tray**

Create `apps/desktop/electron/tray.ts`：

```ts
import { Tray, Menu, nativeImage } from "electron"
import { join } from "node:path"

export interface TrayActions {
  onOpen: () => void
  onSettings: () => void
  onSyncNow: () => void
  onQuit: () => void
}

export function createTray(actions: TrayActions): Tray {
  const icon = nativeImage
    .createFromPath(join(__dirname, "..", "assets", "tray.png"))
    .resize({ width: 16, height: 16 })
  const tray = new Tray(icon)
  tray.setToolTip("Zlog")
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开博客", click: actions.onOpen },
      { label: "设置", click: actions.onSettings },
      { label: "立即同步", click: actions.onSyncNow },
      { type: "separator" },
      { label: "退出", click: actions.onQuit },
    ])
  )
  return tray
}

export function updateTraySyncStatus(tray: Tray, state: string, detail?: unknown): void {
  const suffix = state === "synced" ? "✓ 已同步" : state === "error" ? "⚠ 同步异常" : ""
  tray.setToolTip(`Zlog${suffix}`)
  void detail
}
```

- [ ] **Step 4: 实现设置/首启页面**

Create `apps/desktop/renderer/settings.html`：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Zlog</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font: 14px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px; max-width: 480px;
      background: Canvas; color: CanvasText;
    }
    h1 { font-size: 18px; margin: 0 0 16px; }
    label { display: block; margin: 12px 0 4px; font-weight: 600; }
    input {
      width: 100%; box-sizing: border-box; padding: 8px 10px;
      border: 1px solid GrayText; border-radius: 6px;
      background: Canvas; color: CanvasText; font: inherit;
    }
    .hint { color: GrayText; font-size: 12px; margin-top: 2px; }
    button {
      margin-top: 18px; padding: 9px 18px; border: none; border-radius: 6px;
      background: -apple-system-controlAccent; background: AccentColor;
      color: Canvas; font: inherit; font-weight: 600; cursor: pointer;
    }
    button.secondary { background: transparent; border: 1px solid GrayText; color: CanvasText; }
    .status { margin-top: 16px; font-size: 12px; color: GrayText; white-space: pre-line; }
    .row { display: flex; gap: 8px; }
    .row button { flex: 1; }
    #passwordFields { border-top: 1px dashed GrayText; margin-top: 16px; padding-top: 8px; }
  </style>
</head>
<body>
  <h1 id="title">Zlog 首次设置</h1>
  <p class="hint" id="subtitle">
    创建管理员账号；同步可稍后在"设置"中补充（可选）。
  </p>

  <div id="passwordFields">
    <label for="username">管理员用户名</label>
    <input id="username" autocomplete="username" placeholder="admin" />
    <label for="password">密码</label>
    <input id="password" type="password" autocomplete="new-password" />
    <label for="password2">确认密码</label>
    <input id="password2" type="password" autocomplete="new-password" />
  </div>

  <label for="syncUrl">同步数据库 URL（可选）</label>
  <input id="syncUrl" placeholder="libsql://your-db.turso.io" />
  <p class="hint">从 Turso 控制台复制。不填则纯本地运行，之后可补。</p>
  <label for="syncToken">同步 Token（可选）</label>
  <input id="syncToken" type="password" placeholder="eyJ..." />

  <div class="status" id="status"></div>

  <div class="row">
    <button id="saveBtn">保存</button>
    <button id="syncBtn" class="secondary">立即同步</button>
    <button id="openBtn" class="secondary">打开数据目录</button>
  </div>

  <script src="./settings.js"></script>
</body>
</html>
```

Create `apps/desktop/renderer/settings.js`：

```js
const zlog = window.zlog
const mode = new URLSearchParams(location.search).get("mode") || "settings"
const isFirstRun = mode === "firstrun"

document.title = isFirstRun ? "Zlog 首次设置" : "Zlog 设置"
document.getElementById("title").textContent = isFirstRun ? "Zlog 首次设置" : "Zlog 设置"
document.getElementById("subtitle").textContent = isFirstRun
  ? "创建管理员账号；同步可稍后在设置中补充（可选）。"
  : "同步数据库 URL 与 Token 为空时不启用同步。"
if (!isFirstRun) document.getElementById("passwordFields").style.display = "none"

const statusEl = document.getElementById("status")
function renderStatus(s) {
  if (!s) return
  const lines = [
    `同步：${s.configured ? "已配置" : "未配置"}${s.syncing ? "（同步中…）" : ""}`,
    s.lastSyncAt ? `上次同步：${new Date(s.lastSyncAt).toLocaleString()}` : "尚未同步",
    s.lastSyncError ? `最近错误：${s.lastSyncError}` : "",
  ]
  statusEl.textContent = lines.filter(Boolean).join("\n")
}

async function refreshStatus() {
  renderStatus(await zlog.getSyncStatus())
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const cfg = {
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value,
    password2: document.getElementById("password2").value,
    syncUrl: document.getElementById("syncUrl").value.trim(),
    syncToken: document.getElementById("syncToken").value.trim(),
  }
  if (isFirstRun && (!cfg.username || cfg.password !== cfg.password2 || cfg.password.length < 6)) {
    statusEl.textContent = "请填写用户名，且两次密码一致并至少 6 位。"
    return
  }
  statusEl.textContent = "保存中…"
  const res = await zlog.saveConfig(cfg)
  if (res && res.ok) {
    statusEl.textContent = "已保存，博客即将打开。"
    if (!isFirstRun) refreshStatus()
  } else {
    statusEl.textContent = "保存失败，请重试。"
  }
})

document.getElementById("syncBtn").addEventListener("click", async () => {
  await zlog.runSyncNow()
  refreshStatus()
})

document.getElementById("openBtn").addEventListener("click", () => zlog.openDataDir())
refreshStatus()
```

注意：preload 的 `config:save` 收到的是 `{username, password, syncUrl, syncToken}` 结构，与 Task 7 的 `DesktopConfig` 不同——main.ts 中 `config:save` handler 首启分支只使用 `adminUsername`/`adminPasswordHash` 字段，因此 **main.ts 的 handler 需要按此页面契约取值**：把 Step 2 中首启分支改为读取 `cfg.username`/`cfg.password`：

Edit（Step 2 之后修正）`apps/desktop/electron/main.ts` 的 `config:save` handler：

```ts
  ipcMain.handle("config:save", async (_e, cfg: { username?: string; password?: string; syncUrl?: string; syncToken?: string }) => {
    if (!config) {
      const passwordHash = bcrypt.hashSync(String(cfg.password ?? ""), 10)
      config = {
        adminUsername: String(cfg.username || "admin"),
        adminPasswordHash: passwordHash,
        sessionSecret: randomBytes(32).toString("hex"),
        desktopKey: randomBytes(32).toString("hex"),
        syncUrl: cfg.syncUrl?.trim() || undefined,
        syncToken: cfg.syncToken?.trim() || undefined,
      }
    } else {
      config = { ...config, syncUrl: cfg.syncUrl?.trim() || undefined, syncToken: cfg.syncToken?.trim() || undefined }
    }
    configStore.save(config)
    if (server) {
      server.stop()
      await startServerAndShow(config)
    } else {
      await startServerAndShow(config)
    }
    firstRunWindow?.close()
    firstRunWindow = null
    return { ok: true }
  })
```

- [ ] **Step 5: 服务器 env 组装逻辑测试**

Create `apps/desktop/test/server-env.test.ts`（对应 Step 1 的纯函数）：

```ts
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
```

- [ ] **Step 6: 验证与提交**

Run: `pnpm --filter @zlog/desktop typecheck && pnpm --filter @zlog/desktop test`
Expected: 全部通过（typecheck 会报 main.ts 中 `updateTraySyncStatus(tray, "server-exited")` 等——检查签名匹配；`app.isQuitting` 类型不存在则按代码中 `(app as unknown as { isQuitting: boolean })` 方式处理）

```bash
git add apps/desktop/electron apps/desktop/renderer apps/desktop/test
git commit -m "feat(desktop): main process, first-run wizard, settings window and tray"
```

---

### Task 10: 打包配置（M3）

**Files:**
- Create: `apps/desktop/scripts/prepare-standalone.mjs`
- Create: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/package.json`（files/extraResources 在 yml 中）

**Interfaces:**
- Consumes: Task 2（NEXT_DESKTOP 构建）、Task 9（dist/main.js）
- Produces: `pnpm --filter @zlog/desktop package` → `apps/desktop/release/*`（mac dmg/zip、win nsis、linux AppImage/deb）

- [ ] **Step 1: 实现 prepare-standalone 脚本**

Create `apps/desktop/scripts/prepare-standalone.mjs`：

```js
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const desktopDir = join(here, "..")
const repoRoot = join(desktopDir, "..", "..")
const webDir = join(repoRoot, "apps", "web")
// 嵌套路径（Task 1 spike 结论）：trace root 为 workspace 根
const standaloneAppDir = join(webDir, ".next", "standalone", "apps", "web")

// 1) 以 NEXT_DESKTOP=1 构建 web（spawn env 方式，跨平台安全）
const res = spawnSync("pnpm", ["--filter", "@zlog/web", "build"], {
  cwd: repoRoot,
  env: { ...process.env, NEXT_DESKTOP: "1" },
  stdio: "inherit",
})
if (res.status !== 0) process.exit(res.status ?? 1)

// 2) 按 standalone 契约补齐 .next/static 与 public（拷入嵌套的 app 目录）
cpSync(join(webDir, ".next", "static"), join(standaloneAppDir, ".next", "static"), {
  recursive: true,
})
if (existsSync(join(webDir, "public"))) {
  cpSync(join(webDir, "public"), join(standaloneAppDir, "public"), { recursive: true })
}

// 3) 确认 server.js 存在
if (!existsSync(join(standaloneAppDir, "server.js"))) {
  console.error("standalone server.js missing — build failed?")
  process.exit(1)
}
console.log("standalone ready:", standaloneAppDir)
```

- [ ] **Step 2: 实现 electron-builder 配置**

Create `apps/desktop/electron-builder.yml`：

```yaml
appId: com.zephyr110.zlog
productName: Zlog
directories:
  output: release
  buildResources: build
files:
  - dist/**/*.js
  - renderer/**/*
  - assets/tray.png
extraResources:
  - from: ../web/.next/standalone
    to: standalone
    filter:
      - "**/*"
mac:
  category: public.app-category.weblog
  target:
    - dmg
    - zip
win:
  target:
    - nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
linux:
  target:
    - AppImage
    - deb
  category: Network
  maintainer: zephyr110
npmRebuild: false
```

- [ ] **Step 3: 本机验证打包（macOS）**

Run:
```bash
pnpm --filter @zlog/desktop package:dir   # 免安装目录产物，最快验证
ls apps/desktop/release/mac*/Zlog.app/Contents/Resources/standalone/apps/web/server.js
ls apps/desktop/release/mac*/Zlog.app/Contents/Resources/app/dist/main.js
```
Expected: 两个路径都存在（standalone 与 electron 主进程均已入包；standalone 为嵌套路径，见 Task 1 spike 结论）。

- [ ] **Step 4: 启动打包产物验证**

Run:
```bash
apps/desktop/release/mac*/Zlog.app/Contents/MacOS/Zlog &
sleep 12
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:$(lsof -nP -iTCP -sTCP:LISTEN | grep Zlog | grep -oE ':[0-9]+' | head -1 | tr -d ':')/
kill %1
```
Expected: `200`（若端口探测困难，可接受人工打开 App 目测首页）。首次启动会出现首启向导窗口——正常。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/scripts apps/desktop/electron-builder.yml
git commit -m "build(desktop): package config with electron-builder + standalone prep"
```

---

### Task 11: Playwright 冒烟测试（M4）

**Files:**
- Create: `apps/desktop/playwright.config.ts`
- Create: `apps/desktop/tests/smoke.spec.ts`
- Modify: `apps/desktop/package.json`（test:smoke 已有）

**Interfaces:**
- Consumes: Task 9 的 `ZLOG_USER_DATA_DIR` 覆盖、Task 10 的 standalone 构建
- Produces: `pnpm --filter @zlog/desktop test:smoke`（xvfb 下跑通完整冒烟）

- [ ] **Step 1: 写冒烟测试**

Create `apps/desktop/playwright.config.ts`：

```ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  workers: 1,
  retries: 0,
})
```

Create `apps/desktop/tests/smoke.spec.ts`：

```ts
import { test, expect, _electron as electron } from "@playwright/test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import bcrypt from "bcryptjs"

test("app boots, serves the blog, admin login works", async () => {
  const userData = mkdtempSync(join(tmpdir(), "zlog-e2e-"))
  // 预置配置 → 跳过首启向导
  writeFileSync(
    join(userData, "zlog-config.json"),
    JSON.stringify({
      adminUsername: "admin",
      adminPasswordHash: bcrypt.hashSync("testpass", 10),
      sessionSecret: "e2e-secret",
      desktopKey: "e2e-key",
    })
  )

  const app = await electron.launch({
    args: [join(__dirname, "..", "dist", "main.js")],
    env: { ...process.env, ZLOG_USER_DATA_DIR: userData },
  })

  try {
    const win = await app.firstWindow()
    await win.waitForLoadState("domcontentloaded")
    const url = win.url()
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    const base = url.replace(/\/$/, "")

    // 博客首页可渲染
    await win.goto(`${base}/`)
    await expect(win.locator("body")).toBeVisible()

    // admin 登录
    await win.goto(`${base}/admin/login`)
    await win.getByLabel("用户名").or(win.getByPlaceholder(/用户名|Username/i)).first().fill("admin")
    await win.getByLabel("密码").or(win.getByPlaceholder(/密码|Password/i)).first().fill("testpass")
    await win.getByRole("button", { name: /登录|Sign in/i }).click()
    await win.waitForURL(/\/admin\/dashboard/, { timeout: 15_000 })

    // 建一篇文章并发布
    await win.goto(`${base}/admin/new`)
    await win.getByLabel(/标题|Title/i).fill("E2E Smoke Post")
    await win.getByRole("button", { name: /发布|Publish/i }).click()
    await expect(win.getByText(/E2E Smoke Post/).first()).toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: 准备运行**

Run:
```bash
cd /Users/zephyr/Code/zlog/.claude/worktrees/footer-refine/apps/desktop
pnpm build            # 编译 electron TS
pnpm build:standalone # 构建 standalone（NEXT_DESKTOP）
pnpm exec playwright install chromium 2>/dev/null || true
```
Expected: dist/main.js 与 web/.next/standalone/server.js 均存在。

- [ ] **Step 3: 运行冒烟（Linux CI 用 xvfb-run 前缀）**

Run: `pnpm --filter @zlog/desktop test:smoke`
Expected: PASS。若 UI 文案选择器不稳，改用更宽松的匹配（如 `page.getByRole('textbox').first()`）。**若本地 macOS 直接可跑则无需 xvfb**；CI 里用 `xvfb-run -a`。

- [ ] **Step 4: 提交**

```bash
git add apps/desktop/playwright.config.ts apps/desktop/tests
git commit -m "test(desktop): add playwright smoke test for boot, serve and admin flow"
```

---

### Task 12: GitHub Actions 三平台构建 + 发布（M3）

**Files:**
- Create: `.github/workflows/desktop.yml`

**Interfaces:**
- Consumes: Task 10（package 脚本）、Task 11（冒烟）
- Produces: tag `desktop-v*` 推送 → 三平台产物附加到 GitHub Release；`workflow_dispatch` 可手动触发

- [ ] **Step 1: 实现 workflow**

Create `.github/workflows/desktop.yml`：

```yaml
name: desktop

on:
  push:
    tags:
      - "desktop-v*"
  workflow_dispatch: {}

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @zlog/web check
      - run: pnpm --filter @zlog/desktop test
      - run: pnpm --filter @zlog/desktop build
      - run: pnpm --filter @zlog/desktop build:standalone
      - run: xvfb-run -a pnpm --filter @zlog/desktop test:smoke

  build:
    needs: smoke
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @zlog/desktop package
      - uses: actions/upload-artifact@v4
        with:
          name: zlog-desktop-${{ matrix.os }}
          path: apps/desktop/release/*
          if-no-files-found: error

  release:
    needs: build
    if: startsWith(github.ref, 'refs/tags/desktop-v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: zlog-desktop-*
          merge-multiple: true
          path: artifacts
      - uses: softprops/action-gh-release@v2
        with:
          files: artifacts/**/*
          draft: true
```

- [ ] **Step 2: 验证语法与冒烟作业**

Run:
```bash
git add .github/workflows/desktop.yml
git commit -m "ci(desktop): three-platform build matrix and release workflow"
# 推送后触发 workflow_dispatch 验证（或等 tag）：
git push
gh workflow run desktop.yml
gh run watch
```
Expected: smoke 作业通过；build 三平台产物生成（首次运行注意 electron-builder 下载各平台依赖时间较长）。

- [ ] **Step 3: 冒烟通过后合并前的最终验证**

Run:
```bash
git push origin feat/desktop-app
gh pr create --draft --title "feat(desktop): electron app with embedded-replica sync" --body "实现计划 Task 1-12 完成"
```
Expected: PR 建立，CI 绿。

---

### Task 13: 文档与收尾（M4）

**Files:**
- Modify: `README.md`（桌面端章节）
- Modify: `README.zh-CN.md`
- Create: `RELEASE_NOTES.md`（首版）

**Interfaces:**
- Consumes: 全部任务产物
- Produces: 使用文档 + 免签名安装注意事项

- [ ] **Step 1: README 增加桌面端章节（英文版）**

Edit `README.md`，在 Deployment 章节后新增：

```markdown
## Desktop App (macOS / Windows / Linux)

Run the whole blog — reading and writing — as a desktop application. The
app bundles a local standalone server and a local SQLite database; when a
sync URL is configured it keeps the local copy in two-way sync with your
Turso database (offline writes sync back when you are online).

- Build: `pnpm --filter @zlog/desktop package` (per platform)
- Dev: `pnpm --filter @zlog/desktop build:standalone && pnpm --filter @zlog/desktop dev`
- First launch: create your admin account; optionally paste your Turso
  database URL + token in the wizard to enable sync.
- Data & logs: user data directory (`zlog.db`, `zlog-config.json`,
  `logs/`). Back up the directory to back up the blog.

> Unsigned builds: macOS Gatekeeper and Windows SmartScreen will warn —
> right-click → Open on macOS, "More info → Run anyway" on Windows.

Design spec: `docs/superpowers/specs/2026-08-13-desktop-app-design.md`
```

- [ ] **Step 2: README.zh-CN.md 同步中文版**

Edit `README.zh-CN.md`，镜像上节内容（中文）。

- [ ] **Step 3: 发布说明**

Create `RELEASE_NOTES.md`：

```markdown
# Zlog Desktop — Release Notes

## desktop-v0.1.0

First desktop release (unsigned).

- Full blog + admin CMS on your machine; local SQLite with optional
  two-way sync to Turso (embedded replica).
- Platforms: macOS (dmg/zip), Windows (nsis), Linux (AppImage/deb).
- Known limitations: sync is row-level last-write-wins; edit the same
  post from only one end at a time. Media uploads without a GitHub token
  stay database-only (no jsdelivr CDN copy).
```

- [ ] **Step 4: 验证与提交**

Run: `pnpm check && pnpm test`
Expected: 全绿。

```bash
git add README.md README.zh-CN.md RELEASE_NOTES.md
git commit -m "docs: desktop app usage, release notes and sync caveats"
```

---

## 验收清单（全部任务完成后）

- [ ] `pnpm --filter @zlog/desktop test` 与 `pnpm --filter @zlog/database test` 全绿
- [ ] macOS `pnpm --filter @zlog/desktop package:dir` 产物可启动、首页 200
- [ ] 首次启动向导 → 创建管理员 → 博客打开 → admin 登录成功
- [ ] 配置 syncUrl/token 后：本地写文章 → Turso 云端可见；云端写 → 本地 `POST /api/sync` 后可见（手动集成验证，需真实 Turso）
- [ ] 三平台 workflow（desktop.yml）绿，tag 触发 Release 草稿含全部产物
- [ ] `RELEASE_NOTES.md` 覆盖免签名安装提示与 LWW 限制说明
