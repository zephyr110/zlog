/**
 * Next.js 启动钩子。
 *
 * 流量归档后台回填：仅桌面端（embedded replica，TURSO_SYNC_URL 存在）
 * 在启动时做 —— 桌面端是长驻进程，能一口气跑完最多 ~5 批 GA 归档。
 * 托管端 serverless 冷启动频繁且函数会被终止，不做 boot 回填，
 * 由 API 请求内的内联回填（每次 ≤3 个月）渐进补齐。
 */
export async function register() {
  // NEXT_RUNTIME 守卫是剪枝的关键：instrumentation 会被 Next 同时编译进
  // Node 与 Edge（Proxy/middleware）两个启动上下文，Turbopack 在 Edge 构建
  // 时会把 `NEXT_RUNTIME === "nodejs"` 整支替换为 false 并消除——动态
  // import 本身不剪枝（字面量路径仍被静态追踪进 Edge 依赖图，触发
  // node:fs/net/crypto、process.cwd 的 Edge Runtime warnings）。
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.TURSO_SYNC_URL &&
    process.env.TURSO_DATABASE_URL
  ) {
    const { backgroundArchiveAllSoon } = await import("@/lib/analytics-archiver")
    backgroundArchiveAllSoon()
  }
}
