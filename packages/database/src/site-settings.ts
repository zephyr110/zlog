import { type Client } from "@libsql/client"
import { getDb } from "./db"
import { scheduleSync } from "./sync"

// ── Schema ──────────────────────────────────────────────────────────────
// Singleton row (id = 1) for editable site identity + social links.
// siteUrl stays in env (NEXT_PUBLIC_SITE_URL) — not stored here.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  logo_invert_dark INTEGER NOT NULL DEFAULT 1,
  github_url TEXT NOT NULL DEFAULT '',
  twitter_url TEXT NOT NULL DEFAULT '',
  comment_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`

export interface SiteSettingsRecord {
  name: string
  title: string
  description: string
  authorName: string
  logoUrl: string
  /** Invert monochrome logo in dark mode (1/0 in SQLite). */
  logoInvertDark: boolean
  githubUrl: string
  twitterUrl: string
  /** Guest comments master switch — off = the comment API rejects all
   *  new comments (spam kill-switch). */
  commentEnabled: boolean
}

export type SiteSettingsUpdate = Partial<SiteSettingsRecord>

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
      // Migrate existing DBs that predate logo_invert_dark.
      try {
        await db.execute(
          "ALTER TABLE site_settings ADD COLUMN logo_invert_dark INTEGER NOT NULL DEFAULT 1"
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/duplicate column/i.test(msg)) throw err
      }
      // Migrate existing DBs that predate comment_enabled.
      try {
        await db.execute(
          "ALTER TABLE site_settings ADD COLUMN comment_enabled INTEGER NOT NULL DEFAULT 1"
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/duplicate column/i.test(msg)) throw err
      }
    })().catch((err) => {
      tableReady = null
      throw err
    })
  }
  await tableReady
}

function rowToRecord(row: Record<string, unknown>): SiteSettingsRecord {
  // Missing column (pre-migration read) or NULL → default on.
  const invertRaw = row.logo_invert_dark
  const logoInvertDark =
    invertRaw === undefined || invertRaw === null
      ? true
      : Number(invertRaw) !== 0

  return {
    name: String(row.name ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    authorName: String(row.author_name ?? ""),
    logoUrl: String(row.logo_url ?? ""),
    logoInvertDark,
    githubUrl: String(row.github_url ?? ""),
    twitterUrl: String(row.twitter_url ?? ""),
    // Missing column (pre-migration read) or NULL → comments on.
    commentEnabled: row.comment_enabled === undefined || row.comment_enabled === null
      ? true
      : Number(row.comment_enabled) !== 0,
  }
}

/** Returns the singleton settings row, or null if not yet created. */
export async function getSiteSettings(): Promise<SiteSettingsRecord | null> {
  const db = requireDb()
  await ensureTable(db)
  const result = await db.execute("SELECT * FROM site_settings WHERE id = 1")
  const row = result.rows[0]
  if (!row) return null
  return rowToRecord(row as unknown as Record<string, unknown>)
}

/**
 * Upserts the singleton settings row. Only provided fields are written;
 * omitted fields keep their previous value (or '' on first insert).
 */
export async function upsertSiteSettings(
  patch: SiteSettingsUpdate
): Promise<SiteSettingsRecord> {
  const db = requireDb()
  await ensureTable(db)

  const existing = await getSiteSettings()
  const next: SiteSettingsRecord = {
    name: patch.name ?? existing?.name ?? "",
    title: patch.title ?? existing?.title ?? "",
    description: patch.description ?? existing?.description ?? "",
    authorName: patch.authorName ?? existing?.authorName ?? "",
    logoUrl: patch.logoUrl ?? existing?.logoUrl ?? "",
    logoInvertDark: patch.logoInvertDark ?? existing?.logoInvertDark ?? true,
    githubUrl: patch.githubUrl ?? existing?.githubUrl ?? "",
    twitterUrl: patch.twitterUrl ?? existing?.twitterUrl ?? "",
    commentEnabled: patch.commentEnabled ?? existing?.commentEnabled ?? true,
  }

  await db.execute({
    sql: `INSERT INTO site_settings
            (id, name, title, description, author_name, logo_url, logo_invert_dark, github_url, twitter_url, comment_enabled, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            title = excluded.title,
            description = excluded.description,
            author_name = excluded.author_name,
            logo_url = excluded.logo_url,
            logo_invert_dark = excluded.logo_invert_dark,
            github_url = excluded.github_url,
            twitter_url = excluded.twitter_url,
            comment_enabled = excluded.comment_enabled,
            updated_at = excluded.updated_at`,
    args: [
      next.name,
      next.title,
      next.description,
      next.authorName,
      next.logoUrl,
      next.logoInvertDark ? 1 : 0,
      next.githubUrl,
      next.twitterUrl,
      next.commentEnabled ? 1 : 0,
    ],
  })

  scheduleSync()
  return next
}
