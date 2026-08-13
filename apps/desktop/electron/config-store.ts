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
