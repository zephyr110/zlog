# 文章前台可见性开关（Post visibility）— 设计

日期：2026-11-09 · 状态：已确认（设计评审通过，待实施）

后台文章模块新增「在前端展示」开关。关闭后，文章仍算「已发布」（不改 `draft`、不清 `publish_at`、不影响定时），但从前台所有页面消失：首页、列表、归档、时间线、系列、标签/主题、搜索、RSS、sitemap、OG 图、相关推荐，直链返回 404。后台保留「已隐藏」徽章与独立筛选项。

## Goals

- `posts.visible` 布尔列（默认展示），并入唯一的公开可见性谓词 `PUBLISHED_SQL`。
- 文章列表行内可隐藏/恢复；编辑器状态栏可设置；两处均即时生效。
- 后台列表显示「已隐藏」徽章，并提供「已隐藏」筛选标签。
- 隐藏文章在后台仍计入「已发布」筛选与统计，语义与草稿/定时完全正交。
- 中英文 i18n、数据库与前端纯函数测试同步更新。

## Non-goals

- 不记录「何时隐藏」（不加 `hidden_at`），不做隐藏操作审计。
- 不拦截隐藏文章历史评论的读取接口（文章页 404 后前台已无入口）。
- 文章导出（`site-export` frontmatter）不增加可见性字段（当前无导入链路）。
- 不缩短搜索/OG/导航计数的既有缓存 TTL，不做 GitHub Pages 即时重建。
- 不新增独立的 admin 路由，复用 `PATCH /api/posts`。

## 核心语义

1. **隐藏 ≠ 草稿。** `draft` 与 `visible` 正交：草稿本身不展示；隐藏的文章可以是已发布、定时或草稿状态。
2. **可见性不参与文章保存。** `savePost` 的 UPSERT 对 `visible` 是 INSERT-only（同 `pinned_at` 的防覆盖设计），修改只走专用 `setPostVisible`。这样编辑器 30 秒自动保存不会用旧标签页里的状态覆盖另一处刚做的隐藏/恢复。
3. **切换即时生效。** 列表与编辑器的开关都直接 `PATCH /api/posts`，不改「未保存修改」基线，不依赖保存按钮。
4. **版本恢复不改变可见性。** 历史快照不因开关产生；恢复某版内容后，文章维持当前的展示/隐藏状态。
5. **后台归类不变。** 「已发布」筛选与仪表盘统计仍把隐藏文章算作已发布；隐藏文章额外出现在「已隐藏」筛选里。
6. **生效时延。** ISR 页面在 PATCH 后立即失效重生成；HTML CDN 最多 60 秒；搜索 API 60 秒；OG 图最长 1 天；导航标签计数最多 1 小时；GitHub Pages 静态镜像需下一次 CI 构建。与现有草稿/发布语义一致。

## 1. 数据层

### 1.1 `posts` 加列

`packages/database/src/content.ts`：

- `SCHEMA` 的 `posts` 增加 `visible INTEGER NOT NULL DEFAULT 1`。
- `ensureTable` 的幂等 ALTER 循环增加 `"visible INTEGER NOT NULL DEFAULT 1"`（沿用 duplicate-column 忽略模式，`content.ts:50-57`）。
- 公开谓词：

```ts
const PUBLISHED_SQL =
  "visible = 1 AND draft = 0 AND (publish_at IS NULL OR publish_at <= datetime('now'))"
```

- `savePost` 的 INSERT 列清单与 VALUES 增加 `visible`；`ON CONFLICT DO UPDATE SET` **不包含** `visible`，并在既有 `pinned_at` 注释处补充原因。
- 新增专用 setter（照 `setPostPinned`，`content.ts:298-326`）：

```ts
export async function setPostVisible(
  slug: string,
  visible: boolean
): Promise<Post | null>
```

  - 文章不存在返回 `null`。
  - 状态未变时直接返回现有行（幂等，不刷 `updated_at`）。
  - 变化时 `UPDATE posts SET visible = ?, updated_at = datetime('now') WHERE slug = ? RETURNING *`，成功后 `scheduleSync()`。
  - 从 `packages/database/src/index.ts` 导出。

`packages/core/src/types.ts`：

- `Post` 与 `PostSummary` 增加 `visible: boolean`。

`packages/database/src/post-row.ts`：

- `rowToPost`：`visible: row.visible == null ? true : Boolean(row.visible)`（缺列/旧行兜底展示，避免迁移未到时误隐藏）。
- `toParams`：`visible: post.visible ? 1 : 0`。

`packages/core/src/mdx-utils.ts`：

- `toPostSummary` 透传 `visible`。

### 1.2 `post_revisions` 同步

`packages/database/src/revisions.ts`：

- 表 DDL 增加 `visible INTEGER NOT NULL DEFAULT 1`。
- `ensureTable` 目前只有 `executeMultiple`、没有 ALTER 循环；补上与 posts 相同的幂等 ALTER（仅针对 `visible`）。
- `insertPostRevision` 的显式列清单与参数增加 `visible`（快照保持同构）。
- `samePostContent` **不比较** `visible`——可见性是发布控制，不算内容变化，与 `pinnedAt` 同理，避免开关产生无意义快照。
- 恢复快照走 `savePost`，因 `visible` 在更新路径上不写回，恢复后自然保持当前展示状态，路由无需改动。

## 2. 可见性判定函数

`apps/web/src/lib/schedule.ts` 拆成两个函数：

```ts
/** 发布状态：草稿/定时之外即「已发布」；后台筛选与统计用。 */
export function isPublished(p: { draft: boolean; publishAt?: string | null }): boolean

/** 前台实际可见：已发布且未被隐藏；评论校验等公开行为用。 */
export function isPublic(p: {
  draft: boolean
  publishAt?: string | null
  visible?: boolean
}): boolean
```

调用点调整：

| 位置 | 现在 | 改为 |
|---|---|---|
| `admin/dashboard/page.tsx:45` | `isPublic` | `isPublished` |
| `components/admin/post-stats.tsx:105` | `isPublic` | `isPublished` |
| `admin/posts/page.tsx:152`「已发布」筛选 | `isPublic` | `isPublished` |
| `api/comments/route.ts:171` 评论提交校验 | `isPublic` | 保持 `isPublic`（隐藏文章不再接受新评论） |

`apps/web/src/app/posts/[slug]/page.tsx:98` 兜底改为：

```ts
if (!post || post.draft || !post.visible) notFound()
```

## 3. 后台 API

`apps/web/src/app/api/posts/route.ts`：

- `PATCH` 的 zod schema 增加 `visible: z.boolean().optional()`，refine 条件改为 `draft`/`pinned`/`visible` 至少一项。
- 新增分支：`visible !== undefined` 时调用 `setPostVisible(slug, visible)`，返回更新后的 post，404 处理与现有分支一致。
- 现有 `revalidatePath("/", "layout")`（`route.ts:299`）已覆盖全站 ISR，无需新增失效点。
- `POST` / `PUT` 的请求体不增加 `visible`，但服务端构造的 `Post` 对象必须满足必填字段：`POST` 新建时显式 `visible: true`；`PUT` 沿用 `existingPost.visible`（合并逻辑已保留）。保存 SQL 的更新路径不触碰可见性，所以即使编辑器读到旧值也不会覆盖开关。
- 后台列表 `GET ?includeDrafts=true` 不变，隐藏文章照常可管理、可编辑、可导出。

## 4. 后台 UI

### 4.1 文章列表 `apps/web/src/app/admin/posts/page.tsx`

- `statusFilter` 联合类型增加 `"hidden"`；初始值解析与 URL 同步支持 `?status=hidden`；筛选逻辑 `result.filter((p) => !p.visible)`（包含「先隐藏、后转草稿」的文章；与「已发布」「草稿」等状态标签互为交叉，不做互斥）。
- 状态标签页数组增加「已隐藏」。
- `StatusBadge`：保留现有草稿/定时/已发布徽章，`!post.visible` 时在旁边追加中性色「已隐藏」徽章（EyeOff 图标）。移动端卡片与桌面表格共用，自动生效。
- 行操作菜单（`renderPostActions`）在「转为草稿/发布」之后增加，仅对非草稿文章显示：

  - 展示中：「在前端隐藏」（EyeOff）
  - 已隐藏：「恢复展示」（Eye）

  点击走 `PATCH { visible: !current }`，成功后就地更新 `visible` 并 toast；失败提示 `admin.updateFailed` / `admin.networkError`。
- 新增 `handleToggleVisible`，结构复用 `handleTogglePin`（乐观更新 + 失败提示）。切换后若当前筛选是「已隐藏」，恢复的文章会自动移出列表，既有分页越界修正逻辑已覆盖。

### 4.2 编辑器 `apps/web/src/components/admin/post-editor.tsx`

- 状态增加 `visible`（`initialPost?.visible ?? true`）。
- 状态栏（`Status + schedule` 卡片，约 872 行）内增加一行「在前端展示」`Switch` + 说明文字：

  - 新文章不渲染该控件（尚无 slug 可 PATCH）。
  - 草稿：控件禁用，提示「草稿不会在前台展示，发布后可设置」。
  - 非草稿：切换立即 `PATCH /api/posts?slug=<persistedSlug>`；先乐观更新，失败回滚并 toast。
  - 该状态不进入 `savedSnapshotRef`、不进入保存请求体，避免自动保存覆盖。
- 「查看线上」链接条件从 `!isNew && !draft && !scheduled` 收紧为再 `&& visible`（`post-editor.tsx:729`）。
- 草稿/定时状态徽章保持不动；隐藏状态由开关与状态栏旁的「已隐藏」提示表达。

### 4.3 i18n `apps/web/src/lib/i18n/admin.ts`

中英文各增加（命名可微调，两语言必须同键）：

- `showOnFrontend`「在前端展示」/ "Show on frontend"
- `showOnFrontendHint`「关闭后，文章会从首页、列表、搜索、RSS 和 sitemap 等所有前台页面隐藏，直链返回 404。」
- `draftVisibilityHint`「草稿不会在前台展示，发布后可设置此开关。」
- `hidden`「已隐藏」/ "Hidden"
- `hideFromFrontend`「在前端隐藏」/ "Hide from frontend"
- `restoreToFrontend`「恢复展示」/ "Show on frontend"
- `hideSuccess`「已从前端隐藏」/ "Hidden from the frontend"
- `showSuccess`「已恢复前台展示」/ "Visible on the frontend again"

## 5. 前台与缓存

- 前台页面零改动：所有公开查询经由 `PUBLISHED_SQL` 自动过滤。
- 隐藏后直接结果：详情/OG 404，RSS/sitemap/搜索/相关推荐/标签计数消失，新评论被拒。
- 主动失效：复用 PATCH 已有的 `revalidatePath("/", "layout")`。
- 既有 TTL 残留（不在本次范围）：HTML CDN 60s、搜索 API 60s、OG 图 1 天、导航标签 1 小时、GitHub Pages 至下次构建。

## 6. 测试

`packages/database/test/content-visibility.test.ts`：

- 已发布 + 隐藏：不出现在 `getAllPosts(false)`、`getPublishedCount`、`searchPublishedPosts`、`getHomepageLatestPosts`、`getAllTags`，公开 `getPostBySlug` 返回 `null`；`getAllPosts(true)` 仍包含。
- `setPostVisible`：隐藏/恢复持久化；重复设置幂等；文章不存在返回 `null`。
- 组合矩阵：隐藏 + 草稿、隐藏 + 定时；恢复展示后重新出现在公开查询。
- `savePost` 更新不覆盖 `visible`（模拟编辑器全量保存）。

`packages/database/test/revisions.test.ts`：

- 可见性不同不产生快照（`samePostContent` 忽略 `visible`）。
- 恢复历史后当前 `visible` 保持不变。

`apps/web/test/schedule.test.ts`：

- `isPublished` 忽略 `visible`；`isPublic` 在 `visible: false` 时为 false；缺省 `visible` 视为可见。

实施完成后运行：`pnpm test`、`pnpm check`（ESLint + `tsc --noEmit`）。

## 7. 验收标准

- 后台列表对已发布文章执行「在前端隐藏」后，首页、`/posts/<slug>`、归档、时间线、系列、标签、主题、搜索、RSS、sitemap、OG 均不再出现该文章；直链 404。
- 后台「已发布」筛选与仪表盘「已发布」计数不因隐藏而变化；文章带「已隐藏」徽章，并出现在「已隐藏」筛选中。
- 编辑器开关与列表开关互不覆盖；30 秒自动保存不会把隐藏状态改回去。
- 草稿、定时发布、置顶、版本恢复的既有行为与测试不变。
- `pnpm test` 与 `pnpm check` 通过。

## 8. 风险与备注

- 旧库迁移依赖 `ensureTable` 的 ALTER；`rowToPost` 对缺列兜底为可见，迁移失败也不会误隐藏全部文章。
- `post_revisions` 此前没有 ALTER 逻辑，本次补齐 `visible` 一列，不顺手改其他列。
- 编辑器的「未保存修改」基线不包含可见性：切换开关后即已生效，不应触发离开提示。
- GitHub Pages 静态镜像是构建时快照，隐藏不会立即反映到该镜像（与草稿一致）。
