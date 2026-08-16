import { type Client } from "@libsql/client"
import { requireDb, createTableGuard } from "./db"

// ── Schema ──────────────────────────────────────────────────────────────

const USERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`

// ── Types ───────────────────────────────────────────────────────────────

export interface UserRecord {
  username: string
  passwordHash: string
  /** bcrypt hash of the one-time recovery key; null when never set. */
  recoveryHash: string | null
  /** Opaque version token — changes whenever the password changes. */
  passwordVersion: string
}

// ── Helpers ─────────────────────────────────────────────────────────────

const ensureUsersTable = createTableGuard(async () => {
  const db = requireDb()
  await db.executeMultiple(USERS_SCHEMA)
  // Migrate pre-recovery tables: CREATE TABLE IF NOT EXISTS won't add
  // the column to an existing table. Only the duplicate-column error
  // is expected — anything else (e.g. a locked DB) must propagate,
  // otherwise the column stays missing and every user lookup fails.
  try {
    await db.execute("ALTER TABLE users ADD COLUMN recovery_hash TEXT")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/duplicate column/i.test(msg)) throw err
  }
})

/** .env stores the bcrypt hash base64-encoded to survive $-expansion. */
function decodeEnvHash(hash: string | undefined): string | undefined {
  if (!hash) return undefined
  try {
    return Buffer.from(hash, "base64").toString("utf8")
  } catch {
    return hash
  }
}

// Seed once: if the users table is empty, create the default admin from env.
let seedPromise: Promise<void> | null = null

function ensureSeeded(db: Client): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await ensureUsersTable()
      const count = await db.execute("SELECT COUNT(*) AS c FROM users")
      if (Number(count.rows[0]?.c ?? 0) === 0) {
        const username = process.env.ADMIN_USERNAME
        const hash = decodeEnvHash(process.env.ADMIN_PASSWORD_HASH)
        if (username && hash) {
          await db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            [username, hash]
          )
          // Optional pre-hashed recovery key (base64 bcrypt, like
          // ADMIN_PASSWORD_HASH). Without one, the forgot-password flow
          // can't be used until `pnpm create-admin` assigns a key.
          const keyHash = decodeEnvHash(process.env.ADMIN_RECOVERY_KEY_HASH)
          if (keyHash) {
            await db.execute(
              "UPDATE users SET recovery_hash = ? WHERE username = ?",
              [keyHash, username]
            )
          } else {
            console.warn(
              "[auth] env-seeded admin has no recovery key — the forgot-" +
                "password flow needs one. Run `pnpm create-admin` to set it."
            )
          }
        } else {
          console.warn(
            "[auth] users table is empty and ADMIN_USERNAME/ADMIN_PASSWORD_HASH " +
              "are not set. Run `pnpm create-admin` to create the first user."
          )
        }
      }
    })().catch((err) => {
      seedPromise = null // reset so next call retries
      throw err
    })
  }
  return seedPromise
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Returns the user record, or null if the user does not exist.
 * Database errors are logged and also return null so callers surface
 * a generic "invalid credentials" response.
 */
export async function getUserByUsername(
  username: string
): Promise<UserRecord | null> {
  try {
    const db = requireDb()
    await ensureSeeded(db)

    const result = await db.execute(
      "SELECT username, password_hash, recovery_hash, updated_at FROM users WHERE username = ?",
      [username]
    )
    const row = result.rows[0]
    if (!row) return null

    return {
      username: row.username as string,
      passwordHash: row.password_hash as string,
      recoveryHash: (row.recovery_hash as string | null) ?? null,
      passwordVersion: row.updated_at as string,
    }
  } catch (error) {
    console.error("[auth] user lookup failed:", error)
    return null
  }
}

/** Updates the password hash for a user; bumps updated_at to invalidate old JWTs. */
export async function setUserPassword(
  username: string,
  passwordHash: string
): Promise<boolean> {
  try {
    const db = requireDb()
    await ensureSeeded(db)

    const result = await db.execute(
      "UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE username = ?",
      [passwordHash, username]
    )
    return Number(result.rowsAffected) > 0
  } catch {
    return false
  }
}

/** Stores (replaces) the bcrypt hash of the user's one-time recovery key. */
export async function setUserRecoveryHash(
  username: string,
  recoveryHash: string
): Promise<boolean> {
  try {
    const db = requireDb()
    await ensureSeeded(db)

    const result = await db.execute(
      "UPDATE users SET recovery_hash = ? WHERE username = ?",
      [recoveryHash, username]
    )
    return Number(result.rowsAffected) > 0
  } catch {
    return false
  }
}
