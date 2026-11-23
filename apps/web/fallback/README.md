# 公开内容快照

`public-snapshot.sqlite` 是站点的公开内容副本（已发布文章、公开评论、可见项目、站点设置），
在远端数据库读被挡住（配额/封禁/网络故障）时供构建期预渲染，见
`apps/web/scripts/build.mjs`。之后数据库恢复读取，ISR 会按 `revalidate` 自动追平。

产物会提交进公开仓库，**不得包含用户、草稿/隐藏/定时文章、评论邮箱与 IP 哈希、
修订、分析、媒体 BLOB**。

## 重新生成

来源默认是桌面端已同步的本地副本；也可用 `--source` 指定任意同结构数据库：

```bash
node packages/database/scripts/export-public-snapshot.mjs
node packages/database/scripts/export-public-snapshot.mjs --source /path/to/zlog.db --out /tmp/snapshot.sqlite
```

导出脚本会脱敏、`VACUUM` 重建文件，并逐字节确认高熵隐私值不在产物里。
生成后跑 `pnpm --filter @zlog/database test` 校验。

## 谁会用这份快照

- Vercel 上**本站**（`zephyr110/zlog`）的 Git 构建，且数据库探测为不可用或未配置；
- 本地构建且数据库探测为不可用。

桌面端构建（`NEXT_DESKTOP=true`）与桌面一键部署（Vercel upload deployment，没有
`VERCEL_GIT_*`）都不会使用它——否则会把本站文章显示到别人的站点上。
