import { backgroundArchiveAllSoon } from "@/lib/analytics-archiver"

/**
 * Next.js 启动钩子。
 *
 * 流量归档后台回填：仅桌面端（embedded replica，TURSO_SYNC_URL 存在）
 * 在启动时做 —— 桌面端是长驻进程，能一口气跑完最多 ~5 批 GA 归档。
 * 托管端 serverless 冷启动频繁且函数会被终止，不做 boot 回填，
 * 由 API 请求内的内联回填（每次 ≤3 个月）渐进补齐。
 */
export async function register() {
  if (process.env.TURSO_SYNC_URL && process.env.TURSO_DATABASE_URL) {
    backgroundArchiveAllSoon()
  }
}
