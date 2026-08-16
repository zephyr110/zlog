# Zlog 部署指南（三）：一键部署到 Vercel，发布公网

系列最后一篇：把博客发布成公开网站。前置条件很简单——完成 [第二篇的 Turso 同步](zlog-deployment-guide-sync)（部署时应用会自动把同步凭据写进线上环境），再注册一个 Vercel 账号即可。

## 为什么选 Vercel

- **免费**：Hobby 计划对个人博客完全够用（每月 100GB 带宽、无限静态请求）。
- **全自动**：部署后文章、图片、评论都在同一个云端库，后台与站点完全一致。
- **无需任何命令行**：不需要 Git、终端或手动配置环境变量。

## 第一步：注册 Vercel 并生成 Token

1. 打开 [Vercel](https://vercel.com) 注册（可用 GitHub / Google 账号一键登录）。
2. 右上角头像 → **Settings → Tokens → Create Token**：
   - 名称随意（如 `zlog-deploy`）
   - Scope 选你的账号
   - 点 Create 后**立即复制** Token（只显示一次），形如 `vcp_...`

## 第二步：桌面端一键部署

1. 打开 Zlog 应用 →「设置 → 一键部署（Go Live）」面板。
2. 粘贴 Token；项目名可留空（自动生成，如 `zlog-blog-xxx`）或自定义。
3. 点「部署」，应用自动完成：

   ```
   校验 Token → 创建 Vercel 项目 → 配置环境变量
   → 上传代码 → 云端构建（约 2-5 分钟）→ 返回线上地址
   ```

4. 完成后面板显示线上地址（形如 `https://你的项目名.vercel.app`），点「复制地址」分享给任何人。

## 部署后

- **写作**：在桌面端或线上后台（`/admin`）写文章都写入同一个 Turso 库，线上约 60 秒内可见，无需重新部署。
- **更新代码**：桌面端再点一次「部署」即可覆盖线上版本，环境变量自动复用。
- **图片**：媒体上传由应用自动处理——配置了 GitHub 图床 Token 走 CDN 加速；没有则直接从数据库提供，功能完全不受影响。

## 可选：开启评论防垃圾（Cloudflare Turnstile）

评论默认直接可用（游客免登录）。要加人机验证防垃圾，需要 Cloudflare Turnstile 的两个 Key：

1. **注册 Cloudflare**（免费）：打开 [dash.cloudflare.com](https://dash.cloudflare.com) 注册。
2. **创建 Turnstile 站点**：控制台进入 **Turnstile → Add site**：
   - Widget name 随意（如 `my-blog-comments`）
   - Hostname 填你的域名——本地使用填 `localhost`，Vercel 部署填你的 `xxx.vercel.app`（多个域名用逗号分隔）。**密钥只对白名单域名生效**，未加白会报错 110200 "domain is not allowed"
3. **拿到两个 Key**：创建后页面显示 **Site Key**（公开，形如 `0x4AAAAAA...`）与 **Secret Key**（私密，只在创建时完整显示一次，立即复制保存）。
4. **填入桌面端**：Zlog「设置 → 评论设置」粘贴两个 Key → 保存。
5. **生效**：本地评论立即显示人机验证；之后一键部署到 Vercel 时两个 Key 自动透传，线上防护与本地一致。

**要点**

- 没配置时评论照常可用，只是没有验证码（无防垃圾）。
- Cloudflare 提供测试 key：`1x000...`（永远通过）/ `2x000...`（永远拒绝）——只用于本地调试，**不要部署到生产**（会让验证码形同虚设）。
- 换域名后在 Turnstile 站点设置里更新 Hostname 列表即可。

## 常见问题

**Q：部署提示 Token 无效？**
A：确认粘贴的是完整 Token（`vcp_` 开头），且创建时没有关闭页面导致未复制完整。

**Q：部署要花多久？**
A：上传约 1 分钟，云端构建约 2-5 分钟。中途可点「取消」。

**Q：线上后台能改密码吗？**
A：可以，与本地体验一致。忘了密码就在桌面端「设置 → 账号」重置。

**Q：如何开启评论防垃圾？**
A：桌面端「设置 → 评论设置」里填入 Cloudflare Turnstile 的 Site Key 与 Secret Key（在 [Turnstile 控制台](https://dash.cloudflare.com/?to=/:account/turnstile) 创建一个站点即可获得）。配置后本地评论即启用人机验证；一键部署时这两个 Key 会自动透传，线上评论防护与本地一致。

**Q：想要自己的域名？**
A：Vercel 控制台项目页 → **Settings → Domains**，添加你的域名并按提示配置 DNS，几分钟生效。

---

系列回顾：
- [（一）三种方式怎么选](zlog-deployment-guide)
- [（二）Turso 云端同步](zlog-deployment-guide-sync)
- （三）一键部署 Vercel ← 你在这里

至此，一个可以从任何设备写作、对任何人公开的博客就完成了。祝写作愉快！
