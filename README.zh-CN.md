# Zlog

[English](./README.md) | 简体中文

一个简约、快速、双语的个人博客，带本地后台管理系统。基于 [Next.js](https://nextjs.org) 16 (App Router)、[Tailwind CSS](https://tailwindcss.com) 4、[shadcn/ui](https://ui.shadcn.com)、[MDX](https://mdxjs.com) 和 [Turso](https://turso.tech) (libSQL) 构建。同一份代码、两个部署目标——文章都读同一个 Turso 库。

线上体验（Vercel）：[zephyr110.vercel.app](https://zephyr110.vercel.app)

静态镜像（GitHub Pages）：[zephyr110.github.io](https://zephyr110.github.io)

![home_dark](https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1786200886932-zephyr110.vercel.app___1_.png)

![alt text](https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1786337581535-zephyr110.vercel.app_admin_dashboard_macbook_pro_1.png)

![home_light](https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1786200944045-zephyr110.vercel.app___2_.png)

![alt text](https://cdn.jsdelivr.net/gh/zephyr110/blog-img/1786337593021-zephyr110.vercel.app_admin_dashboard_macbook_pro_1.png)

## 功能模块

- **两种部署目标** — Vercel（SSR + 后台）与 GitHub Pages（静态导出）；数据统一来自 Turso
- **博客页面** — 内置 sitemap、RSS、Open Graph
- **后台 CMS** — 在 `/admin` 撰写、编辑、发布、删除文章（Vercel / 本地 `pnpm dev`）
- **认证安全** — bcrypt (cost 12) + JWT，登录失败锁定、恢复密钥
- **媒体库** — 自动 WebP 压缩，Turso 存储 + GitHub/jsdelivr CDN 双写
- **自定义 Logo 与 Favicon** — 在站点设置中上传自己的 Logo，Favicon 自动跟随
- **双语与主题** — 中/英切换，浅色/深色/跟随系统
- **自建评论** — 游客免登录评论；Cloudflare Turnstile + 限流 + 内容过滤防垃圾；admin 后台含未读徽标收件箱
- **流量分析** — 后台仪表盘可选双数据源（Vercel / 本地 `pnpm dev`）：默认 **Vercel Analytics**，亦可切换 **GA4** Data API；配置 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 时前台加载 GA4 gtag
- **提交前检查** — Husky 在 commit 前执行 `pnpm check`（ESLint + `tsc --noEmit`）

## 核心架构

pnpm monorepo：

| 包 | 职责 |
|----|------|
| `apps/web` | Next.js 应用 — 博客页面 + 后台面板 |
| `packages/database` | Turso (libSQL) 数据访问 — 文章、媒体、设置、用户、认证锁定 |
| `packages/auth` | 凭据校验、JWT 会话、登录锁定 |
| `packages/core` | 共享领域逻辑 — MDX 工具、类型 |

## 部署方式

两个目标共用同一个 Turso 库，差别在于**何时**读文章，以及是否提供后台 API。

### 1. Vercel（SSR + 后台）

完整的 Next.js 服务端部署。博客页面与 `/api/*` 以 Server Components / Route Handlers 运行，**每次请求**（CDN `s-maxage=60`）查询 Turso。生产环境可使用 `/admin`。

| | |
|---|---|
| 构建 | `pnpm build` |
| 数据 | 请求时从 Turso 读取 |
| 内容更新 | `/admin` 发布后约 60 秒内可见，**不必为发文 Redeploy** |
| 代码更新 | push `main` → Vercel 重建应用 |
| 凭据 | Vercel Environment Variables（`TURSO_*`、`SESSION_SECRET`、可选 `GA_*` / `VERCEL_*` 流量分析等） |

配置：导入仓库 → Root Directory 设为 `apps/web` → Build Command 用 `pnpm build` → 填写环境变量。**不要**在 Vercel 上跑 `pnpm export`（会丢掉 SSR 与后台）。

### 2. GitHub Pages（静态导出）

CI 执行 `pnpm export`（`NEXT_EXPORT=true`），在**构建时**查询 Turso，把 `apps/web/out` 里的纯静态 HTML/CSS/JS 发布出去。静态站上没有 `/api` 与 `/admin`。

| | |
|---|---|
| 构建 | `.github/workflows/deploy.yml` 中的 `pnpm export` |
| 数据 | 构建时从 Turso 固化进 HTML |
| 内容更新 | 仅在下一次 Actions 构建后生效 |
| 刷新触发 | push `main`（或手动 `workflow_dispatch`）→ Actions 重建 |
| 凭据 | GitHub Actions Secrets（`TURSO_*`、`GH_PAT`） |

写作请用本地 `pnpm dev` 或 Vercel 上的 `/admin`；Pages 是由 CI 刷新的静态镜像。

详细图示与清单见[部署指南](https://zephyr110.vercel.app/posts/zlog-deployment-guide)。

## Getting Started

### 环境要求

Node.js 20+ · pnpm 11+（见根目录 `packageManager`）

### 安装与运行

```bash
pnpm install      # prepare 会安装 Husky git hooks
cd apps/web && cp .env.local.example .env.local   # 填写配置
pnpm dev          # 博客 :3000，后台 /admin/login
```

关键环境变量：`TURSO_DATABASE_URL`（本地开发用 `file:./zlog.db`）、`TURSO_AUTH_TOKEN`、`SESSION_SECRET`、`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH`（首次登录时播种管理员账号）、`NEXT_PUBLIC_SITE_URL`，以及评论功能所需的 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`（免费 Cloudflare Turnstile widget，本地开发测试 key 见 `apps/web/.env.local.example`）。

可选流量分析（后台仪表盘，仅 Vercel / 本地）：

- **Vercel Analytics**（UI 默认数据源）：`VERCEL_API_TOKEN`、`VERCEL_ANALYTICS_PROJECT_ID`，可选 `VERCEL_ANALYTICS_TEAM_ID`
- **GA4**：`NEXT_PUBLIC_GA_MEASUREMENT_ID`（前台 gtag），以及服务端 `GA_PROPERTY_ID` / `GA_CLIENT_EMAIL` / `GA_PRIVATE_KEY`。需在 GCP 项目启用 **Google Analytics Data API**，并把服务账号加为 GA4 媒体资源的 **查看者**

详见 `apps/web/.env.local.example` 与[部署指南](https://zephyr110.vercel.app/posts/zlog-deployment-guide)。

不依赖环境变量创建/重置管理员：

```bash
pnpm create-admin --username admin --password "your-password"
```

### 构建与质量检查

```bash
pnpm build       # Vercel / Node — SSR + 后台
pnpm export      # 静态导出到 apps/web/out（GitHub Pages）
pnpm check       # lint + typecheck（Husky 提交前也会跑）
```

需要跳过 hooks 时：`HUSKY=0 git commit …`。

## License

MIT
