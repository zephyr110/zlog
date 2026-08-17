import { ensureGaArchives } from "@/lib/ga-analytics"
import { ensureVercelArchives } from "@/lib/vercel-analytics"

/**
 * 后台归档回填（fire-and-forget，所有错误吞掉并记录）。
 *
 * - GA4：最多 14 个月 × 每批 3 个月 → 至多 ~5 批；幂等，一批没有新归档即停。
 * - Vercel：单月（3 天宽限窗口内的上个月），一次即完。
 *
 * 调用点：桌面端启动（instrumentation.ts，TURSO_SYNC_URL guard）。
 * 托管端（Vercel）不做 boot 回填 —— serverless 冷启动频繁且函数会被
 * 终止；那里依赖 API 请求内的内联回填（每次 ≤3 个月，渐进补齐）。
 */
export async function backgroundArchiveAll(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    let done = 0
    try {
      done = await ensureGaArchives()
    } catch (err) {
      console.error("[analytics] GA archive backfill failed:", err)
      break
    }
    if (done === 0) break
  }
  try {
    await ensureVercelArchives()
  } catch (err) {
    console.error("[analytics] Vercel archive failed:", err)
  }
}

/** 延迟一帧再触发，避免拖慢应用启动。 */
export function backgroundArchiveAllSoon(): void {
  setTimeout(() => {
    void backgroundArchiveAll()
  }, 1500)
}
