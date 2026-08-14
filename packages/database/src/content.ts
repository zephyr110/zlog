import { type Client } from "@libsql/client"
import { requireDb } from "./db"
import { type Post, type PostSummary } from "@zlog/core"
import { toPostSummary } from "@zlog/core"
import { safeSlug } from "@zlog/core"

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
      // Migrate existing DBs that predate pinned_at.
      try {
        await db.execute("ALTER TABLE posts ADD COLUMN pinned_at TEXT")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/duplicate column/i.test(msg)) throw err
      }
    })().catch((err) => {
      tableReady = null // reset on failure so next call retries
      throw err
    })
  }
  await tableReady
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPost(row: any): Post {
  let tags: string[] = []
  try {
    tags = JSON.parse(row.tags || "[]")
  } catch {
    tags = []
  }

  return {
    slug: row.slug,
    title: row.title,
    date: row.date,
    updated: row.updated ?? undefined,
    tags,
    description: row.description,
    cover: row.cover ?? undefined,
    draft: Boolean(row.draft),
    pinnedAt: (row.pinned_at as string | null) ?? null,
    content: row.content,
    wordCount: row.word_count,
    readingTime: row.reading_time,
  }
}

function toParams(post: Post) {
  return {
    slug: safeSlug(post.slug),
    title: post.title,
    date: post.date,
    updated: post.updated ?? null,
    tags: JSON.stringify(post.tags),
    description: post.description,
    cover: post.cover ?? null,
    draft: post.draft ? 1 : 0,
    pinned_at: post.pinnedAt,
    content: post.content,
    word_count: post.wordCount,
    reading_time: post.readingTime,
  }
}

// ── Public API ──────────────────────────────────────────────────────────

export async function getAllPosts(
  includeDrafts = false,
  limit?: number
): Promise<Post[]> {
  const db = requireDb()
  await ensureTable(db)

  let sql = "SELECT * FROM posts"
  if (!includeDrafts) sql += " WHERE draft = 0"
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
    "SELECT COUNT(*) AS count FROM posts WHERE draft = 0"
  )
  return Number(result.rows[0]?.count ?? 0)
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
      sql: "SELECT * FROM posts WHERE slug = ? AND draft = 0",
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

  // If the slug changed, remove the old row to avoid duplicates.
  if (previousSlug && safeSlug(previousSlug) !== clean) {
    await db.execute({
      sql: "DELETE FROM posts WHERE slug = ?",
      args: [safeSlug(previousSlug)],
    })
  }

  const p = toParams(post)
  // pinned_at is written on INSERT only. Updates must not touch it — pin /
  // unpin goes through setPostPinned, and editor/auto-save RMW must not
  // clobber a newer pin with a stale null from a prior read.
  await db.execute({
    sql: `INSERT INTO posts (slug, title, date, updated, tags, description, cover, draft, pinned_at, content, word_count, reading_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET
            title=excluded.title, date=excluded.date, updated=excluded.updated,
            tags=excluded.tags, description=excluded.description, cover=excluded.cover,
            draft=excluded.draft, content=excluded.content,
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
      p.content,
      p.word_count,
      p.reading_time,
    ],
  })
}

export async function deletePost(slug: string): Promise<boolean> {
  const db = requireDb()
  await ensureTable(db)

  const clean = safeSlug(slug)
  const result = await db.execute({
    sql: "DELETE FROM posts WHERE slug = ?",
    args: [clean],
  })

  return result.rowsAffected > 0
}

export async function movePost(
  slug: string,
  toDraft: boolean
): Promise<Post | null> {
  const post = await getPostBySlug(slug, true)
  if (!post) return null

  post.draft = toDraft
  await savePost(post)

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
            WHERE draft = 0 AND pinned_at IS NOT NULL ${excludeSql}
            ORDER BY pinned_at DESC, date DESC
            LIMIT ?`,
      args: exclude ? [exclude, pinnedLimit] : [pinnedLimit],
    }),
    db.execute({
      sql: `SELECT * FROM posts
            WHERE draft = 0 AND pinned_at IS NULL ${excludeSql}
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

  const result = await db.execute("SELECT tags FROM posts")
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
