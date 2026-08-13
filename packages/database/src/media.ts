import { type Client } from "@libsql/client"
import { getDb } from "./db"
import { scheduleSync } from "./sync"

// ── Schema ──────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT UNIQUE NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  github_sha TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);
`

// ── Helpers ─────────────────────────────────────────────────────────────

function requireDb(): Client {
  const db = getDb()
  if (!db) {
    throw new Error(
      "TURSO_DATABASE_URL environment variable is required. " +
        "Set it to a libsql:// or file: URL (and TURSO_AUTH_TOKEN for remote databases)."
    )
  }
  return db
}

let tableReady: Promise<void> | null = null

async function ensureTable(db: Client): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.executeMultiple(SCHEMA)
    })().catch((err) => {
      tableReady = null // reset on failure so next call retries
      throw err
    })
  }
  await tableReady
}

// ── Records ─────────────────────────────────────────────────────────────

export interface MediaRecord {
  filename: string
  contentType: string
  size: number
  data: Uint8Array
  githubSha: string | null
  createdAt: string
}

/** List row — explicitly excludes `data` (BLOB) to keep listings cheap. */
export interface MediaMeta {
  name: string
  contentType: string
  size: number
  createdAt: string
}

// ── Queries ─────────────────────────────────────────────────────────────

export async function insertMedia(record: {
  filename: string
  contentType: string
  size: number
  data: Uint8Array
  githubSha?: string | null
}): Promise<void> {
  const db = requireDb()
  await ensureTable(db)
  await db.execute({
    sql: "INSERT INTO media (filename, content_type, size, data, github_sha) VALUES (?, ?, ?, ?, ?)",
    args: [
      record.filename,
      record.contentType,
      record.size,
      record.data,
      record.githubSha ?? null,
    ],
  })

  scheduleSync()
}

/** Backfill the GitHub sha after the Contents API push succeeds. */
export async function setMediaSha(
  filename: string,
  githubSha: string
): Promise<void> {
  const db = requireDb()
  await ensureTable(db)
  await db.execute({
    sql: "UPDATE media SET github_sha = ? WHERE filename = ?",
    args: [githubSha, filename],
  })
}

/**
 * Optional list filter. from/to are UTC "YYYY-MM-DD HH:MM:SS" strings
 * (created_at is stored as UTC datetime); the API layer expands bare
 * "YYYY-MM-DD" to day boundaries. Passed through verbatim so the client
 * can express its local-day window exactly. q is a case-insensitive
 * filename substring match.
 */
export interface MediaFilter {
  from?: string
  to?: string
  q?: string
}

/** Escape LIKE wildcards so a user query matches literally (% and _ in a
 *  filename no longer act as pattern metacharacters). */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&")
}

/** WHERE clause + args shared by listMedia and countMedia. */
function filterSql(filter?: MediaFilter): { sql: string; args: string[] } {
  const clauses: string[] = []
  const args: string[] = []
  if (filter?.from) {
    clauses.push("created_at >= ?")
    args.push(filter.from)
  }
  if (filter?.to) {
    clauses.push("created_at <= ?")
    args.push(filter.to)
  }
  if (filter?.q) {
    clauses.push("filename LIKE ? ESCAPE '\\' COLLATE NOCASE")
    args.push(`%${escapeLike(filter.q)}%`)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args }
}

/** List media, newest first. Optional limit/offset pages the result; a
 *  date filter narrows it to an inclusive created_at range and q to a
 *  filename substring. */
export async function listMedia(
  limit?: number,
  offset = 0,
  filter?: MediaFilter
): Promise<MediaMeta[]> {
  const db = requireDb()
  await ensureTable(db)
  const { sql: where, args } = filterSql(filter)
  const result = limit
    ? await db.execute({
        sql: `SELECT filename, content_type, size, created_at FROM media ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      })
    : await db.execute(
        `SELECT filename, content_type, size, created_at FROM media ${where} ORDER BY created_at DESC`,
        args
      )
  return result.rows.map((row) => ({
    name: row.filename as string,
    contentType: row.content_type as string,
    size: row.size as number,
    createdAt: row.created_at as string,
  }))
}

export async function countMedia(filter?: MediaFilter): Promise<number> {
  const db = requireDb()
  await ensureTable(db)
  const { sql: where, args } = filterSql(filter)
  const result = await db.execute(
    `SELECT COUNT(*) AS n FROM media ${where}`,
    args
  )
  return Number(result.rows[0]?.n ?? 0)
}

export async function getMediaData(
  filename: string
): Promise<MediaRecord | null> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute({
    sql: "SELECT filename, content_type, size, data, github_sha, created_at FROM media WHERE filename = ?",
    args: [filename],
  })
  const row = result.rows[0]
  if (!row) return null
  return {
    filename: row.filename as string,
    contentType: row.content_type as string,
    size: row.size as number,
    // libsql returns BLOBs as Uint8Array at runtime; the client's Value
    // union types it more loosely, so cast through unknown.
    data: row.data as unknown as Uint8Array,
    githubSha: (row.github_sha as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

/** Deletes the row and returns it (with BLOB) so callers can roll back. */
export async function deleteMedia(
  filename: string
): Promise<MediaRecord | null> {
  const existing = await getMediaData(filename)
  if (!existing) return null
  const db = requireDb()
  await db.execute({
    sql: "DELETE FROM media WHERE filename = ?",
    args: [filename],
  })
  scheduleSync()
  return existing
}
