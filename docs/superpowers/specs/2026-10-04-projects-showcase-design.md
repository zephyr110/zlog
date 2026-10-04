# 项目展示模块（Projects showcase）— 设计

日期：2026-10-04 · 状态：已确认（设计评审通过，待实施）

后台新增「项目」模块：一个总开关控制前台是否展示项目页；项目条目包含标题、简介、GitHub 仓库链接、在线演示链接（选填）、封面图（选填）、技术栈标签；每条项目有独立的上架开关，并可在后台手动排序（上移/下移）。前台 `/projects` 以封面卡片网格展示。

## Goals

- 后台 `/admin/projects`：总开关 + 项目 CRUD + 每项目上架开关 + 上移/下移排序。
- 前台 `/projects`：响应式封面卡片网格（1/2/3 列）；空态兜底。
- 总开关关闭：前台导航（桌面 / 移动 / footer）无入口，`/projects` 页面不产出（404）。
- 复用现有链路：media-picker 选封面（jsdelivr CDN URL）、`optionalHttpUrl` 校验、`EmptyState` / `ConfirmDeleteDialog` / `HeaderActions` / `pageMeta` / `sidebarLinks` 范式。
- i18n 双语（zh/en）+ check-i18n 门禁。

## Non-goals

- 拖拽排序（上移/下移足够，不引入 dnd-kit）。
- 项目详情页（卡片只有外链）、富文本简介、封面裁剪器、每项目独立 SEO 页。
- 不改造现有设置页的原生 checkbox 为 Switch（超出本次范围）。

## 生效时机（关键语义）

Turso 写入对 Vercel 部署通过写后 `revalidatePath` 即时生效；GitHub Pages 静态镜像是 CI 构建时直连 Turso 烘焙的，需重新部署（push main / 手动 dispatch）后才反映。后台总开关卡片用一行小字说明这一点。与评论开关、文章发布同一语义。

## 1. 数据层

### 1.1 总开关 — `site_settings` 加列

`packages/database/src/site-settings.ts`：

- 表加 `projects_enabled INTEGER NOT NULL DEFAULT 0`；沿用现有幂等 ALTER TABLE 迁移（duplicate column 容错）。
- `SiteSettingsRecord` 加 `projectsEnabled: boolean`（`rowToRecord` 中 `!!row.projects_enabled`——旧行缺列/NULL → false）。
- `upsertSiteSettings` 的显式列列表加 `projects_enabled`（写 0/1）。
- **默认关闭**：先配好项目再开开关，避免线上出现空页面。

`apps/web/src/lib/site-config.ts` / `get-site-config.ts` / `site-config-provider.tsx`：

- `SiteConfig` 加 `projectsEnabled: boolean`；`defaultSiteConfig.projectsEnabled = false`。
- `siteConfigFromRow` / `loadCachedConfig` / `toSettingsDto` / `refreshSiteConfig` 全部带上该字段。
- `getSiteConfig` 里对 cached 值做 `?? default` 兜底（同 commentEnabled 的「跨部署旧缓存缺字段」注释）。

`apps/web/src/app/api/site-settings/route.ts`：PUT zod 加 `projectsEnabled: z.boolean().optional()`。

### 1.2 新表 — `packages/database/src/projects.ts`（照 posts/media 范式）

```sql
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
```

类型：

```ts
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

/** 服务端组装完整行所需的字段（create/update 共用）。 */
export interface ProjectInput {
  title: string
  description: string
  repoUrl: string
  demoUrl: string
  cover: string
  tags: string[]
  visible: boolean
}
```

函数（全部写后 `scheduleSync()`）：

| 函数 | 语义 |
|---|---|
| `listProjects()` | 后台：全量，`ORDER BY sort_order ASC, id ASC` |
| `listVisibleProjects()` | 前台：`WHERE visible = 1`，同排序 |
| `createProject(input)` | `sort_order = COALESCE(MIN(sort_order), 1) - 1`（新项目置顶，建完立刻看见），返回新行 |
| `updateProject(id, patch)` | 局部更新 + `updated_at = datetime('now')`，返回更新后行或 null |
| `deleteProject(id)` | 返回是否删到 |
| `moveProject(id, "up" \| "down")` | 读全表按 `(sort_order, id)` 排序 → 与相邻行交换位置 → **整表重写 `sort_order = 0..n-1`**（顺带规范化历史重复值）；已在首/末位时 no-op |

行转换 `rowToProject`：`tags` 存 JSON 字符串，`JSON.parse` 失败 / 非数组 / 非字符串元素一律容错为 `[]`（同 posts 的 tags 解析）。

## 2. API（全部 requireAuth + zod）

| 端点 | 行为 |
|---|---|
| `POST /api/admin/projects` | 新建（body 为 partial；路由层合并默认值成完整 `ProjectInput` 后调用 `createProject`） |
| `PUT /api/admin/projects/[id]` | 编辑字段（partial patch，含 `visible`） |
| `DELETE /api/admin/projects/[id]` | 删除 |
| `POST /api/admin/projects/[id]/move` | body `{ direction: "up" \| "down" }` |

校验（zod）：

- `title`: `z.string().trim().min(1).max(80)`
- `description`: `z.string().trim().max(200)`（卡片两行简介的量级）
- `repoUrl` / `demoUrl` / `cover`: 复用 `optionalHttpUrl`（防 `javascript:` 注入），允许 `""`
- `tags`: `z.array(z.string().trim().min(1).max(24)).max(8)`，服务端去重（保持首次出现顺序）
- `visible`: `z.boolean().optional()`

**提取 `optionalHttpUrl`**：现定义在 `apps/web/src/app/api/site-settings/route.ts:15` 内部，提取到 `apps/web/src/lib/url-validation.ts`，site-settings 与 projects 两处引用（行为不变）。

写后 `revalidatePath("/projects")`；总开关走 site-settings PUT 已有的 `revalidateTag(SITE_CONFIG_TAG, { expire: 0 })` + `revalidatePath("/", "layout")`。

`[id]` 动态段路由在 export 时由 `scripts/toggle-force-static.mjs` 自动 stash（`stashReason`: api + `[`），无需改脚本——但需本地 `pnpm export` 跑通验证（见 8. 测试）。

## 3. 后台 UI — `/admin/projects`

### 3.1 路由与导航注册

- `apps/web/src/components/admin/admin-sidebar.tsx`：`sidebarLinks` 在「媒体」后插 `{ href: "/admin/projects", i18nKey: "admin.projects", icon: FolderGit2 }`。
- `apps/web/src/app/admin/layout.tsx`：`pageMeta` 加 `"/admin/projects": { titleKey: "admin.projects", descKey: "admin.projectsDesc" }`。

### 3.2 页面结构（`app/admin/projects/page.tsx`，client）

从上到下：

1. **「新建项目」按钮**：`HeaderActions` portal（同文章/媒体页范式）。
2. **总开关卡片**：`Card` 内 Switch + 标题「在前台展示项目页」+ 说明「关闭后前台导航不再出现入口，/projects 页面不可访问；静态站将在下次部署后生效。」切换即保存（`PUT /api/site-settings` 只发 `projectsEnabled`，沿用 site-info-form 的「只发 touched 字段」思路），toast 成功/失败，失败回滚开关状态。
3. **项目列表**：逐行卡片（`components/admin/project-row.tsx`）。
   - 左：封面缩略图 `aspect-video w-40 rounded-md object-cover`；无封面 → 品牌渐变 + 居中 `FolderGit2` 小图标占位。
   - 中：标题（一行粗体）+ 简介（一行 `truncate`）+ 技术标签 chips（`Badge variant="secondary"` 小号）。
   - 右（操作区）：可见性 `Switch`（就地切换、乐观更新、失败回滚 + toast）→ 上移/下移（`IconButton` + tooltip，首行禁上移、末行禁下移）→ 编辑 → 删除（`ConfirmDeleteDialog`，标题带项目名）。
   - 隐藏中的项目：整行 `opacity-60` + 封面 `grayscale`，一眼区分。
4. **空态**：`EmptyState`（icon `FolderGit2`，「还没有项目」+「新建第一个项目」按钮）；加载中骨架。

排序操作后重新拉取列表（项目数量小，不做本地换位动画）；按钮 busy 期间禁用。

### 3.3 新建 / 编辑 Dialog（`components/admin/project-form-dialog.tsx`）

字段布局（自上而下）：

1. 标题*（Input，maxLength 80）
2. 简介（Textarea，两行高，右下角 `n/200` 计数）
3. GitHub 仓库（Input）+ 右侧「打开」外链小按钮（复用 site-info-form 的 `OpenUrlButton` 范式——提取为共用组件 `components/admin/open-url-button.tsx`，site-info-form 一并改引）
4. 在线演示（Input + 打开按钮，选填）
5. 封面图：Input（可粘贴外链）+「从媒体库选择」按钮 → `MediaPickerDialog`（`onSelect` 回填 URL，产出 jsdelivr CDN URL，静态站可用）；有值时下方显示 16:9 预览 +「移除」
6. 技术栈标签：chip 输入（Input 内 Enter / 逗号添加，chip 带 × 移除，去重，上限 8 个，达上限禁用输入并提示）
7. 底部：左「上架展示」Switch，右 取消 / 保存（保存中禁用 + spinner）

校验：标题非空、URL 形状（http/https 前缀）前端先行提示；服务端 zod 为准，错误 toast。

## 4. 前端页 — `/projects`

`apps/web/src/app/projects/page.tsx`（server component）：

```tsx
export default async function ProjectsPage() {
  const [site, projects] = await Promise.all([
    getSiteConfig(),
    listVisibleProjects(),
  ])
  if (!site.projectsEnabled) notFound()
  ...
}
```

- 总开关关 → `notFound()`：静态导出时该路径产出 404 页内容（页面「不存在」）；导航也无入口，正常访问不会到达。Vercel 上为运行时渲染。
- 结构：`PageHeader`（面包屑 首页/项目，icon `FolderGit2`，标题 + 描述）→ 卡片网格 `grid gap-6 sm:grid-cols-2 lg:grid-cols-3`（容器宽度同 archive / topics 列表页惯例）。
- 卡片（`components/blog/project-card.tsx`）：
  - `rounded-xl border bg-card overflow-hidden`；hover 时 `shadow-md` + 边框轻微高亮（整卡不可点，不做位移暗示）
  - 封面 `aspect-video w-full object-cover`（原生 `<img>`，同 post-card 范式）；无封面（或加载失败 onError）→ 品牌渐变底 + 居中 `FolderGit2` 图标（渐变沿用 share-card 兜底那组深蓝：`#1c2333 → #2b3a67 → #131822`）
  - 标题 `font-semibold` 一行截断；简介 `line-clamp-2 text-sm text-muted-foreground`
  - 技术标签 chips
  - 分隔线 + 底部链接行：GitHub / 演示（icon + 文本，`target="_blank" rel="noopener noreferrer"`）；无链接的项不渲染对应按钮
- 空态（开关开、无可见项目）：`EmptyState`（「项目整理中」）。
- `generateMetadata`：title / description 走 i18n（同 about 页）。

## 5. 前台导航（三处条件入口）

总开关开启时显示「项目」入口，位置：归档与关于之间：

- `components/layout/header.tsx`：`const { projectsEnabled } = useSiteConfig()`，在归档 NavLink 后条件渲染。
- `components/layout/mobile-nav.tsx`：同步。
- `components/layout/footer.tsx`：同步（/archive 与 /about 之间）。

播种值来自 layout 的 server `getSiteConfig()`：Pages 上为构建时值（符合「需重新部署」语义）；Vercel 上 site-settings PUT 的 `revalidatePath("/", "layout")` 使其更新。

## 6. i18n

| 文件 | 新增键 |
|---|---|
| `lib/i18n.ts` | 注册 `projects` 命名空间（zh/en） |
| `lib/i18n/site.ts` | `site.projects`（项目 / Projects） |
| `lib/i18n/projects.ts`（新） | `projects.title` / `projects.description` / `projects.empty` / `projects.emptyHint` / `projects.repo`（查看仓库 / View repo）/ `projects.demo`（在线演示 / Live demo） |
| `lib/i18n/admin.ts` | `admin.projects` / `admin.projectsDesc` / `admin.projectsEnabled` / `admin.projectsEnabledHint` / `admin.newProject` / `admin.editProject` / `admin.projectTitle` / `admin.projectDescription` / `admin.projectRepoUrl` / `admin.projectDemoUrl` / `admin.projectCover` / `admin.projectCoverPick` / `admin.projectTags` / `admin.projectTagsHint` / `admin.projectVisible` / `admin.projectEmpty` / `admin.projectEmptyHint` / `admin.moveUp` / `admin.moveDown` / `admin.deleteProjectTitle` / `admin.deleteProjectDesc` |

（以上为初始集合，实施中按 UI 需要增补；check-i18n 门禁保证 zh/en 对齐。）

## 7. 错误与边界

- 封面 URL 失效 → 前台卡片 `<img onError>` 隐藏并落回渐变占位（原生 img 无 next/image 的兜底）。
- 项目数为 0 且开关开 → 空态；开关关 → 404 + 无导航入口。
- move 首/末位 no-op（按钮已禁用，服务端仍兜底）。
- tags 超限 / 重复 → 前端阻止 + 服务端去重兜底。
- 删除 / 可见性切换失败 → toast + 状态回滚（乐观更新）。
- 静态导出：`/projects` 在开关关时产出 404 内容；API 动态段自动 stash——本地 export 双状态各验一次。

## 8. 测试

单测（`apps/web/test/` 范式）：

- `url-validation.test.ts`（新）：`optionalHttpUrl` 提取后行为回归——收 http/https/空串，拒 `javascript:` / `data:` / 非 URL。
- `projects.test.ts`（新）：`rowToProject` 的 tags JSON 容错（坏 JSON → []、非数组 → []）；`normalizeTags` 去重 / 截断。

既有 `i18n.test.ts` 覆盖 key 对齐；`check:i18n` 在 build/export 前置。

门禁：`pnpm lint` / `pnpm typecheck` / `pnpm test`；本地 `pnpm export`（开关开 / 关各一次）验证产物；CDP 手工验证后台页交互 + 前台页渲染（截图）。

## File touch list

| 路径 | 变更 |
|---|---|
| `packages/database/src/projects.ts` | 新：projects 表 + CRUD / 排序 |
| `packages/database/src/site-settings.ts` | 加 `projects_enabled` 列 + 迁移 |
| `packages/database/src/index.ts` | 导出 projects 模块 |
| `apps/web/src/lib/site-config.ts` | `SiteConfig.projectsEnabled` + 默认 false |
| `apps/web/src/lib/get-site-config.ts` | 合并 / 缓存 / DTO 带 `projectsEnabled` |
| `apps/web/src/components/layout/site-config-provider.tsx` | `refreshSiteConfig` 带 `projectsEnabled` |
| `apps/web/src/lib/url-validation.ts` | 新：`optionalHttpUrl` 提取（site-settings route 改引） |
| `apps/web/src/app/api/site-settings/route.ts` | zod + `projectsEnabled` |
| `apps/web/src/app/api/admin/projects/route.ts` | 新：POST |
| `apps/web/src/app/api/admin/projects/[id]/route.ts` | 新：PUT / DELETE |
| `apps/web/src/app/api/admin/projects/[id]/move/route.ts` | 新：POST |
| `apps/web/src/components/ui/switch.tsx` | 新：Base UI Switch |
| `apps/web/src/components/admin/project-form-dialog.tsx` | 新：新建 / 编辑表单 |
| `apps/web/src/components/admin/project-row.tsx` | 新：列表行 |
| `apps/web/src/components/admin/open-url-button.tsx` | 新：外链小按钮（自 site-info-form 提取） |
| `apps/web/src/app/admin/projects/page.tsx` | 新：后台项目页 |
| `apps/web/src/components/admin/admin-sidebar.tsx` | 侧边栏入口 |
| `apps/web/src/app/admin/layout.tsx` | `pageMeta` |
| `apps/web/src/app/projects/page.tsx` | 新：前台项目页 |
| `apps/web/src/components/blog/project-card.tsx` | 新：前台卡片 |
| `apps/web/src/components/layout/header.tsx` | 导航入口（条件） |
| `apps/web/src/components/layout/mobile-nav.tsx` | 同上 |
| `apps/web/src/components/layout/footer.tsx` | 同上 |
| `apps/web/src/lib/i18n.ts` + `lib/i18n/{site,admin}.ts` + `lib/i18n/projects.ts` | i18n |
| `apps/web/test/url-validation.test.ts`、`apps/web/test/projects.test.ts` | 新单测 |
