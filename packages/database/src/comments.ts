import { type Client } from "@libsql/client"
import { requireDb, createTableGuard } from "./db"
import { scheduleSync } from "./sync"

// ── Schema ──────────────────────────────────────────────────────────────
// Self-hosted comments (replaces giscus). Guest comments are public on
// arrival (no moderation queue — spam is filtered before insert by the
// API), so a deleted comment is a hard delete, not a hide flag.
// ip_hash is a SHA-256 of the visitor IP — stored only so rate limiting
// can be enforced in the DB (serverless instances share no memory).
// parent_id threads replies under a root comment (single-level nesting —
// a reply's parent is always a root; the API enforces this).

const COMMENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  parent_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_slug);
CREATE INDEX IF NOT EXISTS idx_comments_unread ON comments(is_read);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
`

// Fixed sliding windows for the three rate-limit scopes. A window is
// keyed by floor(now / windowMs), so the counter resets naturally when
// the clock crosses a boundary — no eviction/cleanup needed. Scopes:
//   ip:<hash>    — one visitor, 15 min
//   post:<slug>  — one article, 1 h (concentrated flooding of a post)
//   global       — the whole site, 1 h (script flood peak)
const RATE_LIMIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS comment_rate_limit (
  scope TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, window_start)
);
`

export const RATE_LIMIT_IP_WINDOW_MS = 15 * 60 * 1000
export const RATE_LIMIT_IP_MAX = 5
export const RATE_LIMIT_POST_WINDOW_MS = 60 * 60 * 1000
export const RATE_LIMIT_POST_MAX = 20
export const RATE_LIMIT_GLOBAL_WINDOW_MS = 60 * 60 * 1000
export const RATE_LIMIT_GLOBAL_MAX = 200

// ── Types ───────────────────────────────────────────────────────────────

export interface CommentRecord {
  id: number
  postSlug: string
  authorName: string
  authorEmail: string
  content: string
  ipHash: string
  isRead: boolean
  /** Root comment: null. Reply: the parent comment's id (single-level —
   *  the API rejects a reply whose target is itself a reply). */
  parentId: number | null
  createdAt: string
}

/** Admin list item — parentName is joined in so the inbox can label a
 *  thread without a second query (a reply's parent may live on an
 *  earlier page of the paginated list). */
export interface AdminCommentRecord extends CommentRecord {
  parentName: string | null
}

export interface AdminCommentPage {
  items: AdminCommentRecord[]
  total: number
  page: number
  pageSize: number
  unreadCount: number
}

// ── Helpers ─────────────────────────────────────────────────────────────

const ensureTables = createTableGuard(async () => {
  const db = requireDb()
  await db.executeMultiple(COMMENTS_SCHEMA)
  // Migrate tables created before replies existed. PRAGMA-gated so a
  // fresh DB (column already in the CREATE TABLE above) never runs a
  // guaranteed-failing ALTER on every cold start; the try/catch still
  // covers concurrent cold-starts racing the ALTER on an old table.
  const { rows } = await db.execute("PRAGMA table_info(comments)")
  const hasParent = rows.some((r) => (r as { name?: unknown }).name === "parent_id")
  if (!hasParent) {
    try {
      await db.execute("ALTER TABLE comments ADD COLUMN parent_id INTEGER")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/duplicate column/i.test(msg)) throw err
    }
  }
  // Must run AFTER the migration: on a pre-reply table, CREATE INDEX on
  // a missing column would fail with "no such column".
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id)"
  )
  await db.executeMultiple(RATE_LIMIT_SCHEMA)
})

function rowToComment(row: Record<string, unknown>): CommentRecord {
  return {
    id: Number(row.id),
    postSlug: String(row.post_slug),
    authorName: String(row.author_name),
    authorEmail: String(row.author_email ?? ""),
    content: String(row.content),
    ipHash: String(row.ip_hash),
    isRead: Number(row.is_read) !== 0,
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    createdAt: String(row.created_at),
  }
}

function rowToAdminComment(row: Record<string, unknown>): AdminCommentRecord {
  return {
    ...rowToComment(row),
    parentName: row.parent_name == null ? null : String(row.parent_name),
  }
}

// ── Comment CRUD ────────────────────────────────────────────────────────

/** Public list for one post, oldest first (conversation order).
 *  Returns full records — the route strips author_email/ip_hash before
 *  responding (the guest never sees them). */
export async function getCommentsByPost(
  postSlug: string
): Promise<CommentRecord[]> {
  const db = requireDb()
  await ensureTables()
  const result = await db.execute(
    `SELECT id, post_slug, author_name, author_email, content, ip_hash, is_read, parent_id, created_at
     FROM comments WHERE post_slug = ? ORDER BY created_at ASC`,
    [postSlug]
  )
  return result.rows.map((r) => rowToComment(r as unknown as Record<string, unknown>))
}

/** Lean reply-target lookup — existence plus the two fields the POST
 *  route validates (same post, root comment). The full row (content,
 *  email, ip hash) is never needed here; a 2-column read keeps this
 *  check cheap on the comment-submit path. */
export async function getReplyTarget(
  id: number
): Promise<{ postSlug: string; parentId: number | null } | null> {
  const db = requireDb()
  await ensureTables()
  const result = await db.execute(
    `SELECT post_slug, parent_id FROM comments WHERE id = ?`,
    [id]
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    postSlug: String(row.post_slug),
    parentId: row.parent_id == null ? null : Number(row.parent_id),
  }
}

export async function createComment(input: {
  postSlug: string
  authorName: string
  authorEmail: string
  content: string
  ipHash: string
  parentId: number | null
}): Promise<CommentRecord> {
  const db = requireDb()
  await ensureTables()
  const result = await db.execute(
    `INSERT INTO comments (post_slug, author_name, author_email, content, ip_hash, parent_id)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [
      input.postSlug,
      input.authorName,
      input.authorEmail,
      input.content,
      input.ipHash,
      input.parentId,
    ]
  )
  scheduleSync()
  return rowToComment(result.rows[0] as unknown as Record<string, unknown>)
}

/** Insert a reply only when its parent still qualifies (exists, same
 *  post, root comment) — the atomic backstop for the route's pre-check
 *  (step 7), closing the delete-between-check-and-insert window. The
 *  INSERT ... SELECT returns no row when the parent no longer matches,
 *  so a reply can never be orphaned. Returns null in that case. */
export async function createReply(input: {
  postSlug: string
  authorName: string
  authorEmail: string
  content: string
  ipHash: string
  parentId: number
}): Promise<CommentRecord | null> {
  const db = requireDb()
  await ensureTables()
  const result = await db.execute(
    `INSERT INTO comments (post_slug, author_name, author_email, content, ip_hash, parent_id)
     SELECT ?, ?, ?, ?, ?, p.id FROM comments p
     WHERE p.id = ? AND p.post_slug = ? AND p.parent_id IS NULL
     RETURNING *`,
    [
      input.postSlug,
      input.authorName,
      input.authorEmail,
      input.content,
      input.ipHash,
      input.parentId,
      input.postSlug,
    ]
  )
  const row = result.rows[0]
  if (!row) return null
  scheduleSync()
  return rowToComment(row as unknown as Record<string, unknown>)
}

/**
 * Admin list — unread first, then newest. Returns pagination metadata
 * plus the total unread count (for the sidebar badge) in one query batch.
 */
export async function listAdminComments(input: {
  page: number
  pageSize: number
}): Promise<AdminCommentPage> {
  const db = requireDb()
  await ensureTables()
  const { page, pageSize } = input
  const offset = (page - 1) * pageSize

  const result = await db.batch([
    {
      // Join the parent's name so a reply is labeled with its thread
      // root — the parent is not guaranteed to be on this page.
      sql: `SELECT c.*, p.author_name AS parent_name
            FROM comments c
            LEFT JOIN comments p ON p.id = c.parent_id
            ORDER BY c.is_read ASC, c.created_at DESC
            LIMIT ? OFFSET ?`,
      args: [pageSize, offset],
    },
    {
      sql: `SELECT COUNT(*) AS total FROM comments`,
      args: [],
    },
    {
      sql: `SELECT COUNT(*) AS unread FROM comments WHERE is_read = 0`,
      args: [],
    },
  ])

  return {
    items: result[0].rows.map((r) => rowToAdminComment(r as unknown as Record<string, unknown>)),
    total: Number(result[1].rows[0]?.total ?? 0),
    page,
    pageSize,
    unreadCount: Number(result[2].rows[0]?.unread ?? 0),
  }
}

/** Lightweight unread count for the sidebar badge polling. */
export async function countUnreadComments(): Promise<number> {
  const db = requireDb()
  await ensureTables()
  const result = await db.execute(
    `SELECT COUNT(*) AS unread FROM comments WHERE is_read = 0`
  )
  return Number(result.rows[0]?.unread ?? 0)
}

export async function markCommentRead(id: number): Promise<boolean> {
  const db = requireDb()
  await ensureTables()
  const result = await db.execute(
    `UPDATE comments SET is_read = 1 WHERE id = ?`,
    [id]
  )
  const marked = Number(result.rowsAffected) > 0
  if (marked) scheduleSync()
  return marked
}

/** Delete a comment — deleting a root takes its replies with it (a
 *  thread whose parent is gone would otherwise dangle under nothing).
 *  Returns how many rows were removed and how many of those were
 *  unread, so the admin page can adjust its counts exactly even when
 *  the replies live on other pages of the paginated inbox. */
export async function deleteComment(
  id: number
): Promise<{ removed: number; removedUnread: number }> {
  const db = requireDb()
  await ensureTables()
  const unread = await db.execute(
    `SELECT COUNT(*) AS n FROM comments WHERE (id = ? OR parent_id = ?) AND is_read = 0`,
    [id, id]
  )
  const result = await db.execute(
    `DELETE FROM comments WHERE id = ? OR parent_id = ?`,
    [id, id]
  )
  const removed = Number(result.rowsAffected)
  if (removed > 0) scheduleSync()
  return {
    removed,
    removedUnread: Number(unread.rows[0]?.n ?? 0),
  }
}

// ── Rate limiting ───────────────────────────────────────────────────────

/**
 * Increment the counter for a scope/window and report whether the
 * window's budget is still available. Returns false (and still counts
 * the attempt) once the budget is exhausted — the caller rejects with
 * 429. Race-tolerant: a burst can momentarily over-count, which is the
 * safe direction for a spam gate.
 */
export async function consumeRateLimit(
  scope: string,
  windowMs: number,
  max: number
): Promise<boolean> {
  const db = requireDb()
  await ensureTables()
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs

  // Single statement: upsert the counter and read the new value in one
  // round trip via RETURNING.
  const result = await db.execute(
    `INSERT INTO comment_rate_limit (scope, window_start, count)
     VALUES (?, ?, 1)
     ON CONFLICT(scope, window_start) DO UPDATE SET count = count + 1
     RETURNING count`,
    [scope, windowStart]
  )
  const count = Number(result.rows[0]?.count ?? 0)
  // Sweep expired windows while we're here — the table would otherwise
  // grow unboundedly (one row per (scope, window) forever). Windows are
  // at most 1h, so anything older than ~2h is dead weight.
  await db.execute(
    `DELETE FROM comment_rate_limit WHERE window_start < ?`,
    [Date.now() - 2 * 60 * 60 * 1000]
  )
  return count <= max
}

/** Reusable scope keys. */
export function ipRateScope(ipHash: string): string {
  return `ip:${ipHash}`
}
export function postRateScope(postSlug: string): string {
  return `post:${postSlug}`
}
export const GLOBAL_RATE_SCOPE = "global"
