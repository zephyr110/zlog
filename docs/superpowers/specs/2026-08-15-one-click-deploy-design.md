# Zlog 桌面端「一键部署到 Vercel」设计（Design Doc）

日期：2026-08-15 · 状态：草案（待评审）· 基底：main @ bc410cc

## 1. 背景与目标

路径 A（README 引导 + 设置「Go Live」面板，bc410cc）已让第三方用户**知道**怎么上线，但流程仍要求：GitHub 账号 → fork 仓库 → Vercel 导入 → 手动配 5 个环境变量 → Redeploy——约 1-2 小时的开发者操作，**非开发者用户在这里流失**。

**路径 B 目标**：把「让别人能访问我的博客」压缩成三步：

```
1. 注册 Vercel → 生成一个 API Token（Settings → Tokens，勾选即可）
2. 打开 app 设置 →「发布到线上」→ 粘贴 Token
3. 点「部署」→ 等待 → 得到线上地址
```

全程**无 GitHub、无命令行、无手动环境变量**。

**约束**：
- 复用现有基础设施：Turso 同步（设置里已有）、Vercel 动态部署（SSR + ISR 60s，已验证）
- 桌面端不持有用户 GitHub 凭据；Vercel token 只存本地 userData（config-store，0600）
- 部署的必须是**与 app 版本匹配的 zlog 代码**（避免版本漂移）

## 2. 用户旅程

```
安装 app → 首次向导建账号 → 设置 →「Go Live」面板
├─ 场景 A（首次）：面板显示 [粘贴 Vercel Token] + [部署] 按钮
│   → 填 Token → 点部署 → 进度：创建项目 → 配置环境 → 上传代码 → 云端构建（2-5 分钟）
│   → 完成：显示线上地址 https://xxx.vercel.app → [打开网站] [复制地址]
│   → 同步设置里已有 Turso URL/Token 的话自动复用（没有则先引导填）
└─ 场景 B（再次部署/更新）：同项目重新部署（同一 project 新 deployment）
```

部署完成后日常发布 = 现有链路：写文章 → 保存 → Turso 同步 → 线上 ~60s 可见（无需再部署）。

## 3. 技术方案

### 3.1 总体流程（主进程 VercelDeployer）

```
用户粘贴 token
  → 1. 校验 token：GET /v9/user（401 → 提示 token 无效/权限不足）
  → 2. 解析 project：GET /v9/projects/{name}（404 → 创建 POST /v13/projects）
       name 默认 "zlog-blog-<随机后缀>"，可编辑
  → 3. 配置 env（POST /v10/projects/{id}/env，target: ["production"]）：
       TURSO_DATABASE_URL   ← 同步设置的 syncUrl（libsql://）
       TURSO_AUTH_TOKEN     ← 同步设置的 syncToken
       ADMIN_USERNAME       ← 本地 config 的 adminUsername
       ADMIN_PASSWORD_HASH  ← 本地 config 的 adminPasswordHash（已是 base64 bcrypt ✓）
       SESSION_SECRET       ← randomBytes(32) 新生成
       （可选透传：GA_* / VERCEL_* ——从本地 config 读取）
       env 缺同步设置 → 中止并引导先去「同步设置」填写（顺序依赖）
  → 4. 获取源码：codeload.github.com/zephyr110/zlog/tar.gz/refs/tags/v<app-version>
       解压 → 只保留部署所需（见 3.2）→ 生成文件清单
  → 5. 创建部署：POST /v13/deployments
       { name, files: [{file, data}], projectSettings: { framework: "nextjs", rootDirectory: "apps/web" } }
  → 6. 轮询部署状态：GET /v13/deployments/{id}（每 5s）
       READY → 成功；ERROR/CANCELED → 失败（读 error 字段给可读文案）
  → 7. 完成：GET /v9/projects/{id} 取 alias（xxx.vercel.app）
       → 写回 config（deployProjectId/deployUrl）→ UI 显示
```

### 3.2 源码获取：拉取官方 tarball（不内置）

**决策：不把源码打进安装包**，部署时从 codeload 拉取与 app 版本匹配的 tag。

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. codeload 拉取（采纳）** | 安装包不膨胀；版本天然跟随 app（tag = package.json 版本）；无需账号（公开仓库匿名下载） | 部署时需要网络；拉取 ~1-2MB |
| B. 内置源码（extraResources） | 离线可用 | 安装包 +2-3MB；源码与 app 版本需打包时同步（易漂移） |

拉取后**只上传部署必需文件**（排除 node_modules / .next / docs / 测试）：

```
package.json  pnpm-lock.yaml  pnpm-workspace.yaml  next.config.ts(等根配置)
apps/web/**   （排除 node_modules、.next、out）
packages/database/**  packages/core/**
```

Vercel 云端执行 `pnpm install`（lockfile 保证依赖一致）+ `pnpm build`——与路径 A 的 Vercel 导入构建完全同构。

### 3.3 Vercel API 端点清单（无需 Git 集成）

| 用途 | 端点 | 说明 |
|---|---|---|
| 校验 token | `GET /v9/user` | 401 → 引导重新生成 |
| 查项目 | `GET /v9/projects/{name}` | 404 → 走创建 |
| 创建项目 | `POST /v13/projects` | `{ name, framework: "nextjs" }` |
| 设 env | `POST /v10/projects/{id}/env` | 逐条 upsert（key/value/target） |
| 创建部署 | `POST /v13/deployments` | `files` 上传 + projectSettings |
| 部署状态 | `GET /v13/deployments/{id}` | 轮询 readyState |
| 项目信息 | `GET /v9/projects/{id}` | 取 alias（生产域名） |

**无 Git 部署的边界**（Vercel 官方支持 upload deployment）：
- 单部署文件数限制（数千文件内，zlog 排除后 ~150 个 ✓）
- 单文件大小限制（源码文本远低于）
- 上传部署不触发 Git 集成功能（CI/CD 回滚、preview 分支）——对本场景无影响

### 3.4 状态机与 UI（「Go Live」面板升级）

```
idle → validating → creating-project → setting-env → fetching-source
     → uploading → building（轮询，显示阶段文案）→ done | failed
```

- **idle**：token 输入框（password 类型 + 记忆到 config）+ [部署] 按钮 + 最近部署信息（URL/时间）
- **building**：阶段进度文案（"正在云端构建（约 2-5 分钟）"），按钮禁用，可取消（AbortController）
- **done**：绿色状态 + 线上地址（可复制/打开）+ [重新部署]（更新代码/配置后再次部署）
- **failed**：错误分类 → 可读文案（token 无效 / 项目名冲突 / 构建失败 + 构建日志摘要 / 网络）
- 依赖检查：同步设置未填 → 面板内嵌提示跳转「同步设置」

### 3.5 与现有代码的衔接

- **config-store.ts**：新增 `vercelDeployToken?`、`vercelProjectName?`、`vercelProjectId?`、`vercelDeployUrl?`（0600 权限文件，token 与既有凭据同库）
- **同步设置复用**：env 的 Turso 字段直接读 config 的 syncUrl/syncToken（不要求用户重复填写）
- **错误文案**：复用 analytics 的 i18n 模式（zh/en 字典）

## 4. 组件与文件变更

```
apps/desktop/electron/
├── vercel-deploy.ts        # 新增：VercelDeployer 类（校验/项目/env/源码/部署/轮询/取消）
│                            #   纯函数核心（buildFileList/tarGz 解析）可单测
├── config-store.ts         # 扩展：部署相关字段
├── main.ts                 # IPC：deploy:start / deploy:status / deploy:cancel / deploy:info
└── preload.ts              # 暴露 deploy API + 进度事件
apps/desktop/renderer/
├── settings.html           # Go Live 面板：token 输入 + 部署按钮 + 状态区 + 结果区
└── settings.js             # 状态机渲染 + i18n 字典（deploy.* 键）
apps/desktop/test/
└── vercel-deploy.test.ts   # 新增：文件清单构建、tarball 解析、env 清单、状态机（mock fetch）
```

**依赖**：无新运行时依赖（node:https 或 undici fetch；tar 解压用内置 zlib + 手写 gzip 流解析，或引入 `tar` 包——倾向引入 `tar`（electron-builder 已带传递依赖，锁文件新增 ~几十 KB））。

## 5. 错误处理与边界

| 场景 | 处理 |
|---|---|
| token 无效/过期 | 校验步骤 401 → "Token 无效，请到 Vercel 设置重新生成" |
| 项目名被占用 | 创建 409 → 建议加随机后缀重试 |
| 构建失败 | 轮询 ERROR → 读 deployment.error 摘要（首 200 字符）展示 |
| 网络中断 | 上传/轮询超时（fetch timeout 15s）→ 可重试；轮询失败不中断构建（Vercel 侧继续），恢复后重查 |
| 同步设置未配置 | 部署前校验 → 内嵌引导跳转 |
| 重复部署 | 同 project 新 deployment（更新代码/env） |
| 用户取消 | AbortController 中止轮询与上传（Vercel 侧部署继续，无害——下次部署覆盖） |

**安全**：
- token 仅存 userData config（0600，与 adminPasswordHash 同级）
- 部署内容 = 官方仓库代码 + 用户自有 env（无用户数据泄露；数据库内容在 Turso，不在部署包）
- 不向任何第三方发送 token（只发 api.vercel.com）

## 6. 测试与验证

1. **单测**（vitest，mock fetch）：env 清单生成（含 base64 哈希原样透传）、文件清单（排除规则）、tarball 解压、状态机转移、错误分类
2. **联调**（用户手动）：真实 token 走全流程——新项目部署成功 → 打开线上地址 → 写文章 → Turso 同步 → 线上可见；再部署（更新）一次
3. **回归**：桌面现有 120 测试、web typecheck/lint/build

## 7. 工作量与里程碑

| 里程碑 | 内容 | 估时 |
|---|---|---|
| M1 | vercel-deploy.ts 核心（校验/项目/env/上传/轮询）+ 单测 | 0.5 天 |
| M2 | 面板 UI（状态机 + i18n + config 存取 + IPC） | 0.5 天 |
| M3 | 端到端联调（真实 token 两轮部署）+ 文档 | 0.5 天 |

合计约 1.5 个工作日。

## 8. 风险与备选

| 风险 | 缓解 |
|---|---|
| Vercel upload deployment 限制变化 | 端点版本固定（v13/v10/v9），错误响应透传提示 |
| 官方仓库 tarball 拉取失败（网络） | 走系统代理（复用 system-proxy 解析）；失败可重试；备选：GitHub API 逐文件（慢） |
| 用户已有 Vercel 项目（想用自己域名/已有部署） | 提供「导入已有项目」模式（填 project name + token）——M2 可选项 |
| 非 Vercel 平台（用户想用自有服务器） | 文档说明：路径 A 的通用部署指南仍适用（本功能是便捷入口，不是唯一路径） |
| 构建时长（2-5 分钟）体验 | 轮询 + 阶段文案 + 后台可继续用 app（部署不阻塞其他功能） |

## 9. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 源码来源 | codeload 拉取官方 tag | 安装包不膨胀、版本匹配、无需账号 |
| 部署方式 | Vercel upload deployment（无 Git） | 消除 GitHub/fork 门槛——本方案核心目标 |
| 域名 | 默认 xxx.vercel.app | 零配置；自定义域名走 Vercel 控制台（文档说明） |
| 同步设置复用 | env 从本地 config 读取 | 用户已在设置填过，不重复 |
