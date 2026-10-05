# 项目展示模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台新增「项目」模块（总开关 + 项目 CRUD + 上架开关 + 上移/下移排序），前台 `/projects` 以封面卡片网格展示；总开关关闭时前台导航无入口、页面不产出（404）。

**Architecture:** 数据层 = `site_settings` 加一列总开关（沿用 comment_enabled 范式）+ 新 `projects` 表（照 posts/media 的显式列 + 幂等迁移范式）。后台 = 新 `/admin/projects` 页（client）+ 三个 requireAuth API。前台 = server component 页（读 DB，开关关则 `notFound()`）+ 客户端导航三处条件入口。封面图复用 media-picker（产出 jsdelivr CDN URL，静态站可用）。Spec: `docs/superpowers/specs/2026-10-04-projects-showcase-design.md`。

**Tech Stack:** Next 16 App Router（静态导出安全）、React 19、Base UI（Switch/Dialog）、Tailwind v4（`data-checked:` 变体）、sonner、zod、Turso/libsql、vitest（web 用 `@/` → src 别名；database 用真实 `file:` 库）。

**Working agreements（仓库规则，优先于默认行为）:**
- 所有命令的工作目录：`cd /Users/zephyr/Code/zlog`。
- 绝不使用 `--no-verify`；pre-commit 钩子（lint + typecheck + 全量测试）必须正常通过。
- commit message 永远不加 `Co-Authored-By` 行。
- **不推 main**——推送需要用户明确授权（本计划不包含推送步骤）。
- 公开站是静态导出：本项目新增的一切前台能力不得依赖 route handler。
- API 路由文件**不要**手写 `export const dynamic = "force-static"`（`scripts/toggle-force-static.mjs` 在 export 时自动加；`[id]` 动态段路由会被该脚本自动 stash，无需处理）。
- 临时文件（验证脚本/截图）放 `$CLAUDE_JOB_DIR/tmp`，不提交。

---

## File structure

| Path | Responsibility |
|------|----------------|
| `packages/database/src/projects.ts` (new) | projects 表 schema + 行转换 + CRUD + move（唯一 SQL 出处） |
| `packages/database/src/index.ts` (modify) | 导出 projects 模块与类型 |
| `packages/database/src/site-settings.ts` (modify) | `projects_enabled` 列 + 迁移 + upsert |
| `packages/database/test/projects.test.ts` (new) | 真实 `file:` 库全链路测试（create/list/move/容错） |
| `packages/database/test/site-settings-defaults.test.ts` (modify) | 加 `projects_enabled` 默认关闭断言 |
| `apps/web/src/lib/site-config.ts` (modify) | `SiteConfig.projectsEnabled` + 默认 false |
| `apps/web/src/lib/get-site-config.ts` (modify) | 行→config、缓存载荷、DTO 携带新字段 |
| `apps/web/src/components/layout/site-config-provider.tsx` (modify) | `refreshSiteConfig` 合并新字段 |
| `apps/web/src/lib/url-validation.ts` (new) | `optionalHttpUrl`（自 site-settings route 提取） |
| `apps/web/test/url-validation.test.ts` (new) | 校验规则回归 |
| `apps/web/src/app/api/site-settings/route.ts` (modify) | zod + dbPatch + 首存默认值加 `projectsEnabled` |
| `apps/web/src/app/api/admin/projects/route.ts` (new) | GET 列表 / POST 新建 |
| `apps/web/src/app/api/admin/projects/[id]/route.ts` (new) | PUT 编辑 / DELETE 删除 |
| `apps/web/src/app/api/admin/projects/[id]/move/route.ts` (new) | POST 上移/下移 |
| `apps/web/src/components/ui/switch.tsx` (new) | Base UI Switch 包装（项目首个 True Switch） |
| `apps/web/src/components/admin/open-url-button.tsx` (new) | `externalHref` + `OpenUrlButton`（自 site-info-form 提取共用） |
| `apps/web/src/components/admin/site-info-form.tsx` (modify) | 改引上述提取件 |
| `apps/web/src/components/admin/admin-sidebar.tsx` (modify) | 侧边栏「项目」入口 |
| `apps/web/src/app/admin/layout.tsx` (modify) | `pageMeta` 加 `/admin/projects` |
| `apps/web/src/components/admin/project-row.tsx` (new) | 后台列表行（缩略图/开关/排序/编辑/删除） |
| `apps/web/src/components/admin/project-form-dialog.tsx` (new) | 新建/编辑表单（封面选择、chip 标签） |
| `apps/web/src/app/admin/projects/page.tsx` (new) | 后台项目页（总开关卡片 + 列表） |
| `apps/web/src/lib/i18n/admin.ts` (modify) | 后台文案键（zh/en） |
| `apps/web/src/lib/i18n/projects.ts` (new) | 前台项目页文案（zh/en） |
| `apps/web/src/lib/i18n/site.ts` (modify) | `site.projects` |
| `apps/web/src/lib/i18n.ts` (modify) | 注册 projects 命名空间 |
| `apps/web/src/components/blog/project-card.tsx` (new) | 前台项目卡片 |
| `apps/web/src/app/projects/page.tsx` (new) | 前台项目页（开关关 → notFound） |
| `apps/web/src/components/layout/header.tsx` (modify) | 桌面导航条件入口 |
| `apps/web/src/components/layout/mobile-nav.tsx` (modify) | 移动导航条件入口 |
| `apps/web/src/components/layout/footer.tsx` (modify) | footer 条件入口 |
| `$CLAUDE_JOB_DIR/tmp/verify-projects.mjs` (new, 不提交) | CDP 端到端验证 |

可复用的既有件：`apiFetch`（`@/lib/api-client`，自动带凭据 + 401 处理）、`useT()`、`toast`（sonner）、`EmptyState`、`ConfirmDeleteDialog`、`HeaderActions`、`MediaPickerDialog`、`IconButton`、`Tooltip`、`Badge`、`Card`/`CardContent`、`PageHeader`、`useSiteConfig()`。

---

### Task 1: projects 数据模块 + 测试

**Files:**
- Create: `packages/database/src/projects.ts`
- Create: `packages/database/test/projects.test.ts`
- Modify: `packages/database/src/index.ts`

- [ ] **Step 1: 写失败的测试**

创建 `packages/database/test/projects.test.ts`（真实 `file:` 库范式，同 `content-visibility.test.ts`）：

```ts
// projects 模块全链路：对真实 libsql file: 库跑 SQL（不是 mock）。
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const dir = mkdtempSync(join(tmpdir(), "zlog-projects-"))
process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`
delete process.env.TURSO_SYNC_URL

// env 设好后再 import（getDb 首次使用时缓存 client）
const projects = await import("../src/projects")
const { requireDb } = await import("../src/db")

const base = {
  title: "T",
  description: "",
  repoUrl: "",
  demoUrl: "",
  cover: "",
  tags: [] as string[],
  visible: true,
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("createProject", () => {
  it("新项目置顶（sort_order = MIN-1），默认上架", async () => {
    const a = await projects.createProject({ ...base, title: "first" })
    const b = await projects.createProject({ ...base, title: "second" })
    expect(b.sortOrder).toBeLessThan(a.sortOrder)
    expect(b.visible).toBe(true)
    const list = await projects.listProjects()
    expect(list.map((p) => p.title)).toEqual(["second", "first"])
  })

  it("tags 写入时 trim + 去重 + 保序", async () => {
    const p = await projects.createProject({
      ...base,
      title: "tagged",
      tags: [" Next.js ", "Next.js", "Turso", ""],
    })
    expect(p.tags).toEqual(["Next.js", "Turso"])
  })
})

describe("listVisibleProjects", () => {
  it("过滤 visible = 0", async () => {
    await projects.createProject({ ...base, title: "hidden", visible: false })
    const visible = await projects.listVisibleProjects()
    expect(visible.map((p) => p.title)).not.toContain("hidden")
    const all = await projects.listProjects()
    expect(all.map((p) => p.title)).toContain("hidden")
  })
})

describe("moveProject", () => {
  it("up/down 与相邻交换；首尾 no-op", async () => {
    const list = await projects.listProjects()
    const top = list[0]
    const second = list[1]
    expect(await projects.moveProject(top.id, "down")).toBe(true)
    let after = await projects.listProjects()
    expect(after[0].id).toBe(second.id)
    expect(after[1].id).toBe(top.id)
    // 首行 up 是 no-op
    expect(await projects.moveProject(second.id, "up")).toBe(false)
    // 末行 down 是 no-op
    const last = (await projects.listProjects()).at(-1)!
    expect(await projects.moveProject(last.id, "down")).toBe(false)
    // move 后 sort_order 被规范化为连续 0..n-1
    after = await projects.listProjects()
    expect(after.map((p) => p.sortOrder)).toEqual(after.map((_, i) => i))
  })
})

describe("updateProject / deleteProject", () => {
  it("局部更新保留其他字段并刷新 updated_at 语义", async () => {
    const p = await projects.createProject({ ...base, title: "edit-me", description: "old" })
    const updated = await projects.updateProject(p.id, { title: "edited", visible: false })
    expect(updated?.title).toBe("edited")
    expect(updated?.description).toBe("old")
    expect(updated?.visible).toBe(false)
    expect(await projects.updateProject(99999, { title: "x" })).toBeNull()
  })

  it("delete 返回是否删到", async () => {
    const p = await projects.createProject({ ...base, title: "doomed" })
    expect(await projects.deleteProject(p.id)).toBe(true)
    expect(await projects.deleteProject(p.id)).toBe(false)
  })
})

describe("rowToProject 容错", () => {
  it("坏 JSON / 非数组 tags 读回为 []", async () => {
    const db = requireDb()
    await db.execute({
      sql: "INSERT INTO projects (title, tags, sort_order) VALUES ('bad-json', 'not-json', 999)",
      args: [],
    })
    await db.execute({
      sql: `INSERT INTO projects (title, tags, sort_order) VALUES ('bad-shape', '{"a":1}', 1000)`,
      args: [],
    })
    const all = await projects.listProjects()
    expect(all.find((p) => p.title === "bad-json")?.tags).toEqual([])
    expect(all.find((p) => p.title === "bad-shape")?.tags).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/database test
```

预期：FAIL——`../src/projects` 模块不存在（Cannot find module）。

- [ ] **Step 3: 实现 `packages/database/src/projects.ts`**

```ts
import { type Client } from "@libsql/client"
import { requireDb } from "./db"
import { scheduleSync } from "./sync"

// ── Schema ──────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  repo_url TEXT NOT NULL DEFAULT '',
  demo_url TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order);
`

let tableReady: Promise<void> | null = null

async function ensureTable(db: Client): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.executeMultiple(SCHEMA)
    })().catch((err) => {
      tableReady = null // reset on failure so next call retries
      throw err
    })
  }
  await tableReady
}

// ── Records ─────────────────────────────────────────────────────────────

export interface Project {
  id: number
  title: string
  description: string
  repoUrl: string
  demoUrl: string
  cover: string
  tags: string[]
  visible: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** create/update 共用的可写字段集。 */
export interface ProjectInput {
  title: string
  description: string
  repoUrl: string
  demoUrl: string
  cover: string
  tags: string[]
  visible: boolean
}

export type ProjectUpdate = Partial<ProjectInput>

const MAX_TAGS = 8
const MAX_TAG_LENGTH = 24

/** trim + 去重（保序）+ 截断：最多 8 个、每个最长 24 字符。 */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH)
    if (!tag || out.includes(tag)) continue
    out.push(tag)
    if (out.length === MAX_TAGS) break
  }
  return out
}

/** tags 列是 JSON 字符串；坏 JSON / 非数组 / 非字符串元素一律容错为 []。 */
function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string") return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is string => typeof t === "string")
  } catch {
    return []
  }
}

const SELECT_COLS =
  "id, title, description, repo_url, demo_url, cover, tags, visible, sort_order, created_at, updated_at"

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    repoUrl: String(row.repo_url ?? ""),
    demoUrl: String(row.demo_url ?? ""),
    cover: String(row.cover ?? ""),
    tags: parseTags(row.tags),
    visible: Number(row.visible ?? 1) !== 0,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

// ── Queries ─────────────────────────────────────────────────────────────

/** 后台列表：全量，按展示顺序。 */
export async function listProjects(): Promise<Project[]> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute(
    `SELECT ${SELECT_COLS} FROM projects ORDER BY sort_order ASC, id ASC`
  )
  return result.rows.map((row) =>
    rowToProject(row as unknown as Record<string, unknown>)
  )
}

/** 前台列表：只含上架项。 */
export async function listVisibleProjects(): Promise<Project[]> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute(
    `SELECT ${SELECT_COLS} FROM projects WHERE visible = 1 ORDER BY sort_order ASC, id ASC`
  )
  return result.rows.map((row) =>
    rowToProject(row as unknown as Record<string, unknown>)
  )
}

/** 新项目置顶：sort_order = MIN-1（表空时为 0），建完立刻在列表最上面。 */
export async function createProject(input: ProjectInput): Promise<Project> {
  const db = requireDb()
  await ensureTable(db)
  const min = await db.execute("SELECT MIN(sort_order) AS m FROM projects")
  const m = min.rows[0]?.m
  const sortOrder = m === null || m === undefined ? 0 : Number(m) - 1
  const result = await db.execute({
    sql: `INSERT INTO projects (title, description, repo_url, demo_url, cover, tags, visible, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING ${SELECT_COLS}`,
    args: [
      input.title,
      input.description,
      input.repoUrl,
      input.demoUrl,
      input.cover,
      JSON.stringify(normalizeTags(input.tags)),
      input.visible ? 1 : 0,
      sortOrder,
    ],
  })
  scheduleSync()
  return rowToProject(result.rows[0] as unknown as Record<string, unknown>)
}

/** 局部更新；无字段可写时原样返回当前行；id 不存在返回 null。 */
export async function updateProject(
  id: number,
  patch: ProjectUpdate
): Promise<Project | null> {
  const db = requireDb()
  await ensureTable(db)
  const sets: string[] = []
  const args: (string | number)[] = []
  if (patch.title !== undefined) {
    sets.push("title = ?")
    args.push(patch.title)
  }
  if (patch.description !== undefined) {
    sets.push("description = ?")
    args.push(patch.description)
  }
  if (patch.repoUrl !== undefined) {
    sets.push("repo_url = ?")
    args.push(patch.repoUrl)
  }
  if (patch.demoUrl !== undefined) {
    sets.push("demo_url = ?")
    args.push(patch.demoUrl)
  }
  if (patch.cover !== undefined) {
    sets.push("cover = ?")
    args.push(patch.cover)
  }
  if (patch.tags !== undefined) {
    sets.push("tags = ?")
    args.push(JSON.stringify(normalizeTags(patch.tags)))
  }
  if (patch.visible !== undefined) {
    sets.push("visible = ?")
    args.push(patch.visible ? 1 : 0)
  }
  if (sets.length === 0) {
    const cur = await db.execute({
      sql: `SELECT ${SELECT_COLS} FROM projects WHERE id = ?`,
      args: [id],
    })
    const row = cur.rows[0]
    return row
      ? rowToProject(row as unknown as Record<string, unknown>)
      : null
  }
  sets.push("updated_at = datetime('now')")
  const result = await db.execute({
    sql: `UPDATE projects SET ${sets.join(", ")} WHERE id = ? RETURNING ${SELECT_COLS}`,
    args: [...args, id],
  })
  const row = result.rows[0]
  if (!row) return null
  scheduleSync()
  return rowToProject(row as unknown as Record<string, unknown>)
}

export async function deleteProject(id: number): Promise<boolean> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute({
    sql: "DELETE FROM projects WHERE id = ?",
    args: [id],
  })
  if (result.rowsAffected > 0) scheduleSync()
  return result.rowsAffected > 0
}

/** 上移/下移：与相邻行交换位置，随后把整表 sort_order 规范化为 0..n-1
 *  （顺带修掉历史重复值）。已在首/末位或 id 不存在时返回 false。 */
export async function moveProject(
  id: number,
  direction: "up" | "down"
): Promise<boolean> {
  const db = requireDb()
  await ensureTable(db)
  const list = await listProjects()
  const index = list.findIndex((p) => p.id === id)
  if (index === -1) return false
  const target = direction === "up" ? index - 1 : index + 1
  if (target < 0 || target >= list.length) return false
  const reordered = [...list]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  for (let i = 0; i < reordered.length; i++) {
    await db.execute({
      sql: "UPDATE projects SET sort_order = ? WHERE id = ?",
      args: [i, reordered[i].id],
    })
  }
  scheduleSync()
  return true
}
```

- [ ] **Step 4: 导出（Modify `packages/database/src/index.ts`）**

在 `export { getSiteSettings, upsertSiteSettings } from "./site-settings"` 一段之后追加：

```ts
export {
  listProjects,
  listVisibleProjects,
  createProject,
  updateProject,
  deleteProject,
  moveProject,
  normalizeTags,
} from "./projects"
export type { Project, ProjectInput, ProjectUpdate } from "./projects"
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/database test
```

预期：PASS（新增 8 个用例全过；既有 43 个不受影响）。

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/projects.ts packages/database/src/index.ts packages/database/test/projects.test.ts
git commit -m "feat(db): projects 表与 CRUD/排序模块（真实库全链路测试）"
```

---

### Task 2: 总开关数据层（site_settings.projects_enabled）

**Files:**
- Modify: `packages/database/src/site-settings.ts`
- Modify: `packages/database/test/site-settings-defaults.test.ts`
- Modify: `apps/web/src/lib/site-config.ts`
- Modify: `apps/web/src/lib/get-site-config.ts`
- Modify: `apps/web/src/components/layout/site-config-provider.tsx`
- Modify: `apps/web/src/app/api/site-settings/route.ts`

- [ ] **Step 1: `site-settings.ts` 加列**

在 `SCHEMA` 的 `comment_enabled INTEGER NOT NULL DEFAULT 1,` 之后加一行：

```
  projects_enabled INTEGER NOT NULL DEFAULT 0,
```

在 `ensureTable` 的 comment_enabled 迁移块之后追加：

```ts
      // Migrate existing DBs that predate projects_enabled.
      try {
        await db.execute(
          "ALTER TABLE site_settings ADD COLUMN projects_enabled INTEGER NOT NULL DEFAULT 0"
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/duplicate column/i.test(msg)) throw err
      }
```

`SiteSettingsRecord` 加字段（在 `commentEnabled: boolean` 后）：

```ts
  /** Projects showcase master switch — off = the public /projects page
   *  is not generated and has no nav entry. */
  projectsEnabled: boolean
```

`rowToRecord` 返回对象追加：

```ts
    // Missing column (pre-migration read) or NULL → projects off.
    projectsEnabled: row.projects_enabled === undefined || row.projects_enabled === null
      ? false
      : Number(row.projects_enabled) !== 0,
```

`upsertSiteSettings` 的 `next` 对象追加：

```ts
    projectsEnabled: patch.projectsEnabled ?? existing?.projectsEnabled ?? false,
```

SQL 改为（列名 + 占位符 + DO UPDATE + 参数各加一项）：

```ts
  await db.execute({
    sql: `INSERT INTO site_settings
            (id, name, title, description, author_name, logo_url, logo_invert_dark, github_url, twitter_url, comment_enabled, projects_enabled, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            title = excluded.title,
            description = excluded.description,
            author_name = excluded.author_name,
            logo_url = excluded.logo_url,
            logo_invert_dark = excluded.logo_invert_dark,
            github_url = excluded.github_url,
            twitter_url = excluded.twitter_url,
            comment_enabled = excluded.comment_enabled,
            projects_enabled = excluded.projects_enabled,
            updated_at = excluded.updated_at`,
    args: [
      next.name,
      next.title,
      next.description,
      next.authorName,
      next.logoUrl,
      next.logoInvertDark ? 1 : 0,
      next.githubUrl,
      next.twitterUrl,
      next.commentEnabled ? 1 : 0,
      next.projectsEnabled ? 1 : 0,
    ],
  })
```

- [ ] **Step 2: 测试断言（Modify `packages/database/test/site-settings-defaults.test.ts`）**

在既有 `describe` 之后追加：

```ts
describe("projects showcase default", () => {
  it("fresh tables default projects_enabled to off (no empty public page)", () => {
    expect(src).toMatch(/projects_enabled INTEGER NOT NULL DEFAULT 0/)
    expect(src).toMatch(
      /projectsEnabled: patch\.projectsEnabled \?\? existing\?\.projectsEnabled \?\? false/
    )
  })
})
```

- [ ] **Step 3: 跑 database 测试**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/database test
```

预期：PASS。

- [ ] **Step 4: `lib/site-config.ts`**

`SiteConfig` 类型在 `commentEnabled: boolean` 后加：

```ts
  /** Projects showcase master switch (settings, DB-backed). */
  projectsEnabled: boolean
```

`defaultSiteConfig` 在 `commentEnabled: true,` 后加：

```ts
  projectsEnabled: false,
```

- [ ] **Step 5: `lib/get-site-config.ts`（4 处）**

1) `SiteSettingsDto` 加 `projectsEnabled: boolean`。
2) `siteConfigFromRow` 返回对象加 `projectsEnabled: row.projectsEnabled,`（在 `commentEnabled` 行后）。
3) `toSettingsDto` 返回对象加 `projectsEnabled: config.projectsEnabled,`。
4) `loadCachedConfig` 返回对象加 `projectsEnabled: config.projectsEnabled,`；`getSiteConfig` 的合并处加：

```ts
      // ?? default: 同 commentEnabled —— 跨部署旧缓存条目缺此字段时
      // undefined 会被读成「关闭」，用默认值兜底（本项目默认即 false）。
      projectsEnabled: cached.projectsEnabled ?? defaultSiteConfig.projectsEnabled,
```

- [ ] **Step 6: `site-config-provider.tsx`**

`refreshSiteConfig` 的 `setConfig((prev) => ({ ... }))` 里、`commentEnabled` 块之后追加：

```ts
        projectsEnabled:
          typeof s.projectsEnabled === "boolean"
            ? s.projectsEnabled
            : prev.projectsEnabled,
```

- [ ] **Step 7: `api/site-settings/route.ts`**

`updateSchema` 加：

```ts
  projectsEnabled: z.boolean().optional(),
```

`dbPatch` 加 `projectsEnabled: patch.projectsEnabled,`。

首存分支（`existing ? … : upsertSiteSettings({...})`）的第二个对象加：

```ts
        projectsEnabled: patch.projectsEnabled ?? defaultSiteConfig.projectsEnabled,
```

- [ ] **Step 8: 门禁 + Commit**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web typecheck
git add packages/database/src/site-settings.ts packages/database/test/site-settings-defaults.test.ts apps/web/src/lib/site-config.ts apps/web/src/lib/get-site-config.ts apps/web/src/components/layout/site-config-provider.tsx apps/web/src/app/api/site-settings/route.ts
git commit -m "feat: site_settings 增加 projects_enabled 总开关（默认关闭，全链路透传）"
```

---

### Task 3: url-validation 提取 + 测试

**Files:**
- Create: `apps/web/src/lib/url-validation.ts`
- Create: `apps/web/test/url-validation.test.ts`
- Modify: `apps/web/src/app/api/site-settings/route.ts`

- [ ] **Step 1: 写失败的测试**

创建 `apps/web/test/url-validation.test.ts`：

```ts
import { describe, expect, it } from "vitest"
import { optionalHttpUrl } from "@/lib/url-validation"

describe("optionalHttpUrl", () => {
  it("接受空串（可选字段的清除语义）", () => {
    expect(optionalHttpUrl.safeParse("").success).toBe(true)
  })

  it("接受 http/https URL", () => {
    expect(optionalHttpUrl.safeParse("https://github.com/zephyr110/zlog").success).toBe(true)
    expect(optionalHttpUrl.safeParse("http://localhost:3000/x").success).toBe(true)
  })

  it("拒绝 javascript: / data: / 相对路径", () => {
    expect(optionalHttpUrl.safeParse("javascript:alert(1)").success).toBe(false)
    expect(optionalHttpUrl.safeParse("data:text/html,x").success).toBe(false)
    expect(optionalHttpUrl.safeParse("/relative/path").success).toBe(false)
    expect(optionalHttpUrl.safeParse("ftp://example.com").success).toBe(false)
  })

  it("拒绝超长（>300）", () => {
    expect(optionalHttpUrl.safeParse(`https://e.com/${"a".repeat(300)}`).success).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test -- url-validation
```

预期：FAIL——`@/lib/url-validation` 不存在。

- [ ] **Step 3: 创建 `apps/web/src/lib/url-validation.ts`**

```ts
import { z } from "zod"

/** Empty or http(s) only — blocks javascript:/data: href injection.
 *  Shared by site-settings and admin/projects URL fields. */
export const optionalHttpUrl = z
  .string()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), {
    message: "URL must be empty or an http(s) URL",
  })
```

- [ ] **Step 4: `api/site-settings/route.ts` 改引**

删除文件内 `optionalHttpUrl` 的定义（含其上注释），改为 import：

```ts
import { optionalHttpUrl } from "@/lib/url-validation"
```

（`optionalLogoUrl` 留在原文件——只有这里用。）

- [ ] **Step 5: 跑测试 + typecheck**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web test -- url-validation site-settings
pnpm --filter @zlog/web typecheck
```

预期：PASS / 无错误。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/url-validation.ts apps/web/test/url-validation.test.ts apps/web/src/app/api/site-settings/route.ts
git commit -m "refactor: optionalHttpUrl 提取为 lib/url-validation 共用"
```

---

### Task 4: 后台 API（三个路由）

**Files:**
- Create: `apps/web/src/app/api/admin/projects/route.ts`
- Create: `apps/web/src/app/api/admin/projects/[id]/route.ts`
- Create: `apps/web/src/app/api/admin/projects/[id]/move/route.ts`

- [ ] **Step 1: `route.ts`（GET 列表 / POST 新建）**

```ts
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { listProjects, createProject } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"
import { optionalHttpUrl } from "@/lib/url-validation"

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  repoUrl: optionalHttpUrl.optional(),
  demoUrl: optionalHttpUrl.optional(),
  cover: optionalHttpUrl.optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  visible: z.boolean().optional(),
})

/** Auth — full list, including hidden projects. */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ projects: await listProjects() })
}

/** Auth — create. */
export async function POST(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }
  const data = parsed.data
  const project = await createProject({
    title: data.title,
    description: data.description ?? "",
    repoUrl: data.repoUrl ?? "",
    demoUrl: data.demoUrl ?? "",
    cover: data.cover ?? "",
    tags: data.tags ?? [],
    visible: data.visible ?? true,
  })
  revalidatePath("/projects")
  return NextResponse.json({ project })
}
```

- [ ] **Step 2: `[id]/route.ts`（PUT / DELETE）**

```ts
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { updateProject, deleteProject } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"
import { optionalHttpUrl } from "@/lib/url-validation"

const updateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).optional(),
  repoUrl: optionalHttpUrl.optional(),
  demoUrl: optionalHttpUrl.optional(),
  cover: optionalHttpUrl.optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  visible: z.boolean().optional(),
})

function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Auth — partial update (fields + visibility). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }
  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }
  const project = await updateProject(id, parsed.data)
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  revalidatePath("/projects")
  return NextResponse.json({ project })
}

/** Auth — delete. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }
  const removed = await deleteProject(id)
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  revalidatePath("/projects")
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: `[id]/move/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { moveProject } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"

const moveSchema = z.object({ direction: z.enum(["up", "down"]) })

/** Auth — reorder. A no-op at the first/last position returns moved: false. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }
  const parsed = moveSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 })
  }
  const moved = await moveProject(id, parsed.data.direction)
  if (moved) revalidatePath("/projects")
  return NextResponse.json({ ok: true, moved })
}
```

- [ ] **Step 4: curl 烟测（dev server）**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web dev &   # 若已有 dev server 在 3000 端口则跳过
sleep 8 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/projects
```

预期：`401`（未带会话 → requireAuth 拒绝；证明路由存在且受保护，而不是 404）。

停掉临时 dev server（若本步启动的）：`kill %1`。

- [ ] **Step 5: typecheck + Commit**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web typecheck
git add apps/web/src/app/api/admin/projects
git commit -m "feat(api): 后台项目 CRUD 与排序路由（requireAuth + zod）"
```

---

### Task 5: Switch 组件 + OpenUrlButton 提取

**Files:**
- Create: `apps/web/src/components/ui/switch.tsx`
- Create: `apps/web/src/components/admin/open-url-button.tsx`
- Modify: `apps/web/src/components/admin/site-info-form.tsx`

- [ ] **Step 1: 创建 `apps/web/src/components/ui/switch.tsx`**

```tsx
"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/** Base UI Switch 包装：span + 隐藏 input，靠 data-checked / data-unchecked
 *  状态属性换样式（Tailwind v4 变体，项目内 dialog 的 data-open: 同族）。
 *  h-5 w-9 + p-0.5 + thumb size-4：内宽 32px，选中位移 16px（translate-x-4）。 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-checked:bg-primary data-unchecked:bg-input disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform data-checked:translate-x-4 data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
```

（`bg-input` / `bg-primary` 是项目既有主题变量；若 Tailwind 报 unknown utility，改 `data-unchecked:bg-muted-foreground/30`。）

- [ ] **Step 2: 创建 `apps/web/src/components/admin/open-url-button.tsx`**

（从 `site-info-form.tsx` 原样搬移 `externalHref` 与 `OpenUrlButton`，加 `"use client"` 与导出）

```tsx
"use client"

import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

/** Only allow opening http(s) URLs typed in the form — empty/invalid stay inert. */
export function externalHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.href
  } catch {
    return null
  }
}

export function OpenUrlButton({ href, label }: { href: string | null; label: string }) {
  // Match Input height (h-8) so the trailing action sits on the same row.
  const className = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    href ? "hover:bg-muted hover:text-foreground" : "opacity-50"
  )

  if (!href) {
    return (
      <span className={className} aria-hidden="true">
        <ExternalLink size={14} />
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={className}
    >
      <ExternalLink size={14} />
    </a>
  )
}
```

- [ ] **Step 3: `site-info-form.tsx` 改引**

1. 删除文件内的 `externalHref` 与 `OpenUrlButton` 定义（含其上方注释）。
2. import 区加：

```ts
import { OpenUrlButton, externalHref } from "@/components/admin/open-url-button"
```

3. 从 lucide 的 import 里删掉 `ExternalLink`（提取后本站不再使用）：
   `import { ImageIcon, Upload, X } from "lucide-react"`

- [ ] **Step 4: typecheck + Commit**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web typecheck && pnpm --filter @zlog/web lint
git add apps/web/src/components/ui/switch.tsx apps/web/src/components/admin/open-url-button.tsx apps/web/src/components/admin/site-info-form.tsx
git commit -m "feat(ui): Base UI Switch 组件 + OpenUrlButton 提取共用"
```

---

### Task 6: 后台项目页骨架（列表 + 总开关）

**Files:**
- Modify: `apps/web/src/lib/i18n/admin.ts`
- Modify: `apps/web/src/components/admin/admin-sidebar.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/components/admin/project-row.tsx`
- Create: `apps/web/src/app/admin/projects/page.tsx`

- [ ] **Step 1: i18n 键（Modify `lib/i18n/admin.ts`）**

zh 对象（就近放在媒体相关键附近即可，位置不限）新增：

```ts
projects: "项目",
projectsDesc: "管理前台「项目」页展示的内容。",
projectsEnabled: "在前台展示项目页",
projectsEnabledHint: "关闭后前台导航不再出现入口，/projects 页面不可访问；静态站将在下次部署后生效。",
newProject: "新建项目",
editProject: "编辑项目",
projectTitle: "标题",
projectTitlePlaceholder: "项目名称",
projectDescription: "简介",
projectDescriptionPlaceholder: "一两句话说明这个项目",
projectRepoUrl: "GitHub 仓库",
projectDemoUrl: "在线演示",
projectCover: "封面图",
projectCoverPick: "从媒体库选择",
projectCoverRemove: "移除封面",
projectCoverPlaceholder: "https://… 或从媒体库选择",
projectTags: "技术栈",
projectTagsHint: "回车添加，最多 8 个",
projectTagsLimit: "最多 8 个标签",
projectVisible: "上架展示",
projectEmpty: "还没有项目",
projectEmptyHint: "新建第一个项目，它会出现在前台项目页。",
moveUp: "上移",
moveDown: "下移",
deleteProjectTitle: "删除项目",
deleteProjectDesc: (title: string) => `确定删除「${title}」？此操作不可恢复。`,
projectCreated: "已创建",
projectSaved: "已保存",
projectDeleted: "已删除",
retry: "重试",
save: "保存",
```

（`retry` / `save` 已核实 admin.ts 中不存在，必须新增；`cancel` / `delete` / `openUrl` / `networkError` / `loadFailed` 已存在，直接用。）

en 对象对应新增：

```ts
projects: "Projects",
projectsDesc: "Manage the content shown on the public Projects page.",
projectsEnabled: "Show the Projects page on the site",
projectsEnabledHint: "When off, the public nav loses this entry and /projects becomes unavailable; the static site picks this up on the next deploy.",
newProject: "New project",
editProject: "Edit project",
projectTitle: "Title",
projectTitlePlaceholder: "Project name",
projectDescription: "Description",
projectDescriptionPlaceholder: "One or two sentences about the project",
projectRepoUrl: "GitHub repository",
projectDemoUrl: "Live demo",
projectCover: "Cover image",
projectCoverPick: "Pick from library",
projectCoverRemove: "Remove cover",
projectCoverPlaceholder: "https://… or pick from the library",
projectTags: "Tech stack",
projectTagsHint: "Press Enter to add, up to 8",
projectTagsLimit: "Up to 8 tags",
projectVisible: "Visible on site",
projectEmpty: "No projects yet",
projectEmptyHint: "Create your first project — it will appear on the public Projects page.",
moveUp: "Move up",
moveDown: "Move down",
deleteProjectTitle: "Delete project",
deleteProjectDesc: (title: string) => `Delete "${title}"? This cannot be undone.`,
projectCreated: "Created",
projectSaved: "Saved",
projectDeleted: "Deleted",
retry: "Retry",
save: "Save",
```

- [ ] **Step 2: 侧边栏入口（Modify `admin-sidebar.tsx`）**

lucide import 加 `FolderGit2`；`sidebarLinks` 在媒体项后插：

```ts
  { href: "/admin/projects", i18nKey: "admin.projects", icon: FolderGit2 },
```

- [ ] **Step 3: pageMeta（Modify `app/admin/layout.tsx`）**

```ts
  "/admin/projects": { titleKey: "admin.projects", descKey: "admin.projectsDesc" },
```

- [ ] **Step 4: 创建 `project-row.tsx`**

```tsx
"use client"

import { ArrowDown, ArrowUp, FolderGit2, SquarePen, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { IconButton } from "@/components/ui/icon-button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useT } from "@/components/layout/trans"
import { type Project } from "@zlog/database"

interface ProjectRowProps {
  project: Project
  isFirst: boolean
  isLast: boolean
  busy: boolean
  onMove: (direction: "up" | "down") => void
  onToggleVisible: (visible: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

export function ProjectRow({
  project,
  isFirst,
  isLast,
  busy,
  onMove,
  onToggleVisible,
  onEdit,
  onDelete,
}: ProjectRowProps) {
  const { t } = useT()
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border bg-card p-3 transition-opacity",
        !project.visible && "opacity-60"
      )}
    >
      {/* 封面缩略图（无封面 → 渐变占位） */}
      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md">
        {project.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- media-picker 产出 jsdelivr 外链，无需优化器
          <img
            src={project.cover}
            alt=""
            className={cn("h-full w-full object-cover", !project.visible && "grayscale")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1c2333] via-[#2b3a67] to-[#131822]">
            <FolderGit2 className="size-6 text-white/70" aria-hidden />
          </div>
        )}
      </div>

      {/* 标题 + 简介 + 标签 */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium">{project.title}</p>
        {project.description && (
          <p className="truncate text-sm text-muted-foreground">{project.description}</p>
        )}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* 操作区：上架开关 → 上移/下移 → 编辑 → 删除 */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Switch
          checked={project.visible}
          disabled={busy}
          onCheckedChange={(checked) => onToggleVisible(checked)}
          aria-label={t("admin.projectVisible") as string}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <IconButton
                size="sm"
                aria-label={t("admin.moveUp") as string}
                disabled={busy || isFirst}
                onClick={() => onMove("up")}
              >
                <ArrowUp size={14} />
              </IconButton>
            }
          />
          <TooltipContent>{t("admin.moveUp") as string}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <IconButton
                size="sm"
                aria-label={t("admin.moveDown") as string}
                disabled={busy || isLast}
                onClick={() => onMove("down")}
              >
                <ArrowDown size={14} />
              </IconButton>
            }
          />
          <TooltipContent>{t("admin.moveDown") as string}</TooltipContent>
        </Tooltip>
        <IconButton size="sm" aria-label={t("admin.editPost") as string} onClick={onEdit}>
          <SquarePen size={14} />
        </IconButton>
        <IconButton
          size="sm"
          aria-label={t("admin.delete") as string}
          onClick={onDelete}
          className="hover:text-destructive"
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  )
}
```

（`admin.editPost` / `admin.delete` 是既有键；若 `editPost` 语义为「编辑文章」不合适，改用下面的 `admin.editProject`——两者都行，优先 `editProject`。）

> 实现注意：把「编辑」按钮的 `aria-label` 用 `t("admin.editProject")`。

- [ ] **Step 5: 创建 `app/admin/projects/page.tsx`**

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { FolderGit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { HeaderActions } from "@/components/admin/header-actions"
import { ProjectRow } from "@/components/admin/project-row"
import { ProjectFormDialog } from "@/components/admin/project-form-dialog"
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { toast } from "sonner"
import { type Project } from "@zlog/database"

export default function AdminProjectsPage() {
  const { t } = useT()
  const site = useSiteConfig()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/projects")
      if (!res.ok) throw new Error("load failed")
      const data = await res.json()
      setProjects(data.projects ?? [])
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 总开关：乐观更新 + 失败回滚。 */
  async function handleToggleEnabled(next: boolean) {
    const prev = site.projectsEnabled
    setTogglingEnabled(true)
    site.setSiteConfig((p) => ({ ...p, projectsEnabled: next }))
    try {
      const res = await apiFetch("/api/site-settings", {
        method: "PUT",
        body: JSON.stringify({ projectsEnabled: next }),
      })
      if (!res.ok) throw new Error("save failed")
      toast.success(t("admin.projectSaved") as string)
    } catch {
      site.setSiteConfig((p) => ({ ...p, projectsEnabled: prev }))
      toast.error(t("admin.networkError") as string)
    } finally {
      setTogglingEnabled(false)
    }
  }

  async function handleMove(project: Project, direction: "up" | "down") {
    setBusyId(project.id)
    try {
      const res = await apiFetch(`/api/admin/projects/${project.id}/move`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      })
      if (!res.ok) throw new Error("move failed")
      await load()
    } catch {
      toast.error(t("admin.networkError") as string)
    } finally {
      setBusyId(null)
    }
  }

  /** 可见性切换：乐观更新 + 失败回滚。 */
  async function handleToggleVisible(project: Project, visible: boolean) {
    setBusyId(project.id)
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === project.id ? { ...p, visible } : p)) : prev
    )
    try {
      const res = await apiFetch(`/api/admin/projects/${project.id}`, {
        method: "PUT",
        body: JSON.stringify({ visible }),
      })
      if (!res.ok) throw new Error("save failed")
    } catch {
      setProjects((prev) =>
        prev
          ? prev.map((p) => (p.id === project.id ? { ...p, visible: !visible } : p))
          : prev
      )
      toast.error(t("admin.networkError") as string)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await apiFetch(`/api/admin/projects/${deleting.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("delete failed")
      toast.success(t("admin.projectDeleted") as string)
      setDeleting(null)
      await load()
    } catch {
      toast.error(t("admin.networkError") as string)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <HeaderActions>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <FolderGit2 size={14} />
          {t("admin.newProject") as string}
        </Button>
      </HeaderActions>

      {/* 总开关卡片 */}
      <Card>
        <CardContent className="flex items-start justify-between gap-6 pt-6">
          <div className="space-y-1">
            <Label htmlFor="projects-enabled" className="text-sm font-medium">
              {t("admin.projectsEnabled") as string}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("admin.projectsEnabledHint") as string}
            </p>
          </div>
          <Switch
            id="projects-enabled"
            checked={site.projectsEnabled}
            disabled={togglingEnabled}
            onCheckedChange={handleToggleEnabled}
            aria-label={t("admin.projectsEnabled") as string}
          />
        </CardContent>
      </Card>

      {/* 列表 */}
      {error ? (
        <EmptyState
          icon={<FolderGit2 className="size-8" />}
          title={t("admin.loadFailed") as string}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t("admin.retry") as string}
            </Button>
          }
        />
      ) : projects === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 className="size-8" />}
          title={t("admin.projectEmpty") as string}
          description={t("admin.projectEmptyHint") as string}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              {t("admin.newProject") as string}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {projects.map((project, index) => (
            <ProjectRow
              key={project.id}
              project={project}
              isFirst={index === 0}
              isLast={index === projects.length - 1}
              busy={busyId === project.id}
              onMove={(direction) => void handleMove(project, direction)}
              onToggleVisible={(visible) => void handleToggleVisible(project, visible)}
              onEdit={() => {
                setEditing(project)
                setFormOpen(true)
              }}
              onDelete={() => setDeleting(project)}
            />
          ))}
        </div>
      )}

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editing}
        onSaved={() => void load()}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        onConfirm={handleDelete}
        busy={deleteBusy}
        title={t("admin.deleteProjectTitle") as string}
        description={
          deleting
            ? (t("admin.deleteProjectDesc") as (title: string) => string)(deleting.title)
            : ""
        }
      />
    </div>
  )
}
```

（键已核实：`admin.loadFailed` / `admin.networkError` / `admin.cancel` / `admin.delete` / `admin.openUrl` 均已存在；`admin.retry` / `admin.save` 由本任务 Step 1 新增。）

> 本步引用了 Task 7 才创建的 `ProjectFormDialog`——为让本任务可独立提交，**先把 Task 7 的 Step 1 做完再提交本任务**，或暂时用 `{false && <ProjectFormDialog … />}`。推荐顺序：先写 Task 7 的 dialog 文件（Step 1），再统一提交两个任务各自的文件。

- [ ] **Step 6: i18n 门禁 + typecheck + Commit**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web check:i18n
pnpm --filter @zlog/web typecheck
git add apps/web/src/lib/i18n/admin.ts apps/web/src/components/admin/admin-sidebar.tsx apps/web/src/app/admin/layout.tsx apps/web/src/components/admin/project-row.tsx apps/web/src/app/admin/projects/page.tsx
git commit -m "feat(admin): 项目页（列表 + 上架开关 + 排序 + 删除）"
```

---

### Task 7: 项目表单 Dialog

**Files:**
- Create: `apps/web/src/components/admin/project-form-dialog.tsx`
- Modify: `apps/web/src/lib/i18n/admin.ts`（若 Task 6 未覆盖表单键）

- [ ] **Step 1: 创建 `project-form-dialog.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { ImageIcon, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { MediaPickerDialog } from "@/components/admin/media-picker-dialog"
import { OpenUrlButton, externalHref } from "@/components/admin/open-url-button"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { type Project } from "@zlog/database"

const MAX_TAGS = 8
const MAX_TAG_LENGTH = 24

interface FormState {
  title: string
  description: string
  repoUrl: string
  demoUrl: string
  cover: string
  tags: string[]
  visible: boolean
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  repoUrl: "",
  demoUrl: "",
  cover: "",
  tags: [],
  visible: true,
}

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = 新建 */
  project: Project | null
  onSaved: () => void
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: ProjectFormDialogProps) {
  const { t } = useT()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [tagDraft, setTagDraft] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // 打开时按 project 重置（新建 → 空表单）
  useEffect(() => {
    if (!open) return
    setForm(
      project
        ? {
            title: project.title,
            description: project.description,
            repoUrl: project.repoUrl,
            demoUrl: project.demoUrl,
            cover: project.cover,
            tags: project.tags,
            visible: project.visible,
          }
        : EMPTY_FORM
    )
    setTagDraft("")
  }, [open, project])

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addTag(raw: string) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH)
    setTagDraft("")
    if (!tag || form.tags.includes(tag) || form.tags.length >= MAX_TAGS) return
    patch("tags", [...form.tags, tag])
  }

  function removeTag(tag: string) {
    patch("tags", form.tags.filter((x) => x !== tag))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const body = JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        repoUrl: form.repoUrl.trim(),
        demoUrl: form.demoUrl.trim(),
        cover: form.cover.trim(),
        tags: form.tags,
        visible: form.visible,
      })
      const res = project
        ? await apiFetch(`/api/admin/projects/${project.id}`, { method: "PUT", body })
        : await apiFetch("/api/admin/projects", { method: "POST", body })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "save failed")
      }
      toast.success(
        t(project ? "admin.projectSaved" : "admin.projectCreated") as string
      )
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error(t("admin.networkError") as string)
    } finally {
      setSaving(false)
    }
  }

  const canSave = form.title.trim().length > 0 && !saving

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(32rem,100%)]">
          <DialogHeader>
            <DialogTitle>
              {t(project ? "admin.editProject" : "admin.newProject") as string}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 标题 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-title">{t("admin.projectTitle") as string}</Label>
              <Input
                id="project-title"
                value={form.title}
                maxLength={80}
                onChange={(e) => patch("title", e.target.value)}
                placeholder={t("admin.projectTitlePlaceholder") as string}
              />
            </div>

            {/* 简介 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-description">
                {t("admin.projectDescription") as string}
              </Label>
              <Textarea
                id="project-description"
                value={form.description}
                maxLength={200}
                rows={2}
                onChange={(e) => patch("description", e.target.value)}
                placeholder={t("admin.projectDescriptionPlaceholder") as string}
              />
              <p className="text-right text-xs text-muted-foreground">
                {form.description.length}/200
              </p>
            </div>

            {/* GitHub 仓库 + 演示 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-repo">{t("admin.projectRepoUrl") as string}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="project-repo"
                  value={form.repoUrl}
                  onChange={(e) => patch("repoUrl", e.target.value)}
                  placeholder="https://github.com/…"
                />
                <OpenUrlButton
                  href={externalHref(form.repoUrl)}
                  label={t("admin.openUrl") as string}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-demo">{t("admin.projectDemoUrl") as string}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="project-demo"
                  value={form.demoUrl}
                  onChange={(e) => patch("demoUrl", e.target.value)}
                  placeholder="https://…"
                />
                <OpenUrlButton
                  href={externalHref(form.demoUrl)}
                  label={t("admin.openUrl") as string}
                />
              </div>
            </div>

            {/* 封面 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-cover">{t("admin.projectCover") as string}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="project-cover"
                  value={form.cover}
                  onChange={(e) => patch("cover", e.target.value)}
                  placeholder={t("admin.projectCoverPlaceholder") as string}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => setPickerOpen(true)}
                >
                  <ImageIcon size={14} />
                  {t("admin.projectCoverPick") as string}
                </Button>
              </div>
              {form.cover && (
                <div className="relative mt-1.5 aspect-video w-full overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- jsdelivr 外链 */}
                  <img src={form.cover} alt="" className="h-full w-full object-cover" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="absolute right-1.5 top-1.5"
                    onClick={() => patch("cover", "")}
                  >
                    <X size={12} />
                    {t("admin.projectCoverRemove") as string}
                  </Button>
                </div>
              )}
            </div>

            {/* 技术栈标签 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-tags">{t("admin.projectTags") as string}</Label>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={`${t("admin.projectCoverRemove") as string} ${tag}`}
                        onClick={() => removeTag(tag)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Input
                id="project-tags"
                value={tagDraft}
                disabled={form.tags.length >= MAX_TAGS}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addTag(tagDraft)
                  }
                }}
                placeholder={
                  form.tags.length >= MAX_TAGS
                    ? (t("admin.projectTagsLimit") as string)
                    : (t("admin.projectTagsHint") as string)
                }
              />
            </div>

            {/* 上架开关 */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="project-visible" className="text-sm font-medium">
                {t("admin.projectVisible") as string}
              </Label>
              <Switch
                id="project-visible"
                checked={form.visible}
                onCheckedChange={(checked) => patch("visible", checked)}
                aria-label={t("admin.projectVisible") as string}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("admin.cancel") as string}
            </Button>
            <Button size="sm" disabled={!canSave} onClick={() => void handleSave()}>
              {saving && <Spinner className="size-3.5" />}
              {t("admin.save") as string}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(url) => patch("cover", url)}
      />
    </>
  )
}
```

（键已核实：`admin.cancel` / `admin.openUrl` 已存在；`admin.save` 由 Task 6 Step 1 新增。）`Spinner` 组件若 `@/components/ui/spinner` 不存在，实现时改用 `RefreshCw className="animate-spin"`（同 share-card-dialog 的 busy 图标写法）或既有等价 loading 图标。

- [ ] **Step 2: i18n 门禁 + typecheck + Commit**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web check:i18n && pnpm --filter @zlog/web typecheck
git add apps/web/src/components/admin/project-form-dialog.tsx apps/web/src/lib/i18n/admin.ts
git commit -m "feat(admin): 项目表单对话框（封面选择 / chip 标签 / 上架开关）"
```

---

### Task 8: 前台项目页

**Files:**
- Create: `apps/web/src/lib/i18n/projects.ts`
- Modify: `apps/web/src/lib/i18n.ts`
- Modify: `apps/web/src/lib/i18n/site.ts`
- Create: `apps/web/src/components/blog/project-card.tsx`
- Create: `apps/web/src/app/projects/page.tsx`

- [ ] **Step 1: 创建 `apps/web/src/lib/i18n/projects.ts`**

```ts
// projects — zh/en translation dictionary (public Projects page)

import type { LocaleMessages } from "./locale-messages"

const zh = {
  title: "项目",
  description: "我构建和维护的一些东西。",
  empty: "暂无项目",
  emptyHint: "项目整理中，敬请期待。",
  repo: "查看仓库",
  demo: "在线演示",
}

const en = {
  title: "Projects",
  description: "Things I build and maintain.",
  empty: "No projects yet",
  emptyHint: "Projects are being organized — check back soon.",
  repo: "View repo",
  demo: "Live demo",
} as const satisfies LocaleMessages<typeof zh>

export const projects = { zh, en }
```

（注意：zh 也要 `as const satisfies LocaleMessages<...>`？照 site.ts 惯例——zh 是基准类型，末尾 `as const`；en 收 `satisfies LocaleMessages<typeof zh>`。看 site.ts：`const zh = {...}` 无后缀，`const en = {...} as const satisfies LocaleMessages<typeof zh>`。本文件照此：zh 裸对象（末尾加 `as const` 与否照 admin.ts——admin.ts zh 无后缀）→ 保持 zh 裸、en 带 satisfies。）

- [ ] **Step 2: 注册（Modify `lib/i18n.ts`）**

import 区加 `import { projects } from "./i18n/projects"`；`translations.zh` 与 `translations.en` 各加 `projects: projects.zh,` / `projects: projects.en,`（放在 `admin` 之后）。

- [ ] **Step 3: `site.ts` 加导航键**

zh 的 `about: "关于"` 附近加 `projects: "项目",`；en 对应加 `projects: "Projects",`。

- [ ] **Step 4: 创建 `apps/web/src/components/blog/project-card.tsx`**

```tsx
import { FolderGit2 } from "lucide-react"
import { Trans } from "@/components/layout/trans"
import { type Project } from "@zlog/database"

/** 前台项目卡片：封面（无图/加载失败 → 渐变占位）→ 标题 → 简介两行 →
 *  标签 → 分隔线 → 外链行。整卡不可点，GitHub / 演示是两个平级外链。 */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-video w-full overflow-hidden">
        {project.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- jsdelivr 外链（静态导出无图片优化器）
          <img
            src={project.cover}
            alt={project.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1c2333] via-[#2b3a67] to-[#131822]">
            <FolderGit2 className="size-10 text-white/60" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold leading-snug">{project.title}</h3>
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {project.description}
          </p>
        )}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {(project.repoUrl || project.demoUrl) && (
          <div className="mt-auto flex items-center gap-4 border-t pt-3 text-sm">
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <GithubIcon size={15} />
                <Trans k="projects.repo" />
              </a>
            )}
            {project.demoUrl && (
              <a
                href={project.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink size={15} />
                <Trans k="projects.demo" />
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
```

import 补充：`import { ExternalLink } from "lucide-react"` 与 `import { GithubIcon } from "@/components/ui/brand-icons"`。

> 注意封面失败兜底：`<img onError>` 无法在 server component 用（需要 client）。简化：封面失败时 alt 文本与背景色兜底（容器有 `bg-muted` 的风险——给容器加 `bg-muted`），不做 JS 兜底。若实现时想更稳，把 `<img>` 换成一个小 client 组件 `ProjectCover`（onError 置 state 回落渐变）——推荐做，代码见下：

```tsx
"use client"

import { useState } from "react"
import { FolderGit2 } from "lucide-react"

export function ProjectCover({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1c2333] via-[#2b3a67] to-[#131822]">
        <FolderGit2 className="size-10 text-white/60" aria-hidden />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- jsdelivr 外链（静态导出无图片优化器）
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
    />
  )
}
```

（放 `apps/web/src/components/blog/project-cover.tsx`；`ProjectCard` 的封面块改用它。）

- [ ] **Step 5: 创建 `apps/web/src/app/projects/page.tsx`**

```tsx
import { type Metadata } from "next"
import { notFound } from "next/navigation"
import { FolderGit2 } from "lucide-react"
import { listVisibleProjects } from "@zlog/database"
import { getSiteConfig } from "@/lib/get-site-config"
import { PageHeader } from "@/components/layout/page-header"
import { ProjectCard } from "@/components/blog/project-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Trans } from "@/components/layout/trans"
import { defaultLocale, t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: t(defaultLocale, "projects.title"),
  description: t(defaultLocale, "projects.description"),
}

export default async function ProjectsPage() {
  const [site, projects] = await Promise.all([
    getSiteConfig(),
    listVisibleProjects(),
  ])
  // 总开关关闭：页面不产出（静态导出时该路径输出 404 内容），
  // 导航也无入口。
  if (!site.projectsEnabled) notFound()

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeader
        breadcrumb={[
          { href: "/", label: <Trans k="site.home" /> },
          { href: "/projects", label: <Trans k="projects.title" /> },
        ]}
        icon={<FolderGit2 size={22} />}
        title={<Trans k="projects.title" />}
        description={<Trans k="projects.description" />}
      />

      <div className="container mx-auto max-w-5xl px-4 py-12 md:py-16 2xl:max-w-7xl">
        {projects.length === 0 ? (
          <EmptyState
            size="lg"
            titleAs="h2"
            icon={<FolderGit2 className="size-8" />}
            title={<Trans k="projects.empty" />}
            description={<Trans k="projects.emptyHint" />}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 门禁 + dev 手工看页 + Commit**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web check:i18n && pnpm --filter @zlog/web typecheck
pnpm --filter @zlog/web lint
```

dev server 上访问 `http://localhost:3000/projects`（若开关默认关且 DB 无行：应见 404 页；在后台把总开关打开并建一条项目后再看卡片网格）。

```bash
git add apps/web/src/lib/i18n/projects.ts apps/web/src/lib/i18n.ts apps/web/src/lib/i18n/site.ts apps/web/src/components/blog/project-card.tsx apps/web/src/components/blog/project-cover.tsx apps/web/src/app/projects/page.tsx
git commit -m "feat: 前台 /projects 封面卡片网格（开关关闭时 notFound）"
```

---

### Task 9: 前台导航三处条件入口

**Files:**
- Modify: `apps/web/src/components/layout/header.tsx`
- Modify: `apps/web/src/components/layout/mobile-nav.tsx`
- Modify: `apps/web/src/components/layout/footer.tsx`

- [ ] **Step 1: `header.tsx`**

在「归档」NavLink 之后、「关于」之前插入：

```tsx
            {/* 项目（总开关控制入口） */}
            {site.projectsEnabled && (
              <NavLink href="/projects" active={pathname === "/projects"}>
                {t("site.projects")}
              </NavLink>
            )}
```

（`site` 已由 `useSiteConfig()` 提供 ✔）

- [ ] **Step 2: `mobile-nav.tsx`**

`navLinks` 数组改为带可选条件的形态：

```ts
const navLinks: {
  href: string
  i18nKey: TranslationPath
  requiresProjects?: boolean
}[] = [
  { href: "/", i18nKey: "site.home" },
  { href: "/archive", i18nKey: "site.archive" },
  { href: "/projects", i18nKey: "site.projects", requiresProjects: true },
  { href: "/about", i18nKey: "site.about" },
]
```

渲染处 `navLinks.map(...)` 改为：

```tsx
{navLinks
  .filter((link) => !link.requiresProjects || site.projectsEnabled)
  .map((link) => (
```

（`site` 已由 `useSiteConfig()` 提供 ✔）

- [ ] **Step 3: `footer.tsx`**

在 `/archive` Link 与 `/about` Link 之间插入：

```tsx
              {site.projectsEnabled && (
                <Link
                  href="/projects"
                  className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("site.projects")}
                </Link>
              )}
```

- [ ] **Step 4: typecheck + dev 手工验证 + Commit**

```bash
cd /Users/zephyr/Code/zlog
pnpm --filter @zlog/web typecheck
```

dev server：开关开 → 桌面导航 / 移动菜单 / footer 三处均出现「项目」；开关关 → 三处均消失。

```bash
git add apps/web/src/components/layout/header.tsx apps/web/src/components/layout/mobile-nav.tsx apps/web/src/components/layout/footer.tsx
git commit -m "feat(nav): 项目页入口（桌面/移动/footer，随总开关显隐）"
```

---

### Task 10: 终验（门禁 + export + 端到端）

**Files:** 无代码改动（验证 + 报告）

- [ ] **Step 1: 全量门禁**

```bash
cd /Users/zephyr/Code/zlog
pnpm lint && pnpm typecheck
pnpm --filter @zlog/web test && pnpm --filter @zlog/database test
```

预期：全绿（web 241+新增、database 43+新增）。

- [ ] **Step 2: 本地 export 构建（静态站约束）**

```bash
cd /Users/zephyr/Code/zlog/apps/web
pnpm run export
ls out/projects* 2>/dev/null
```

预期：构建成功；动态段 API 路由被脚本 stash（日志出现 `Stashed (dynamic segment)`，构建后自动还原，`git status` 干净）。产物按当时开关状态：开启 → `out/projects.html` 为项目页；关闭 → 该路径为 404 内容（与 `out/404.html` 同文案）。

- [ ] **Step 3: CDP 端到端验证**

写 `$CLAUDE_JOB_DIR/tmp/verify-projects.mjs`（复用既有脚本骨架：`/json/new` 建 target、`until()` 轮询、`Runtime.evaluate`），覆盖：

1. 后台 `/admin/projects`：登录后打开页面 → 总开关卡片与列表渲染（截图）。
2. 点「新建项目」→ 填标题/简介/仓库/标签（Enter 添加）→ 保存 → 列表出现新行（截图）。
3. 切换行内可见性 Switch → 行变半透明（截图）。
4. 点「下移」→ 列表顺序变化（对比保存前后标题顺序）。
5. 前台 `/projects`：导航出现「项目」→ 打开页面 → 卡片网格渲染、标签/链接可见（截图，中英文各一）。
6. 删除测试项目 → 列表恢复。

```bash
cd /Users/zephyr/Code/zlog
# 若无 dev server：pnpm --filter @zlog/web dev &
# 若无 headless Chrome：
# "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 about:blank &
node "$CLAUDE_JOB_DIR/tmp/verify-projects.mjs"
```

- [ ] **Step 4: 报告 + 待授权推送**

汇总门禁/export/CDP 结果与截图路径。**不推送**——推送 main 需要用户当次明确授权（连同本会话早先未推的叠卡提交 `cb54be8` + `31f49ed` 一并询问）。

---

## Self-Review 记录

- **Spec 覆盖**：总开关（Task 2）、projects 表与函数（Task 1）、API 校验与提取（Task 3/4）、后台 UI 全部条目（Task 5/6/7，含 Switch、封面媒体库、chip 标签、上移下移、删除确认、空态）、前台页与卡片（Task 8）、导航三处（Task 9）、i18n（6/7/8）、测试与 export 验证（1/3/10）——逐项有任务对应。
- **类型一致性**：`Project`/`ProjectInput`/`ProjectUpdate` 在 Task 1 定义，后续任务全部按此引用；`listVisibleProjects`（前台）、`listProjects`（后台）命名前后一致；`projectsEnabled` 字段名贯穿 DB→DTO→provider→UI。
- **已核实项（撰写时逐一 grep 确认）**：
  - admin i18n 已存在键：`cancel` / `delete` / `editPost` / `openUrl` / `networkError` / `loadFailed`——计划直接引用；`retry` / `save` 不存在，已列入 Task 6 Step 1 新增清单。
  - CSS：`--color-input` 存在于 globals.css → `bg-input` 工具类可用（Task 5 Switch 无需替代样式）。
  - 组件导出名：`Spinner` / `GithubIcon`（brand-icons）/ `Tooltip`+`TooltipTrigger`+`TooltipContent` / `IconButton` / `Textarea` / `Label` 均与计划一致；`TooltipTrigger render={<IconButton/>}` 用法与 `media-row-actions.tsx` 现网写法一致。
  - i18n 类型：`LocaleMessages` 位于 `apps/web/src/lib/i18n/locale-messages.ts`，主题文件头 `import type { LocaleMessages } from "./locale-messages"`，en 尾部 `} as const satisfies LocaleMessages<typeof zh>`（计划中 projects.ts 已照此格式）。
