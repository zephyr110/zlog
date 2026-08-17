import { type Client } from "@libsql/client"
import { requireDb } from "./db"
import { scheduleSync } from "./sync"

// ── Schema ──────────────────────────────────────────────────────────────

/** 流量分析月度归档：每条 = 某来源某自然月某维度下的一个条目。
 *  month 用 'YYYY-MM'（UTC 自然月，字符串字典序即时间序）。
 *  主键四元组让 upsert 幂等（重跑归档覆盖而非翻倍），且天然覆盖
 *  「按来源+区间聚合」查询。放在博客主库 → libsql 整库同步自动复制
 *  到桌面端与托管端，两侧 admin 看到同一份 All time。 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS analytics_monthly (
  source TEXT NOT NULL,
  month TEXT NOT NULL,
  dimension TEXT NOT NULL,
  item_key TEXT NOT NULL,
  users INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source, month, dimension, item_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_monthly_month ON analytics_monthly(month);
`

let tableReady: Promise<void> | null = null

async function ensureTable(db: Client): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.executeMultiple(SCHEMA)
    })().catch((err) => {
      tableReady = null // 失败重置，下次调用重试
      throw err
    })
  }
  return tableReady
}

// ── Types ───────────────────────────────────────────────────────────────

export type AnalyticsDimensionRows = {
  dimension: string
  rows: { itemKey: string; users: number; views: number }[]
}

// ── Writes ──────────────────────────────────────────────────────────────

/** 整月报告 upsert（幂等可重跑）。空 dimensions 直接返回（不发请求）。 */
export async function upsertMonthlyAnalytics(
  source: "ga" | "vercel",
  month: string,
  dimensions: AnalyticsDimensionRows[]
): Promise<void> {
  if (dimensions.length === 0) return
  const db = requireDb()
  await ensureTable(db)
  const values = dimensions.flatMap((d) =>
    d.rows.map((r) => [source, month, d.dimension, r.itemKey, r.users, r.views])
  )
  if (values.length === 0) return
  const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")
  await db.execute({
    sql: `INSERT INTO analytics_monthly (source, month, dimension, item_key, users, views)
          VALUES ${placeholders}
          ON CONFLICT(source, month, dimension, item_key)
          DO UPDATE SET users = excluded.users, views = excluded.views`,
    args: values.flat(),
  })
  scheduleSync()
}

// ── Reads ───────────────────────────────────────────────────────────────

/** 某来源已归档的月份（升序，'YYYY-MM'）。 */
export async function listArchivedMonths(
  source: "ga" | "vercel"
): Promise<string[]> {
  const db = requireDb()
  await ensureTable(db)
  const res = await db.execute({
    sql: "SELECT DISTINCT month FROM analytics_monthly WHERE source = ? ORDER BY month ASC",
    args: [source],
  })
  return res.rows.map((r) => String(r.month))
}

/** 最早有数据的归档月；无归档返回 null（作为日期筛选器的可选下界）。 */
export async function earliestArchivedMonth(
  source: "ga" | "vercel"
): Promise<string | null> {
  const months = await listArchivedMonths(source)
  return months[0] ?? null
}

/** 区间内各维度的月度聚合（users/views 求和），条目按 users 降序。
 *  返回 dimension → 条目列表（未按用户数截断，调用方自行 cap）。 */
export async function aggregateMonthlyAnalytics(
  source: "ga" | "vercel",
  fromMonth: string,
  toMonth: string
): Promise<Map<string, { itemKey: string; users: number; views: number }[]>> {
  const db = requireDb()
  await ensureTable(db)
  const res = await db.execute({
    sql: `SELECT dimension, item_key, SUM(users) AS users, SUM(views) AS views
          FROM analytics_monthly
          WHERE source = ? AND month >= ? AND month <= ?
          GROUP BY dimension, item_key
          ORDER BY users DESC`,
    args: [source, fromMonth, toMonth],
  })
  const byDim = new Map<string, { itemKey: string; users: number; views: number }[]>()
  for (const r of res.rows) {
    const dim = String(r.dimension)
    let list = byDim.get(dim)
    if (!list) {
      list = []
      byDim.set(dim, list)
    }
    list.push({
      itemKey: String(r.item_key),
      users: Number(r.users),
      views: Number(r.views),
    })
  }
  return byDim
}
