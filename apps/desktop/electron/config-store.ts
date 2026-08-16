import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface DesktopConfig {
  adminUsername: string
  adminPasswordHash: string
  sessionSecret: string
  /** Desktop shell 调用 /api/sync 的共享密钥（随服务器 env 传递）。 */
  desktopKey: string
  syncUrl?: string
  syncToken?: string
  /** 流量分析（线上站点只读报表）：Vercel Analytics */
  vercelApiToken?: string
  vercelProjectId?: string
  vercelTeamId?: string
  /** 流量分析（线上站点只读报表）：GA4 Data API */
  gaPropertyId?: string
  gaClientEmail?: string
  gaPrivateKey?: string
  /** 评论防垃圾（Cloudflare Turnstile）：site key 公开、secret key 私密。
   *  有值时注入服务器 env（本地评论防垃圾 + Vercel 部署透传）。 */
  turnstileSiteKey?: string
  turnstileSecretKey?: string
  /** 选填 HTTP / SOCKS5 代理。有值则覆盖自动检测，供 Vercel / GA4 拉取。 */
  httpsProxy?: string
  /** 一键部署（Vercel upload deployment）：API token 与上次部署结果。 */
  vercelDeployToken?: string
  vercelProjectName?: string
  vercelDeployUrl?: string
}

/** 本地配置读写。路径可注入以便测试（主进程传 userData 目录）。 */
export class ConfigStore {
  constructor(private readonly dir: string) {}

  get filePath(): string {
    return join(this.dir, "zlog-config.json")
  }

  load(): DesktopConfig | null {
    if (!existsSync(this.filePath)) return null
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<DesktopConfig>
      if (!raw.adminUsername || !raw.adminPasswordHash || !raw.sessionSecret || !raw.desktopKey) {
        return null
      }
      return raw as DesktopConfig
    } catch {
      return null
    }
  }

  save(cfg: DesktopConfig): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    writeFileSync(this.filePath, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  }
}
