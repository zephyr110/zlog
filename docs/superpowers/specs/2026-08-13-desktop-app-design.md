# Zlog 桌面端应用设计（Design Doc）

日期：2026-08-13 · 状态：已确认（分节评审通过）· 基底：origin/main @ 42fabe0

## 1. 背景与目标

为 zlog 个人博客（Next.js 16 + Turso/libSQL）实现桌面端应用，形态为**完整本地博客**：离线阅读、本地写作发布（含 admin CMS），数据存放于本地 SQLite，并通过 Turso embedded replica 与线上博客双向同步。

**已确认的需求约束：**

| 维度 | 决策 |
|---|---|
| 产品形态 | 完整本地博客（阅读 + 写作管理） |
| 目标平台 | macOS + Windows + Linux |
| 数据同步 | Turso embedded replica 双向同步（本地文件库 ⇄ 云端） |
| 分发方式 | GitHub Actions 三平台构建 + GitHub Releases 免签名发布 |

## 2. 可行性结论

**可行，且现有架构对桌面端异常友好**，关键事实：

1. 数据层 `@zlog/database` 使用 `@libsql/client`，`TURSO_DATABASE_URL` 已支持 `file:` URL（本地 dev 模式即此），libSQL 官方支持 embedded replica（`syncUrl` + `client.sync()`），双向同步为库内建能力
2. 全链路纯 JS：auth（jose + bcryptjs）、MDX 管线、i18n、评论均无原生依赖，可在 Node 环境直接运行
3. Next.js 官方 `output: "standalone"` 可产出自包含 Node 服务器（自带 node_modules）；`next.config.ts` 已有 `NEXT_EXPORT` 环境变量切换先例，新增 desktop 模式是现成套路

主要工程点不在"能否实现"，而在：服务器进程生命周期管理、端口分配、三平台打包矩阵、原生模块（sharp、libsql napi 二进制）随包分发。

**方案选择**：Electron + Next.js standalone 服务器（已采纳）。理由：复用 100% 现有代码（博客 + admin + API 原样工作）；Electron 内嵌 Node，无 sidecar 运行时分发问题；进程管理与三平台打包生态最成熟。备选（Tauri 2 + Node sidecar、原生重写）因体积优势被 Node 运行时抵消/工作量过大而放弃，见第 9 节决策记录。

## 3. 架构

### 3.1 新增包

```
apps/desktop/
├── electron/
│   ├── main.ts           # 入口：单例锁、窗口创建、生命周期
│   ├── server-manager.ts # standalone 服务器进程管理（核心）
│   ├── config-store.ts   # 本地配置（userData/，0600 权限）
│   ├── first-run.ts      # 首次启动向导（原生对话框）
│   └── tray.ts           # 托盘：打开/设置/退出 + 同步状态 tooltip
├── scripts/              # 构建 standalone 产物的脚本
└── package.json          # electron + electron-builder + vitest
```

### 3.2 进程模型（单一数据库持有者原则）

| 进程 | 职责 | 说明 |
|---|---|---|
| Electron 主进程 | 单例锁、窗口、托盘、服务器进程管理、首启向导、同步调度 | 不碰数据库，只发 HTTP |
| Next standalone 服务器（子进程） | 博客 SSR + `/admin` + `/api/*`，**数据库唯一持有者**（含 sync 执行） | `node server.js`，自包含 node_modules |
| BrowserWindow | 渲染 web UI（`127.0.0.1:<port>`） | 现有前端零改动 |

**关键决策：同步执行放服务器进程，调度放主进程。** embedded replica 的 SQLite 文件不宜被两个进程同时管理（sync 引擎写文件会与服务器读互锁）；服务器提供执行能力（`/api/sync`），主进程决定何时执行（生命周期语义"应用活着才同步"），不引入服务器进程内长驻定时器。

### 3.3 next.config.ts 第三种模式

沿用现有 `NEXT_EXPORT` 切换套路：

```ts
const isDesktop = process.env.NEXT_DESKTOP === "true"
// output: "standalone"，images 不 unoptimize（本地有 sharp）
```

三种构建互斥共存：Vercel（SSR）· GitHub Pages（export）· Desktop（standalone）。

## 4. 配置与首次启动（用户安装后的路径）

**配置分三类：自动 / 向导 / 可选后置。**

| 配置项 | 设置方式 | 说明 |
|---|---|---|
| `TURSO_DATABASE_URL` | 应用自动 | 固定 `file:<userData>/zlog.db`；数据文件即此单个 SQLite 文件，备份 = 复制文件 |
| `SESSION_SECRET` | 应用自动 | 首次启动随机生成 |
| 管理员账号密码 | 首启向导 | 对应现有 `create-admin` 机制，向导写入配置后以 env seed 进服务器 |
| `TURSO_SYNC_URL` + `TURSO_AUTH_TOKEN` | 首启向导（可选） | Turso 控制台复制粘贴 |
| `BLOG_IMG_*`（媒体 CDN） | 可选后置 | 不配可用：媒体入库经 replica 同步，仅不走 GitHub CDN |
| `NEXT_PUBLIC_SITE_URL` 等 SEO 类 | 不需要 | 桌面端无 SEO/爬虫场景；metadataBase 取自 DB 内站点设置，纯本地运行时无实际作用 |

**首次启动向导（两条路径）：**

- **路径 A：已有线上博客（同步模式）**——粘贴 Turso 数据库 URL + token → 首次 `sync()` 全量拉取（文章、图片、评论、设置）→ 整个博客变成本地离线存档 → 此后双向同步
- **路径 B：全新开始（纯本地）**——只创建管理员账号，空库起步；以后可在 Settings 补充 URL/token

共同步骤：设置管理员用户名 + 密码。**跳过向导兜底**：随机生成管理员口令在首启对话框显示一次，sync 不配则纯本地，所有联网配置缺省降级可用（本地优先原则）。

**之后的修改入口（托盘 → Settings 对话框）：**

- 同步 URL / token + "立即同步一次" + 上次同步时间
- 修改管理员密码（复用现有 `/api/auth/change-password`）
- 站点信息（admin 面板内 Site Settings，现状已有）
- 数据文件路径 + 日志路径展示，"高级：打开配置文件"（JSON 手动编辑后重启生效）

## 5. 同步设计

### 5.1 数据流

```
阅读/写作  BrowserWindow → Next 服务器 (SSR + /api) → 本地 replica (file:zlog.db)
同步执行  Electron 主进程调度 → POST /api/sync → @zlog/database sync() → Turso primary
线上博客  Vercel 直连 Turso primary（现状不变）
```

### 5.2 同步模块（`packages/database` 新增 `sync.ts`）

- `runSync()`：`TURSO_SYNC_URL` 存在时调用 `client.sync()`；`sync()` 双向（拉取线上改动 + 推送本地改动）
- **触发时机**：首启向导同步 → 主进程每 5 分钟 → 写操作后 debounced 触发（服务器侧）→ Settings"立即同步"
- 写操作触发点：`@zlog/database` 写路径（`savePost`/`deletePost`/媒体/评论等）出口统一包装，fire-and-forget + debounce；**Vercel 上 `TURSO_SYNC_URL` 不存在 → 包装为空操作**，线上零影响
- 新 API：`/api/sync`（admin auth，执行同步）、`/api/sync/status`（lastSyncAt / 状态，供 Settings 与托盘 tooltip 轮询）
- 媒体字节存于 Turso DB，随 replica 同步 → **离线可看图片**

### 5.3 冲突策略：row-level Last-Write-Wins（LWW），不做自动 merge

- libSQL replica 默认按行合并，双端写同一行以同步顺序较后的为准
- 单用户博客冲突面极小（默认场景"桌面写、线上读"）；v1 不引入 diff/merge，文档写明"同一时间只在一个端编辑同一篇文章"
- v2 可选增强：写前比较 `updated_at`，远端更新时弹警告，用户决定是否覆盖
- 同步失败（离线/token 失效）：**写操作永不阻塞**（本地优先），失败记录状态，下个周期自动重试；token 失效在 Settings 醒目提示

## 6. 错误处理

| 故障 | 表现 | 处理 |
|---|---|---|
| 服务器启动失败（原生模块缺失、产物损坏） | spawn 失败 | 弹窗 + 日志路径，重试/退出 |
| 端口冲突 | 健康检查超时 | 预选空闲端口（`net.listen(0)` 探测），失败换端口重试一次 |
| 服务器运行中崩溃 | exit 事件 | 弹窗提示 + 自动重启一次，再次崩溃只提示不循环 |
| DB 文件损坏 | SQLite 打开失败 | 弹窗给出数据文件路径，绝不自动删除，提示手动恢复备份 |
| 同步离线 | sync 失败 | 静默跳过，状态 `offline`，下周期重试 |
| 同步 token 失效 | sync 401 | 状态 `auth_error`，Settings 醒目提示，写不受影响 |
| 磁盘满 | 写 500 | 日志记录 + admin 现有 toast 机制 |

日志：主进程与服务器 stderr 分文件写入 `userData/logs/`（主 `main.log`、服务器 `server.log`），启动轮转保留上一份；错误弹窗附带日志路径。

窗口行为：v1 关闭窗口 = 退出应用（无托盘常驻）；托盘提供打开/设置/退出 + 同步状态 tooltip。后台常驻同步列入 v2。

## 7. 测试

1. **单元**（vitest，desktop 包新增）：server-manager env 组装/端口选择/健康检查（mock child_process）；config-store 权限与首启判定；sync 模块 no-op 守卫与调用（mock libsql client）；调度器 debounce/间隔（fake timers）
2. **冒烟**（Playwright Electron）：Linux CI + xvfb——启动 → 窗口加载 → 首页渲染 → admin 登录（seeded 测试账号）→ 建文章 → 发布成功；临时目录 file: DB，不联网
3. **手动集成**（标注 manual，需真实 Turso）：embedded replica 全流程——本地写→线上可见；线上写→本地 sync 后可见

质量门：CI = lint + typecheck + vitest + Linux 冒烟。

## 8. 范围界定与里程碑

**v1 做**：standalone 构建链、Electron 壳、首启向导、Settings 对话框、同步（启动/定时/写后/手动）、媒体降级、日志与错误弹窗、托盘、三平台打包 + GitHub Actions + Releases。

**v1 不做**（YAGNI）：自动更新（免签名阶段手动下载）、应用内同步状态 UI（托盘 tooltip 足够）、冲突自动合并、原生通知、后台常驻、desktop 专属主题。

**里程碑：**

- **M1 构建链与壳**：`NEXT_DESKTOP` standalone 构建 + Electron 壳 + 首启向导，本地可跑
- **M2 同步**：`sync.ts` + `/api/sync` + 主进程调度器 + Settings 对话框
- **M3 打包与 CI**：electron-builder 三平台 + Actions 矩阵 + Release 流程
- **M4 测试与文档**：测试补全、README 桌面端章节、发布说明

## 9. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 框架 | Electron（弃 Tauri sidecar / 原生重写） | 复用 100% 代码；Node 内嵌；进程管理成熟；Tauri 体积优势被 sidecar Node 运行时抵消 |
| 同步归属 | 执行在服务器进程，调度在主进程 | 单一 DB 持有者原则；生命周期语义清晰 |
| 冲突策略 | row-level LWW，无自动 merge | 单用户场景冲突面极小，YAGNI |
| 窗口关闭 | 退出应用 | v1 语义简单可预期；常驻列 v2 |
| 分发 | GitHub Releases 免签名 | 零证书成本；Gatekeeper/SmartScreen 提示写入发布说明 |

## 10. 待验证项（实现时确认）

- `@libsql/client` v0.17 的 embedded replica（`file:` + `syncUrl`）在 Node 环境的完整支持与行为
- Next 16 standalone 产物中 sharp / libsql napi 原生二进制的打包与 asar 处理（`asarUnpack`）
- Next 16 下 standalone 服务器的端口策略（`PORT` 环境变量语义，含 0/随机端口支持）
- Electron 免签名在三平台的安装行为（macOS Gatekeeper、Windows SmartScreen、Linux 直接运行）
- 三平台构建在 GitHub Actions 矩阵上的产物完整性（dmg/nsis/AppImage+deb）
