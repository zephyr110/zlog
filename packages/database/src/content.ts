import { type Client } from "@libsql/client"
import { requireDb } from "./db"
import { scheduleSync } from "./sync"
import { type Post, type PostSummary } from "@zlog/core"
import { toPostSummary } from "@zlog/core"
import { safeSlug } from "@zlog/core"
import { rowToPost, toParams } from "./post-row"
import {
  deletePostRevisions,
  insertPostRevision,
  migratePostRevisions,
  samePostContent,
} from "./revisions"

// ── Schema ──────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_date ON posts(date DESC);
CREATE INDEX IF NOT EXISTS idx_posts_draft ON posts(draft);
`

// ── Helpers ─────────────────────────────────────────────────────────────

let tableReady: Promise<void> | null = null

async function ensureTable(db: Client): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.executeMultiple(SCHEMA)
      // Migrate existing DBs that predate pinned_at / publish_at.
      for (const column of ["pinned_at TEXT", "publish_at TEXT"]) {
        try {
          await db.execute(`ALTER TABLE posts ADD COLUMN ${column}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (!/duplicate column/i.test(msg)) throw err
        }
      }
    })().catch((err) => {
      tableReady = null // reset on failure so next call retries
      throw err
    })
  }
  await tableReady
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
/** Escape LIKE wildcards so user input matches literally (paired with
 *  ESCAPE '\' in the query — escaping the backslash itself first). */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

/** Public visibility, in one place: not a draft, and either unscheduled
 *  or past its publish time. publish_at shares the "YYYY-MM-DD HH:MM:SS"
 *  UTC format of datetime('now'), so the comparison is exact. */
const PUBLISHED_SQL =
  "draft = 0 AND (publish_at IS NULL OR publish_at <= datetime('now'))"

// ── Public API ──────────────────────────────────────────────────────────

export async function getAllPosts(
  includeDrafts = false,
  limit?: number
): Promise<Post[]> {
  const db = requireDb()
  await ensureTable(db)

  let sql = "SELECT * FROM posts"
  if (!includeDrafts) sql += ` WHERE ${PUBLISHED_SQL}`
  // ISO "YYYY-MM-DD" dates sort correctly as text in SQLite — no JS
  // re-sort needed. The TEXT NOT NULL column guarantees a value.
  sql += " ORDER BY date DESC"
  const args: Array<string | number> = []
  if (limit !== undefined) {
    sql += " LIMIT ?"
    args.push(limit)
  }

  const result = await db.execute({ sql, args })
  return result.rows.map(rowToPost)
}

export async function getPublishedPosts(limit?: number): Promise<PostSummary[]> {
  const posts = await getAllPosts(false, limit)
  return posts.map(toPostSummary)
}

export async function getPublishedCount(): Promise<number> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute(
    `SELECT COUNT(*) AS count FROM posts WHERE ${PUBLISHED_SQL}`
  )
  return Number(result.rows[0]?.count ?? 0)
}

/** Full-text-ish search over published posts: every term must hit at
 *  least one of title / description / content (AND semantics).
 *
 *  LIKE, not FTS5 — deliberately: the desktop app runs against an
 *  embedded replica, and FTS5 shadow tables rebuilt locally would churn
 *  against cloud-replicated state (this project has already been bitten
 *  by WalConflict on concurrent frame writes). At blog scale a full-table
 *  LIKE is milliseconds. Ranking + snippets live in the web layer's pure
 *  functions; the candidate set is date-capped so a huge result set can't
 *  drag whole articles back over the wire. */
export async function searchPublishedPosts(
  terms: string[],
  candidateLimit = 200
): Promise<Post[]> {
  const db = requireDb()
  await ensureTable(db)

  const clean = terms.map((term) => term.trim()).filter(Boolean).slice(0, 6)
  if (clean.length === 0) return []

  const clauses: string[] = []
  const args: Array<string | number> = []
  for (const term of clean) {
    const pattern = `%${escapeLike(term)}%`
    clauses.push(
      "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')"
    )
    args.push(pattern, pattern, pattern)
  }
  args.push(candidateLimit)

  const result = await db.execute({
    sql: `SELECT * FROM posts WHERE ${PUBLISHED_SQL} AND ${clauses.join(" AND ")} ORDER BY date DESC LIMIT ?`,
    args,
  })
  return result.rows.map(rowToPost)
}

export async function getPostBySlug(
  slug: string,
  includeDrafts = false
): Promise<Post | null> {
  const db = requireDb()
  await ensureTable(db)

  const clean = safeSlug(slug)

  let result
  if (includeDrafts) {
    result = await db.execute({
      sql: "SELECT * FROM posts WHERE slug = ?",
      args: [clean],
    })
  } else {
    result = await db.execute({
      sql: `SELECT * FROM posts WHERE slug = ? AND ${PUBLISHED_SQL}`,
      args: [clean],
    })
  }

  if (result.rows.length === 0) return null
  return rowToPost(result.rows[0])
}

export async function savePost(
  post: Post,
  previousSlug?: string
): Promise<void> {
  const db = requireDb()
  await ensureTable(db)

  const clean = safeSlug(post.slug)

  // 版本历史：改名先迁移旧 slug 的历史；被覆盖的旧行若内容确有变化，
  // 整份存入 post_revisions（自动保存的幂等写入不产生快照）。
  const oldSlug = previousSlug ? safeSlug(previousSlug) : clean
  const existing = await getPostBySlug(oldSlug, true)
  if (oldSlug !== clean) await migratePostRevisions(oldSlug, clean)
  if (existing && !samePostContent(existing, post)) {
    await insertPostRevision(existing, clean)
  }

  // If the slug changed, remove the old row to avoid duplicates.
  if (oldSlug !== clean) {
    await db.execute({
      sql: "DELETE FROM posts WHERE slug = ?",
      args: [oldSlug],
    })
  }

  const p = toParams(post)
  // pinned_at is written on INSERT only. Updates must not touch it — pin /
  // unpin goes through setPostPinned, and editor/auto-save RMW must not
  // clobber a newer pin with a stale null from a prior read. publish_at,
  // by contrast, is the editor's to change on every save.
  await db.execute({
    sql: `INSERT INTO posts (slug, title, date, updated, tags, description, cover, draft, pinned_at, publish_at, content, word_count, reading_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET
            title=excluded.title, date=excluded.date, updated=excluded.updated,
            tags=excluded.tags, description=excluded.description, cover=excluded.cover,
            draft=excluded.draft, publish_at=excluded.publish_at, content=excluded.content,
            word_count=excluded.word_count, reading_time=excluded.reading_time,
            updated_at=datetime('now')`,
    args: [
      p.slug,
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

  scheduleSync()
}

export async function deletePost(slug: string): Promise<boolean> {
  const db = requireDb()
  await ensureTable(db)

  const clean = safeSlug(slug)
  const result = await db.execute({
    sql: "DELETE FROM posts WHERE slug = ?",
    args: [clean],
  })

  const deleted = result.rowsAffected > 0
  if (deleted) {
    // 历史快照一并删除：删除是永久性的，孤立的旧版本既无处可看，
    // 又会被同 slug 的新文章"继承"。
    await deletePostRevisions(clean)
    scheduleSync()
  }
  return deleted
}

export async function movePost(
  slug: string,
  toDraft: boolean
): Promise<Post | null> {
  const post = await getPostBySlug(slug, true)
  if (!post) return null

  post.draft = toDraft
  // Publishing an unpublished post means "publish now" — a future
  // schedule from a previous edit must not silently swallow the click.
  if (!toDraft) post.publishAt = null
  await savePost(post)

  scheduleSync()
  return post
}

export async function setPostPinned(
  slug: string,
  pinned: boolean
): Promise<Post | null> {
  const db = requireDb()
  await ensureTable(db)
  const clean = safeSlug(slug)
  const existing = await getPostBySlug(clean, true)
  if (!existing) return null

  // Idempotent: re-pinning an already-pinned post keeps its original
  // pinned_at — rewriting the timestamp would silently reorder the
  // homepage pins (ORDER BY pinned_at DESC).
  if (pinned === Boolean(existing.pinnedAt)) return existing

  // Same "YYYY-MM-DD HH:MM:SS" format as created_at/updated_at
  // (datetime('now')) — an ISO string would mix formats in one table.
  const pinnedAt = pinned
    ? new Date().toISOString().slice(0, 19).replace("T", " ")
    : null

  const result = await db.execute({
    sql: `UPDATE posts SET pinned_at = ?, updated_at = datetime('now') WHERE slug = ? RETURNING *`,
    args: [pinnedAt, clean],
  })
  const row = result.rows[0]
  if (row) scheduleSync()
  return row ? rowToPost(row) : null
}

/** Homepage "Latest" grid: pinned posts first, then the newest unpinned
 *  posts fill the remaining slots. Pinned is capped at limit − 1 — at
 *  least one slot is always reserved for fresh unpinned content, so
 *  pinning many posts can't push every recent article off the homepage.
 *  `excludeSlug` drops the Featured spotlight so it isn't duplicated and
 *  so the unpinned reserve still applies to posts that actually render. */
export async function getHomepageLatestPosts(
  limit: number,
  excludeSlug?: string
): Promise<PostSummary[]> {
  const db = requireDb()
  await ensureTable(db)
  const pinnedLimit = Math.max(1, limit - 1)
  const exclude = excludeSlug ? safeSlug(excludeSlug) : null
  const excludeSql = exclude ? "AND slug != ?" : ""
  const [pinned, unpinned] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM posts
            WHERE ${PUBLISHED_SQL} AND pinned_at IS NOT NULL ${excludeSql}
            ORDER BY pinned_at DESC, date DESC
            LIMIT ?`,
      args: exclude ? [exclude, pinnedLimit] : [pinnedLimit],
    }),
    db.execute({
      sql: `SELECT * FROM posts
            WHERE ${PUBLISHED_SQL} AND pinned_at IS NULL ${excludeSql}
            ORDER BY date DESC
            LIMIT ?`,
      args: exclude ? [exclude, limit] : [limit],
    }),
  ])
  const pinnedPosts = pinned.rows.map((row) => toPostSummary(rowToPost(row)))
  const unpinnedPosts = unpinned.rows.map((row) =>
    toPostSummary(rowToPost(row))
  )
  return [...pinnedPosts, ...unpinnedPosts].slice(0, limit)
}

export async function getAllTags(): Promise<string[]> {
  const db = requireDb()
  await ensureTable(db)

  // Public tag surfaces (nav, /tags, /topics): a tag whose only posts are
  // drafts or scheduled must not appear before its posts do.
  const result = await db.execute(
    `SELECT tags FROM posts WHERE ${PUBLISHED_SQL}`
  )
  const tagSet = new Set<string>()

  for (const row of result.rows) {
    let tags: string[]
    try {
      tags = JSON.parse((row.tags as string) || "[]")
    } catch {
      continue
    }
    for (const tag of tags) {
      if (tag) tagSet.add(tag.toLowerCase())
    }
  }

  return Array.from(tagSet).sort()
}

export async function getPostsByCategory(category: string): Promise<PostSummary[]> {
  const posts = await getPublishedPosts()
  const prefix = category.toLowerCase() + "-"
  return posts.filter((p) =>
    p.tags.some((t) => t.toLowerCase().startsWith(prefix))
  )
}

export async function getPostsByTag(tag: string): Promise<PostSummary[]> {
  const posts = await getPublishedPosts()
  return posts.filter((p) =>
    p.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
  )
}
