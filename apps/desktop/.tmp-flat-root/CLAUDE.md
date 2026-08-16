@AGENTS.md

# 版本与 Tag 规范

## 版本号（SemVer 2.0.0）

格式：`MAJOR.MINOR.PATCH[-预发布][+构建元数据]`

- **MAJOR**：不兼容/破坏性变更；**MINOR**：向后兼容新功能；**PATCH**：向后兼容修复
- 预发布段用连字符 `-`（如 `0.1.0-beta.3`），标识符仅 `[0-9A-Za-z-]`；数字段按数值比较（`beta.9` < `beta.10`）
- 预发布版本恒低于对应正式版本（`0.1.0-beta.3` < `0.1.0`）
- 序列惯例：`-alpha.N` → `-beta.N` → `-rc.N` → 正式版
- `0.x.y` 阶段：MINOR 升号代表破坏性变更；不出现 `1.0.0-beta.x` 这类已发布正式版+预发布后缀的组合

## Git tag

- **必须使用 annotated tag**：`git tag -a v0.1.0-beta.4 -m "release v0.1.0-beta.4"`；禁止轻量 tag
- 格式固定为 `v` 前缀 + SemVer：`v0.1.0` / `v0.1.0-beta.3`；禁止其他前缀/非 SemVer 命名（如 `desktop-v0.1.0-ci`）
- **tag 与 package.json 版本保持一致**：先 bump 版本再打 tag，CI 会从 tag 同步版本进 apps/desktop/package.json（desktop.yml 的 Sync version 步骤）
- 只推 tag：`git push origin v0.1.0-beta.4`（勿用 `--tags` 全量推送）
- 历史遗留（如 `desktop-v0.1.0-ci` 类 CI 验证 tag）不使用、不依赖，应清理

## 发布流程

1. bump 版本（apps/desktop/package.json）
2. 提交并推送 main（部署 GitHub Pages）
3. `git tag -a vX.Y.Z... -m "release ..."` 后 `git push origin vX.Y.Z...` → 触发 desktop.yml 构建安装包
4. 产物挂 draft release，人工确认后发布

## CI 触发边界

- desktop.yml 只对 `v[0-9]*` 的 tag 触发；非 SemVer tag 不会触发构建（这是特性，不是 bug）
