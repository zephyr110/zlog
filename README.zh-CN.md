# Zlog

[English](./README.md) | 简体中文

一个简约、快速、双语的个人博客，带本地后台管理系统。基于 [Next.js](https://nextjs.org) 16 (App Router)、[Tailwind CSS](https://tailwindcss.com) 4、[shadcn/ui](https://ui.shadcn.com)、[MDX](https://mdxjs.com) 和 [Turso](https://turso.tech) (libSQL) 构建。同一份代码、两个部署目标——文章都读同一个 Turso 库。

线上体验（Vercel）：[zephyr110.vercel.app](https://zephyr110.vercel.app)

静态镜像（GitHub Pages）：[zephyr110.github.io](https://zephyr110.github.io)

访客演示站（体验完整功能）：[zlog-test.vercel.app](https://zlog-test.vercel.app) — 浏览博客，并在 `/admin` 用 `admin-test` / `admin123456` 登录后台（演示环境禁止修改密码、分析数据为模拟数据；登录表单已自动填写账号密码）

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
- **自建评论** — 游客免登录评论；Cloudflare Turnstile + 限流 + 内容过滤防垃圾；admin 后台含未读徽标收件箱。Turnstile 双 Key 在桌面端「设置 → 评论设置」配置，一键部署时自动透传
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

详细图示与清单见[部署指南](https://zlog-test.vercel.app/posts/zlog-deployment-guide)（英文版：[zlog-deployment-guide-en](https://zlog-test.vercel.app/posts/zlog-deployment-guide-en)）。

## 桌面应用（macOS / Windows / Linux）

从 [GitHub Releases](https://github.com/zephyr110/zlog/releases/latest) 下载最新安装包：

| 平台 | 安装包 |
|---|---|
| macOS（Intel） | [`Zlog-<版本>-x64.dmg`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-1.0.2-x64.dmg) |
| macOS（Apple Silicon） | [`Zlog-<版本>-arm64.dmg`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-1.0.2-arm64.dmg) |
| Windows | [`Zlog-Setup-<版本>.exe`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-Setup-1.0.2.exe) |
| Linux（AppImage） | [`Zlog-<版本>-x86_64.AppImage`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-1.0.2-x86_64.AppImage) |
| Linux（deb） | [`Zlog-<版本>-amd64.deb`](https://github.com/zephyr110/zlog/releases/latest/download/Zlog-1.0.2-amd64.deb) |

把整个博客——阅读与写作——作为桌面应用运行。应用内置本地 standalone 服务器和本地 SQLite 数据库；配置了 sync URL 后，本地副本会与你的 Turso 数据库保持双向同步（离线时的写入会在联网后同步回来）。

- 构建：`pnpm --filter @zlog/desktop package`（按平台分别打包）
- 开发：`pnpm --filter @zlog/desktop build:standalone && pnpm --filter @zlog/desktop dev`
- 首次启动：创建你的管理员账号；可选地在向导中粘贴 Turso 数据库 URL + token 以启用同步。
- 数据与日志：用户数据目录（`zlog.db`、`zlog-config.json`、`logs/`）。备份该目录即备份博客。

### macOS 首次安装（免公证构建）

发布包为 ad-hoc 签名（未公证，无 Apple 开发者账号），Gatekeeper 首次启动会提示：

1. 从 Releases 下载 `.dmg`，把 `Zlog.app` 拖入「应用程序」。
2. 首次打开：**右键应用 → 打开 → 再点「打开」**（确认一次后 macOS 会记住放行）；或在终端执行 `xattr -dr com.apple.quarantine /Applications/Zlog.app`。
3. 若替换旧版本安装后提示「应用程序已不能再打开」，执行 `xattr -cr /Applications/Zlog.app` 后重新打开——签名是 ad-hoc 的，LaunchServices 会缓存旧的注册状态，清除扩展属性后即恢复正常。

完全无提示安装（双击即开）需要 Apple Developer ID 证书签名 + 公证。Windows SmartScreen 提示时选「更多信息 → 仍要运行」。

## Web 端与桌面端并用（账号模型）

Web 端（Vercel）、桌面应用与 Turso 是一个整体。三条规则保证三者同时正常工作：

1. **同一个数据库。** 桌面端的同步 URL/token 与 Vercel 的 `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` 必须指向**同一个** Turso 库——这个库就是共享的数据源。
2. **同一个管理员账号。** `users` 表只有一行，且只在表为空时从环境变量 seed（"首次登录时播种"）。桌面向导与 Vercel 的 `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` 必须使用**相同的用户名和密码**。若两端在首次同步收敛前用不同密码各自 seed，同步（last-write-wins）会覆盖其中一端的哈希，那一端将无法再登录。
3. **顺序：先 Web 后桌面。** 先部署 Vercel 并登录一次种下管理员，再安装桌面应用，在向导中填入同一账号密码。首次同步后两端即可用同一密码登录。（桌面端的 `SESSION_SECRET` 每台安装随机生成，与 Vercel 独立，互不冲突。）

图床仓库（`BLOG_IMG_*`）在**任何一端都是可选的**：媒体字节存放在 Turso 数据库中并随其同步，桌面端完全不需要 GitHub token；Vercel 上不配 `BLOG_IMG_*` 只是图片改为经数据库 API 提供而非 jsdelivr CDN。GitHub Pages（静态镜像）另外需要 `GH_PAT`，与桌面端无关。

设计文档：`docs/superpowers/specs/2026-08-13-desktop-app-design.md`

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

详见 `apps/web/.env.local.example` 与[部署指南](https://zlog-test.vercel.app/posts/zlog-deployment-guide)（英文版：[zlog-deployment-guide-en](https://zlog-test.vercel.app/posts/zlog-deployment-guide-en)）。

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
