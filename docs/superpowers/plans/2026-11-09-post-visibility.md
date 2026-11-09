# 文章前台可见性开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在后台文章模块新增「在前端展示」开关；隐藏后文章仍算已发布，但从前台所有页面消失。

**Architecture:** `posts` 增加 `visible` 布尔列并并入唯一的公开谓词 `PUBLISHED_SQL`，一处覆盖首页/详情/归档/时间线/系列/标签/搜索/RSS/sitemap/OG/相关推荐。可见性不参与文章保存（INSERT-only），只经专用 `setPostVisible` 修改；后台列表与编辑器通过 `PATCH /api/posts` 即时切换。

**Tech Stack:** pnpm workspace、TypeScript、Next.js 16（App Router）、Vitest、libsql/SQLite、shadcn/ui + Base UI Switch。

## Global Constraints

- 所有命令在仓库根目录执行；包管理只用 pnpm（`packageManager: pnpm@11.14.0`）。
- 提交信息用中文 Conventional Commits（仓库现有风格，如 `feat(web): …`）。
- `visible` 在 `savePost` 的 UPSERT 中是 INSERT-only；只能通过 `setPostVisible` 修改。
- 后台「已发布」筛选与统计用 `isPublished`（忽略 `visible`）；前台可见性/评论校验用 `isPublic`（包含 `visible`）。
- 中英文 i18n 必须同键；`apps/web/scripts/check-i18n.mjs` 是硬门禁。
- 每个任务结束前跑该任务的测试与类型检查，并单独提交。
- 设计依据：`docs/superpowers/specs/2026-11-09-post-visibility-design.md`（已提交）。

---

## File Structure

| 文件 | 职责 | 任务 |
|---|---|---|
| `packages/core/src/types.ts` | `Post` / `PostSummary` 增加 `visible` | 1 |
| `packages/core/src/mdx-utils.ts` | `toPostSummary` 透传 `visible` | 1 |
| `packages/database/src/post-row.ts` | 行列映射（posts 与 revisions 共用） | 1 |
| `packages/database/src/content.ts` | 建表/迁移、`PUBLISHED_SQL`、`savePost`、`setPostVisible` | 1 |
| `packages/database/src/index.ts` | 导出 `setPostVisible` | 1 |
| `packages/database/test/content-visibility.test.ts` | 公开可见性矩阵与 setter 测试 | 1 |
| `packages/database/src/revisions.ts` | 快照表加列、迁移、写入映射 | 2 |
| `packages/database/test/revisions.test.ts` | 可见性与快照/恢复的交互 | 2 |
| `apps/web/src/lib/schedule.ts` | `isPublished` / `isPublic` 拆分 | 3 |
| `apps/web/test/schedule.test.ts` | 判定函数测试 | 3 |
| `apps/web/src/app/admin/dashboard/page.tsx` | 统计改用 `isPublished` | 3 |
| `apps/web/src/components/admin/post-stats.tsx` | 统计改用 `isPublished` | 3 |
| `apps/web/src/app/posts/[slug]/page.tsx` | 详情页兜底拦隐藏文章 | 3 |
| `apps/web/src/app/api/posts/route.ts` | POST 默认可见；PATCH 支持 `visible` | 1（POST）/ 4（PATCH） |
| `apps/web/src/lib/i18n/admin.ts` | 中英文文案 | 5 |
| `apps/web/src/app/admin/posts/page.tsx` | 徽章、筛选、行内开关 | 6 |
| `apps/web/src/components/admin/post-editor.tsx` | 编辑器开关、查看线上条件 | 7 |
| `apps/web/test/{site-export,search,related,series}.test.ts` | 测试 fixture 补 `visible` | 1 |

---

### Task 1: 数据库列、类型与公开谓词

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/mdx-utils.ts`
- Modify: `packages/database/src/post-row.ts`
- Modify: `packages/database/src/content.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/database/test/content-visibility.test.ts`
- Modify: `packages/database/test/revisions.test.ts`（仅 fixture）
- Modify: `apps/web/test/site-export.test.ts`、`apps/web/test/search.test.ts`、`apps/web/test/related.test.ts`、`apps/web/test/series.test.ts`（仅 fixture）
- Modify: `apps/web/src/app/api/posts/route.ts`（仅 POST 构造的 Post 对象）

**Interfaces:**
- Produces: `Post.visible: boolean`、`PostSummary.visible: boolean`、`setPostVisible(slug: string, visible: boolean): Promise<Post | null>`（从 `@zlog/database` 导出）。
- Produces: 公开谓词 `visible = 1 AND draft = 0 AND (publish_at IS NULL OR publish_at <= datetime('now'))`。

- [ ] **Step 1: 先写失败测试**

在 `packages/database/test/content-visibility.test.ts` 中：

1. `mkPost` 的返回对象在 `draft: false` 后加 `visible: true,`。
2. `beforeAll` 末尾追加一条隐藏文章：

```ts
  await content.savePost(
    mkPost("hidden", {
      date: "2026-01-06",
      visible: false,
      tags: ["Secret"],
      content: "vault body",
    })
  )
```

3. 把 `getAllPosts(includeDrafts)` 的期望数组补上 `"hidden"`：

```ts
    expect(slugs.sort()).toEqual(
      ["draft", "draft-scheduled", "flip", "future", "hidden", "live", "past"].sort()
    )
```

4. 文件末尾追加：

```ts
describe("hidden posts (visible = 0)", () => {
  it("public readers never see a hidden post", async () => {
    expect(await content.getPostBySlug("hidden")).toBeNull()
    expect((await content.getAllPosts()).map((p) => p.slug)).not.toContain(
      "hidden"
    )
    expect(
      (await content.getHomepageLatestPosts(10)).map((p) => p.slug)
    ).not.toContain("hidden")
  })

  it("admin readers still get it", async () => {
    const post = await content.getPostBySlug("hidden", true)
    expect(post?.visible).toBe(false)
  })

  it("hidden tags and bodies stay out of tags and search", async () => {
    expect(await content.getAllTags()).not.toContain("secret")
    expect(await content.searchPublishedPosts(["vault"])).toEqual([])
  })
})

describe("setPostVisible", () => {
  it("hides and restores a live post across public queries", async () => {
    const slug = "visibility-toggle"
    await content.savePost(mkPost(slug, { date: "2026-01-07" }))
    expect(await content.getPostBySlug(slug)).not.toBeNull()

    const hidden = await content.setPostVisible(slug, false)
    expect(hidden?.visible).toBe(false)
    expect(await content.getPostBySlug(slug)).toBeNull()
    expect((await content.getAllPosts()).map((p) => p.slug)).not.toContain(slug)

    const shown = await content.setPostVisible(slug, true)
    expect(shown?.visible).toBe(true)
    expect(await content.getPostBySlug(slug)).not.toBeNull()
  })

  it("is idempotent when the state already matches", async () => {
    const slug = "visibility-idempotent"
    await content.savePost(mkPost(slug))
    const same = await content.setPostVisible(slug, true)
    expect(same?.visible).toBe(true)
  })

  it("returns null for a missing post", async () => {
    expect(await content.setPostVisible("no-such-post", false)).toBeNull()
  })

  it("savePost updates do not overwrite visibility", async () => {
    const slug = "visibility-immutable"
    await content.savePost(mkPost(slug, { visible: false }))
    await content.savePost(
      mkPost(slug, { visible: true, content: "changed body" })
    )
    const stored = await content.getPostBySlug(slug, true)
    expect(stored?.visible).toBe(false)
    expect(stored?.content).toBe("changed body")
  })
})
```

同时给以下 fixture 在 `draft: false,` 后加 `visible: true,`（保持仓库可编译）：

- `packages/database/test/revisions.test.ts` 的 `mkPost`
- `apps/web/test/site-export.test.ts` 的 `mkPost`
- `apps/web/test/search.test.ts` 的 `mkPost`
- `apps/web/test/related.test.ts` 的 `mkPost`
- `apps/web/test/series.test.ts` 的 `mkPost`

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @zlog/database exec vitest run test/content-visibility.test.ts
```

Expected: FAIL —— `content.setPostVisible is not a function`，且 `hidden` 相关断言失败（公开查询仍能看到它）。

- [ ] **Step 3: 实现最小数据层**

`packages/core/src/types.ts` —— `Post` 和 `PostSummary` 都在 `draft: boolean` 后加：

```ts
  /** 是否在前台展示；false 时所有公开页面都不出现，但不改变发布语义。 */
  visible: boolean
```

`packages/core/src/mdx-utils.ts` —— `toPostSummary` 的 `draft` 后加：

```ts
    visible: post.visible,
```

`packages/database/src/post-row.ts`：

```ts
    draft: Boolean(row.draft),
    // 旧库/旧快照缺列时默认展示，避免迁移未到时误隐藏全部文章。
    visible: row.visible == null ? true : Boolean(row.visible),
```

`toParams` 在 `draft` 后加：

```ts
    visible: post.visible ? 1 : 0,
```

`packages/database/src/content.ts`：

1. `SCHEMA` 的 `posts` 表在 `draft` 后加列：

```sql
  visible INTEGER NOT NULL DEFAULT 1,
```

2. `ensureTable` 的迁移列数组改为：

```ts
      for (const column of [
        "pinned_at TEXT",
        "publish_at TEXT",
        "visible INTEGER NOT NULL DEFAULT 1",
      ]) {
```

3. 替换公开谓词及其注释：

```ts
/** Public visibility, in one place: on the frontend, not a draft, and
 *  either unscheduled or past its publish time. publish_at shares the
 *  "YYYY-MM-DD HH:MM:SS" UTC format of datetime('now'), so the
 *  comparison is exact. */
const PUBLISHED_SQL =
  "visible = 1 AND draft = 0 AND (publish_at IS NULL OR publish_at <= datetime('now'))"
```

4. `savePost` 的 UPSERT 增加列与参数，并扩展注释：

```ts
  // pinned_at and visible are written on INSERT only. Updates must not
  // touch them — pin / hide / show go through their dedicated setters,
  // and editor/auto-save RMW must not clobber a newer value with a stale
  // one from a prior read. publish_at, by contrast, is the editor's to
  // change on every save.
  const upsert = {
    sql: `INSERT INTO posts (slug, title, date, updated, tags, description, cover, draft, visible, pinned_at, publish_at, content, word_count, reading_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET
            title=excluded.title, date=excluded.date, updated=excluded.updated,
            tags=excluded.tags, description=excluded.description, cover=excluded.cover,
            draft=excluded.draft, publish_at=excluded.publish_at, content=excluded.content,
            word_count=excluded.word_count, reading_time=excluded.reading_time,
            updated_at=datetime('now')`,
    args: [
      p.slug,
      p.title,
      p.date,
      p.updated,
      p.tags,
      p.description,
      p.cover,
      p.draft,
      p.visible,
      p.pinned_at,
      p.publish_at,
      p.content,
      p.word_count,
      p.reading_time,
    ],
  }
```

5. 在 `setPostPinned` 之后新增：

```ts
export async function setPostVisible(
  slug: string,
  visible: boolean
): Promise<Post | null> {
  const db = requireDb()
  await ensureTable(db)
  const clean = safeSlug(slug)
  const existing = await getPostBySlug(clean, true)
  if (!existing) return null

  // Idempotent: re-affirming the current state must not bump updated_at.
  if (visible === existing.visible) return existing

  const result = await db.execute({
    sql: `UPDATE posts SET visible = ?, updated_at = datetime('now') WHERE slug = ? RETURNING *`,
    args: [visible ? 1 : 0, clean],
  })
  const row = result.rows[0]
  if (row) scheduleSync()
  return row ? rowToPost(row) : null
}
```

`packages/database/src/index.ts` —— `setPostPinned,` 后加：

```ts
  setPostVisible,
```

`apps/web/src/app/api/posts/route.ts` —— POST 构造的 `post` 对象在 `draft` 后加：

```ts
    visible: true,
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm --filter @zlog/database exec vitest run test/content-visibility.test.ts
```

Expected: PASS（该文件全部用例通过）。

- [ ] **Step 5: 类型检查**

Run:

```bash
pnpm --filter @zlog/web typecheck
```

Expected: 通过（fixture 与 API 的 `Post` 构造已同步）。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/types.ts packages/core/src/mdx-utils.ts \
  packages/database/src/post-row.ts packages/database/src/content.ts \
  packages/database/src/index.ts packages/database/test/content-visibility.test.ts \
  packages/database/test/revisions.test.ts apps/web/test/site-export.test.ts \
  apps/web/test/search.test.ts apps/web/test/related.test.ts \
  apps/web/test/series.test.ts apps/web/src/app/api/posts/route.ts
git commit -m "feat(db): 文章新增前台可见性字段与公开谓词"
```

---

### Task 2: 版本快照兼容

**Files:**
- Modify: `packages/database/src/revisions.ts`
- Modify: `packages/database/test/revisions.test.ts`

**Interfaces:**
- Consumes: `Post.visible`、`setPostVisible`（Task 1）。
- Produces: `post_revisions.visible` 列与幂等迁移；快照写入包含 `visible`，但 `samePostContent` 忽略它，恢复不改变当前可见性。

- [ ] **Step 1: 先写失败测试**

在 `packages/database/test/revisions.test.ts` 末尾追加：

```ts
describe("可见性与版本历史", () => {
  it("切换可见性不产生快照", async () => {
    const slug = "rev-visibility-toggle"
    await content.savePost(mkPost(slug, { content: "v1" }))
    await content.setPostVisible(slug, false)

    expect(await revisions.listPostRevisions(slug)).toHaveLength(0)
  })

  it("恢复历史内容不改变当前可见性", async () => {
    const slug = "rev-visibility-restore"
    await content.savePost(mkPost(slug, { content: "v1" }))
    await content.savePost(mkPost(slug, { content: "v2" }))

    const list = await revisions.listPostRevisions(slug)
    const revision = await revisions.getPostRevision(list[0].id)
    expect(revision).not.toBeNull()

    await content.setPostVisible(slug, false)
    // 路由的恢复路径就是 savePost(revision)。
    await content.savePost(revision!)

    const stored = await content.getPostBySlug(slug, true)
    expect(stored?.content).toBe("v1")
    expect(stored?.visible).toBe(false)
  })

  it("samePostContent 忽略 visible", () => {
    expect(
      revisions.samePostContent(
        mkPost("same", { visible: true }),
        mkPost("same", { visible: false })
      )
    ).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @zlog/database exec vitest run test/revisions.test.ts
```

Expected: FAIL —— `post_revisions` 没有 `visible` 列，插入/读取时报错或断言失败。

- [ ] **Step 3: 实现快照兼容**

`packages/database/src/revisions.ts`：

1. `SCHEMA` 的 `post_revisions` 表在 `draft` 后加：

```sql
  visible INTEGER NOT NULL DEFAULT 1,
```

2. `ensureTable` 补迁移（该表此前没有 ALTER 逻辑）：

```ts
async function ensureTable(db: Client): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.executeMultiple(SCHEMA)
      try {
        await db.execute(
          "ALTER TABLE post_revisions ADD COLUMN visible INTEGER NOT NULL DEFAULT 1"
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/duplicate column/i.test(msg)) throw err
      }
    })().catch((err) => {
      tableReady = null // 失败重置，下次调用重试
      throw err
    })
  }
  return tableReady
}
```

3. `insertPostRevision` 的列清单与参数加 `visible`：

```ts
    sql: `INSERT INTO post_revisions
            (slug, title, date, updated, tags, description, cover, draft, visible, pinned_at, publish_at, content, word_count, reading_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      slug,
      p.title,
      p.date,
      p.updated,
      p.tags,
      p.description,
      p.cover,
      p.draft,
      p.visible,
      p.pinned_at,
      p.publish_at,
      p.content,
      p.word_count,
      p.reading_time,
    ],
```

4. `samePostContent` 的注释补一句（逻辑不变）：

```ts
/** 是否值得存快照：内容字段逐项比对。pinnedAt / visible 不参与——
 *  置顶与前台可见性各有专用 setter，编辑保存不触碰它们；把这类
 *  开关变化算作"内容变化"会让自动保存反复生成快照。 */
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm --filter @zlog/database exec vitest run test/revisions.test.ts test/content-visibility.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/database/src/revisions.ts packages/database/test/revisions.test.ts
git commit -m "feat(db): 版本快照兼容文章可见性"
```

---

### Task 3: 前端判定函数与调用点

**Files:**
- Modify: `apps/web/src/lib/schedule.ts`
- Modify: `apps/web/test/schedule.test.ts`
- Modify: `apps/web/src/app/admin/dashboard/page.tsx`
- Modify: `apps/web/src/components/admin/post-stats.tsx`
- Modify: `apps/web/src/app/admin/posts/page.tsx`（仅 import 与「已发布」筛选）
- Modify: `apps/web/src/app/posts/[slug]/page.tsx`

**Interfaces:**
- Produces: `isPublished(p): boolean`、`isPublic(p): boolean`（后者包含 `visible !== false`）。

- [ ] **Step 1: 先写失败测试**

`apps/web/test/schedule.test.ts` 的 import 改为：

```ts
import {
  fromPublishAtUtc,
  isPublic,
  isPublished,
  isScheduled,
  toPublishAtUtc,
} from "@/lib/schedule"
```

文件末尾追加：

```ts
describe("isPublished", () => {
  it("is true for live posts regardless of visibility", () => {
    expect(isPublished({ draft: false, publishAt: null })).toBe(true)
    expect(
      isPublished({ draft: false, publishAt: "2020-01-01 00:00:00" })
    ).toBe(true)
    const hidden = { draft: false, publishAt: null, visible: false }
    expect(isPublished(hidden)).toBe(true)
  })

  it("is false for drafts and future-scheduled posts", () => {
    expect(isPublished({ draft: true })).toBe(false)
    expect(
      isPublished({ draft: false, publishAt: "2999-01-01 00:00:00" })
    ).toBe(false)
  })
})

describe("isPublic", () => {
  it("treats a missing visible flag as visible", () => {
    expect(isPublic({ draft: false, publishAt: null })).toBe(true)
  })

  it("is false when the post is hidden", () => {
    expect(
      isPublic({ draft: false, publishAt: null, visible: false })
    ).toBe(false)
  })

  it("is false for drafts and future-scheduled posts", () => {
    expect(isPublic({ draft: true, visible: true })).toBe(false)
    expect(
      isPublic({
        draft: false,
        publishAt: "2999-01-01 00:00:00",
        visible: true,
      })
    ).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @zlog/web exec vitest run test/schedule.test.ts
```

Expected: FAIL —— `isPublished` is not a function。

- [ ] **Step 3: 实现判定拆分**

`apps/web/src/lib/schedule.ts` 在 `isPublic` 前新增：

```ts
/** 发布状态：草稿/定时之外即「已发布」。后台筛选项与统计使用它，
 *  hidden 文章仍算已发布；前台的 isPublic 在其基础上再叠加可见性。 */
export function isPublished(p: {
  draft: boolean
  publishAt?: string | null
}): boolean {
  return !p.draft && !isScheduled(p.publishAt)
}
```

把 `isPublic` 替换为：

```ts
/** Client-side mirror of the server's PUBLISHED_SQL predicate (visible,
 *  not a draft, not scheduled) — the two must stay in sync; this one just
 *  uses the browser clock. */
export function isPublic(p: {
  draft: boolean
  publishAt?: string | null
  visible?: boolean
}): boolean {
  return p.visible !== false && isPublished(p)
}
```

调用点：

- `apps/web/src/app/admin/dashboard/page.tsx:15`：`import { isPublished, isScheduled } from "@/lib/schedule"`；`posts.filter(isPublic)` 改为 `posts.filter(isPublished)`。
- `apps/web/src/components/admin/post-stats.tsx:5`：`import { isPublished } from "@/lib/schedule"`；`posts.filter(isPublic)` 改为 `posts.filter(isPublished)`。
- `apps/web/src/app/admin/posts/page.tsx:42`：`import { isPublished, isScheduled } from "@/lib/schedule"`；`result.filter(isPublic)`（第 152 行）改为 `result.filter(isPublished)`。
- `apps/web/src/app/posts/[slug]/page.tsx:98`：

```ts
  if (!post || post.draft || !post.visible) notFound()
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm --filter @zlog/web exec vitest run test/schedule.test.ts
```

Expected: PASS。

- [ ] **Step 5: 类型检查**

Run:

```bash
pnpm --filter @zlog/web typecheck
```

Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/lib/schedule.ts apps/web/test/schedule.test.ts \
  apps/web/src/app/admin/dashboard/page.tsx \
  apps/web/src/components/admin/post-stats.tsx \
  apps/web/src/app/admin/posts/page.tsx \
  apps/web/src/app/posts/\[slug\]/page.tsx
git commit -m "feat(web): 拆分已发布与前台可见判定"
```

---

### Task 4: PATCH 接口支持可见性

**Files:**
- Modify: `apps/web/src/app/api/posts/route.ts:239-301`

**Interfaces:**
- Consumes: `setPostVisible`（Task 1）。
- Produces: `PATCH /api/posts?slug=xxx` 接受 `{ visible: boolean }`，返回 `{ post }`。

- [ ] **Step 1: 修改 PATCH（本仓库无路由级测试基线，以类型检查与最终验收覆盖）**

`apps/web/src/app/api/posts/route.ts`：

1. import 列表在 `setPostPinned,` 后加 `setPostVisible,`。
2. PATCH 的 zod schema 替换为：

```ts
  const parseResult = z
    .object({
      draft: z.boolean().optional(),
      pinned: z.boolean().optional(),
      visible: z.boolean().optional(),
    })
    .refine(
      (b) =>
        b.draft !== undefined ||
        b.pinned !== undefined ||
        b.visible !== undefined,
      {
        message: "draft, pinned or visible is required",
      }
    )
    .safeParse(await request.json())
```

3. 解构改为 `const { draft, pinned, visible } = parseResult.data`。
4. 在 `pinned` 分支之后、`revalidatePath` 之前插入：

```ts
  if (visible !== undefined) {
    updatedPost = await setPostVisible(slug, visible)
    if (!updatedPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }
  }
```

- [ ] **Step 2: 类型检查**

Run:

```bash
pnpm --filter @zlog/web typecheck
```

Expected: 通过。

- [ ] **Step 3: Lint**

Run:

```bash
pnpm --filter @zlog/web lint
```

Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/app/api/posts/route.ts
git commit -m "feat(web): 文章 PATCH 支持可见性开关"
```

---

### Task 5: 中英文文案

**Files:**
- Modify: `apps/web/src/lib/i18n/admin.ts`

**Interfaces:**
- Produces: 8 个新键（中英文同名），供 Task 6/7 使用。

- [ ] **Step 1: 中文词典加键**

在 `apps/web/src/lib/i18n/admin.ts` 的中文块（`const zh = {`）里，`publishedDesc` 之后插入：

```ts
showOnFrontend: "在前端展示",
showOnFrontendHint:
  "关闭后，文章会从首页、列表、搜索、RSS 和 sitemap 等所有前台页面隐藏，直链返回 404。",
draftVisibilityHint: "草稿不会在前台展示，发布后可设置此开关。",
hidden: "已隐藏",
hiddenDesc: "这篇文章已从所有前台页面隐藏。",
hideFromFrontend: "在前端隐藏",
restoreToFrontend: "恢复展示",
hideSuccess: "已从前端隐藏",
showSuccess: "已恢复前台展示",
```

- [ ] **Step 2: 英文词典加同名键**

在英文块（`const en = {`）对应的 `publishedDesc` 之后插入：

```ts
showOnFrontend: "Show on frontend",
showOnFrontendHint:
  "When off, the post is hidden from the homepage, lists, search, RSS and sitemap; direct links return 404.",
draftVisibilityHint:
  "Drafts are never shown on the frontend. Publish the post to use this switch.",
hidden: "Hidden",
hiddenDesc: "This post is hidden from every public page.",
hideFromFrontend: "Hide from frontend",
restoreToFrontend: "Show on frontend",
hideSuccess: "Hidden from the frontend",
showSuccess: "Visible on the frontend again",
```

- [ ] **Step 3: 运行 i18n 门禁**

Run:

```bash
pnpm --filter @zlog/web check:i18n
```

Expected: 通过（无缺失键）。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/lib/i18n/admin.ts
git commit -m "feat(web): 补文章可见性中英文文案"
```

---

### Task 6: 文章列表的徽章、筛选与行内开关

**Files:**
- Modify: `apps/web/src/app/admin/posts/page.tsx`

**Interfaces:**
- Consumes: `PostSummary.visible`、`PATCH /api/posts`、Task 5 的文案、`isPublished`（Task 3）。

- [ ] **Step 1: 扩展状态过滤类型与 URL 同步**

`statusFilter` 的联合类型加上 `"hidden"`：

```ts
  const [statusFilter, setStatusFilter] = useState<
    "all" | "published" | "scheduled" | "drafts" | "hidden"
  >(
    initialStatus === "published" ||
      initialStatus === "scheduled" ||
      initialStatus === "drafts" ||
      initialStatus === "hidden"
      ? initialStatus
      : "all"
  )
```

同步块（约 138-148 行）的条件同样加上 `initialStatus === "hidden"`。

- [ ] **Step 2: 筛选逻辑**

在 `filteredPosts` 中：

```ts
    if (statusFilter === "published") result = result.filter(isPublished)
    if (statusFilter === "scheduled")
      result = result.filter((p) => !p.draft && isScheduled(p.publishAt))
    if (statusFilter === "drafts") result = result.filter((p) => p.draft)
    if (statusFilter === "hidden") result = result.filter((p) => !p.visible)
```

- [ ] **Step 3: 状态徽章追加「已隐藏」**

`StatusBadge` 的返回值改为：

```tsx
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge
        variant={post.draft ? "secondary" : "default"}
        className={
          post.draft
            ? "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
            : scheduled
              ? "bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
        }
      >
        {post.draft
          ? (t("admin.draft"))
          : scheduled
            ? (t("admin.statusScheduled"))
            : (t("admin.publishedStatus"))}
      </Badge>
      {!post.visible ? (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <EyeOff className="size-3" />
          {t("admin.hidden")}
        </Badge>
      ) : null}
    </span>
  )
```

import 行加 `EyeOff`：

```tsx
import { Download, Ellipsis, Search, SquarePen, Eye, EyeOff, Globe, FilePen, Trash2, Pin } from "lucide-react"
```

- [ ] **Step 4: 新增切换 handler 与菜单项**

在 `handleTogglePin` 之后新增：

```tsx
  async function handleToggleVisible(slug: string, currentVisible: boolean) {
    const nextVisible = !currentVisible
    try {
      const res = await apiFetch(
        `/api/posts?slug=${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visible: nextVisible }),
        }
      )
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) =>
            p.slug === slug ? { ...p, visible: nextVisible } : p
          )
        )
        toast.success(
          nextVisible ? t("admin.showSuccess") : t("admin.hideSuccess")
        )
      } else {
        toast.error(t("admin.updateFailed"))
      }
    } catch {
      toast.error(t("admin.networkError"))
    }
  }
```

在 `renderPostActions` 的「发布/转为草稿」菜单项之后插入：

```tsx
          {!post.draft && (
            <DropdownMenuItem
              onClick={() => handleToggleVisible(post.slug, post.visible)}
            >
              {post.visible ? <EyeOff /> : <Eye />}
              {post.visible
                ? t("admin.hideFromFrontend")
                : t("admin.restoreToFrontend")}
            </DropdownMenuItem>
          )}
```

- [ ] **Step 5: 状态标签页加「已隐藏」**

标签数组改为：

```tsx
              {(["all", "published", "scheduled", "drafts", "hidden"] as const).map((s) => (
```

标签文案三元链末尾改为：

```tsx
                  {s === "all"
                    ? (t("admin.all"))
                    : s === "published"
                    ? (t("admin.published"))
                    : s === "scheduled"
                    ? (t("admin.statusScheduled"))
                    : s === "drafts"
                    ? (t("admin.drafts"))
                    : (t("admin.hidden"))}
```

- [ ] **Step 6: 类型检查与 lint**

Run:

```bash
pnpm --filter @zlog/web typecheck && pnpm --filter @zlog/web lint
```

Expected: 通过。

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/app/admin/posts/page.tsx
git commit -m "feat(admin): 文章列表支持隐藏与已隐藏筛选"
```

---

### Task 7: 编辑器开关与「查看线上」条件

**Files:**
- Modify: `apps/web/src/components/admin/post-editor.tsx`

**Interfaces:**
- Consumes: `PATCH /api/posts`、Task 5 文案、`Switch`（`@/components/ui/switch`）。

- [ ] **Step 1: 增加状态与 import**

顶部 import 加：

```tsx
import { Switch } from "@/components/ui/switch"
```

在 `const [draft, setDraft] = useState(initialPost?.draft ?? true)` 后加：

```tsx
  const [visible, setVisible] = useState(initialPost?.visible ?? true)
```

- [ ] **Step 2: 增加即时切换 handler**

在 `savePost` 函数之后新增：

```tsx
  /** 可见性是发布控制，不进入保存体：即时 PATCH，避免 30 秒自动保存
   *  用旧标签页里的状态覆盖刚做的隐藏/恢复。 */
  async function handleToggleVisible(nextVisible: boolean) {
    if (isNew || !persistedSlug) return
    const previous = visible
    setVisible(nextVisible)
    try {
      const res = await apiFetch(
        `/api/posts?slug=${encodeURIComponent(persistedSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visible: nextVisible }),
        }
      )
      if (!res.ok) {
        setVisible(previous)
        toast.error(t("admin.updateFailed"))
        return
      }
      const data = (await res.json()) as { post?: { visible?: boolean } }
      setVisible(data.post?.visible ?? nextVisible)
      toast.success(
        nextVisible ? t("admin.showSuccess") : t("admin.hideSuccess")
      )
    } catch {
      setVisible(previous)
      toast.error(t("admin.networkError"))
    }
  }
```

- [ ] **Step 3: 状态栏加开关**

在状态卡片的「schedule」div 之后、卡片关闭 `</div>` 之前插入：

```tsx
        {!isNew && (
          <div className="flex w-full items-start gap-3 border-t pt-3">
            <Switch
              checked={visible}
              disabled={draft || saving}
              onCheckedChange={handleToggleVisible}
              aria-label={t("admin.showOnFrontend")}
            />
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                {t("admin.showOnFrontend")}
              </p>
              <p className="text-xs text-muted-foreground">
                {draft
                  ? t("admin.draftVisibilityHint")
                  : t("admin.showOnFrontendHint")}
              </p>
            </div>
          </div>
        )}
```

同时把状态描述改为（在已发布分支里区分隐藏）：

```tsx
        <span>
          {draft
            ? (t("admin.draftDesc"))
            : scheduled
              ? (t("admin.statusScheduledDesc"))
              : visible
                ? (t("admin.publishedDesc"))
                : (t("admin.hiddenDesc"))}
        </span>
```

- [ ] **Step 4: 收紧「查看线上」条件**

约 729 行：

```tsx
        {!isNew && !draft && !scheduled && visible && (
```

- [ ] **Step 5: 类型检查与 lint**

Run:

```bash
pnpm --filter @zlog/web typecheck && pnpm --filter @zlog/web lint
```

Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/components/admin/post-editor.tsx
git commit -m "feat(admin): 编辑器支持前台展示开关"
```

---

### Task 8: 全量验证与交付

**Files:** 无新增改动（仅验证与修复若有）。

- [ ] **Step 1: 重命名分支（便于评审）**

```bash
git branch -m feat/post-visibility
```

- [ ] **Step 2: 跑全量测试**

Run:

```bash
pnpm test
```

Expected: 所有 workspace 测试通过（database / web / desktop）。

- [ ] **Step 3: 跑 lint + typecheck + i18n**

Run:

```bash
pnpm check
pnpm --filter @zlog/web check:i18n
```

Expected: 两项均通过。

- [ ] **Step 4: 自查验收清单**

逐条确认：

- [ ] 已发布文章在后台隐藏后，公开查询不再返回：首页、`/posts/<slug>`、归档、时间线、系列、标签、主题、搜索、RSS、sitemap、OG、相关推荐。
- [ ] 后台「已发布」筛选与仪表盘计数不因隐藏变化；隐藏文章带「已隐藏」徽章，并出现在「已隐藏」筛选。
- [ ] 列表与编辑器切换都即时生效，互不覆盖；编辑器自动保存 30 秒后隐藏状态不变。
- [ ] 草稿、定时发布、置顶、版本恢复的原有测试全部通过。
- [ ] 中英文文案齐全，`check:i18n` 通过。

- [ ] **Step 5: 推送并开 draft PR**

```bash
git push -u origin feat/post-visibility
gh pr create --draft --title "feat(admin): 文章前台可见性开关" --body "在后台文章模块新增「在前端展示」开关：隐藏后文章仍算已发布，但从前台所有页面消失。设计见 docs/superpowers/specs/2026-11-09-post-visibility-design.md，实施计划见 docs/superpowers/plans/2026-11-09-post-visibility.md。"
```

Expected: 分支推送成功，draft PR 创建成功。

---

## 风险与回滚

- 数据库迁移是幂等的 `ALTER TABLE … ADD COLUMN`；回滚代码不会自动删列，旧代码读取时忽略该列，数据安全。
- 若 `post_revisions` 的 ALTER 因权限/锁失败，写快照会报错并重置 `tableReady` 供重试；不会静默丢历史。
- 可见性写入只走 `setPostVisible`；任何路径若绕过它直接 UPDATE，需要同步维护。
- GitHub Pages 静态镜像不会即时反映隐藏（构建时快照），与现有草稿/发布语义一致。
