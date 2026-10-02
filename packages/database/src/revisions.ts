import { type Client } from "@libsql/client"
import { requireDb } from "./db"
import { scheduleSync } from "./sync"
import { type Post } from "@zlog/core"
import { safeSlug } from "@zlog/core"
import { rowToPost, toParams } from "./post-row"

// ── Schema ──────────────────────────────────────────────────────────────

/** 文章版本历史：每次 savePost 覆盖前，若内容确有变化，把旧行整份拷
 *  进 post_revisions（含 content 全文——个人博客量级，简单可靠优先）。
 *  每篇只保留最近 REVISION_LIMIT 份，写入时就地修剪。 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS post_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  date TEXT NOT NULL,
  updated TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  cover TEXT,
  draft INTEGER NOT NULL DEFAULT 0,
  pinned_at TEXT,
  publish_at TEXT,
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  reading_time INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_post_revisions_slug ON post_revisions(slug, id DESC);
`

export const REVISION_LIMIT = 20

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

export type PostRevisionSummary = {
  id: number
  slug: string
  title: string
  draft: boolean
  wordCount: number
  createdAt: string
}

export type PostRevision = Post & { id: number; createdAt: string }

// ── Pure ────────────────────────────────────────────────────────────────

/** 解析历史版本 id（URL 参数或请求体皆可）：仅正整数有效，其余
 *  （含 "1.5"、"1e3"、" 1"、NaN）一律 null，路由据此回 400。 */
export function parseRevisionId(value: unknown): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** 是否值得存快照：内容字段逐项比对。pinnedAt 不参与——置顶走
 *  setPostPinned 专用路径，编辑保存根本不触碰它；把置顶变化算作
 *  "内容变化"会让自动保存反复生成快照。 */
export function samePostContent(a: Post, b: Post): boolean {
  return (
    a.title === b.title &&
    a.date === b.date &&
    (a.updated ?? "") === (b.updated ?? "") &&
    a.description === b.description &&
    (a.cover ?? "") === (b.cover ?? "") &&
    a.draft === b.draft &&
    a.publishAt === b.publishAt &&
    a.content === b.content &&
    a.tags.join("\u0000") === b.tags.join("\u0000")
  )
}

// ── Writes ──────────────────────────────────────────────────────────────

/** 存一份快照。storeSlug 缺省用 post.slug；改名保存时传新 slug，
 *  让历史时间线统一挂在当前 slug 下。 */
export async function insertPostRevision(
  post: Post,
  storeSlug?: string
): Promise<void> {
  const db = requireDb()
  await ensureTable(db)
  const p = toParams(post)
  const slug = safeSlug(storeSlug ?? post.slug)
  await db.execute({
    sql: `INSERT INTO post_revisions
            (slug, title, date, updated, tags, description, cover, draft, pinned_at, publish_at, content, word_count, reading_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      slug,
      p.title,
      p.date,
      p.updated,
      p.tags,
      p.description,
      p.cover,
      p.draft,
      p.pinned_at,
      p.publish_at,
      p.content,
      p.word_count,
      p.reading_time,
    ],
  })
  // 修剪到最近 REVISION_LIMIT 份（同事务缺失也无妨：多留一份比丢一份安全）。
  await db.execute({
    sql: `DELETE FROM post_revisions WHERE slug = ? AND id NOT IN (
            SELECT id FROM post_revisions WHERE slug = ? ORDER BY id DESC LIMIT ?
          )`,
    args: [slug, slug, REVISION_LIMIT],
  })
  scheduleSync()
}

/** 删除某篇的全部历史。文章删除时一并调用——否则删文后新建同
 *  slug 的文章会"继承"已删文章的旧版本，甚至能把旧内容恢复回来。 */
export async function deletePostRevisions(slug: string): Promise<void> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute({
    sql: "DELETE FROM post_revisions WHERE slug = ?",
    args: [safeSlug(slug)],
  })
  if (result.rowsAffected > 0) scheduleSync()
}

/** 改名后把旧 slug 的历史迁到新 slug 下。 */
export async function migratePostRevisions(
  fromSlug: string,
  toSlug: string
): Promise<void> {
  const from = safeSlug(fromSlug)
  const to = safeSlug(toSlug)
  if (from === to) return
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute({
    sql: "UPDATE post_revisions SET slug = ? WHERE slug = ?",
    args: [to, from],
  })
  if (result.rowsAffected > 0) scheduleSync()
}

// ── Reads ───────────────────────────────────────────────────────────────

/** 某篇文章的历史列表（新的在前）。摘要不含 content——列表接口
 *  不应该拖着 20 份全文。 */
export async function listPostRevisions(
  slug: string
): Promise<PostRevisionSummary[]> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute({
    sql: `SELECT id, slug, title, draft, word_count, created_at
          FROM post_revisions WHERE slug = ? ORDER BY id DESC`,
    args: [safeSlug(slug)],
  })
  return result.rows.map((row) => ({
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    draft: Boolean(row.draft),
    wordCount: Number(row.word_count),
    createdAt: String(row.created_at),
  }))
}

export async function getPostRevision(id: number): Promise<PostRevision | null> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute({
    sql: "SELECT * FROM post_revisions WHERE id = ?",
    args: [id],
  })
  const row = result.rows[0]
  if (!row) return null
  return {
    ...rowToPost(row),
    id: Number(row.id),
    createdAt: String(row.created_at),
  }
}
