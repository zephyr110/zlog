import { type Client } from "@libsql/client"
import { requireDb, createTableGuard } from "./db"

// ── Schema ──────────────────────────────────────────────────────────────

// Single-row lockout table (id CHECK = 1). The blog has exactly one admin,
// so a global failure counter is the strongest form of brute-force defense —
// there are no other users to lock out accidentally. Timestamps are
// ISO-8601 UTC (new Date().toISOString()), matching the users table
// convention; policy constants live next to the schema they drive.
const LOCKOUT_SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_lockout (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT,
  locked_until TEXT
);
`

const FAILURE_WINDOW_MS = 15 * 60 * 1000 // failures count within 15 minutes
const MAX_FAILURES = 5 // ... then the 5th failure locks out
const LOCKOUT_MS = 15 * 60 * 1000 // ... for 15 minutes

// ── Types ───────────────────────────────────────────────────────────────

export interface LockoutState {
  failCount: number
  /** ISO-8601 UTC timestamp of the first failure in the current window. */
  firstFailedAt: string | null
  /** ISO-8601 UTC timestamp until which login is locked; null when unlocked. */
  lockedUntil: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────

const ensureLockoutTable = createTableGuard(async () => {
  const db = requireDb()
  await db.executeMultiple(LOCKOUT_SCHEMA)
  // Materialize the singleton row so the UPDATEs below can rely on it.
  await db.execute("INSERT OR IGNORE INTO auth_lockout (id) VALUES (1)")
})

/** Milliseconds since the epoch for a stored ISO-8601 UTC timestamp. */
function parseIso(iso: string | null): number {
  if (!iso) return NaN
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : NaN
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Current lockout state, or null when the DB is unavailable (callers fail
 * open — a sick database must not block login). Timestamps are returned
 * raw; expiry is interpreted by the caller.
 */
export async function getLockoutState(): Promise<LockoutState | null> {
  try {
    const db = requireDb()
    await ensureLockoutTable()
    const result = await db.execute(
      "SELECT fail_count, first_failed_at, locked_until FROM auth_lockout WHERE id = 1"
    )
    const row = result.rows[0]
    if (!row) {
      // The singleton row is missing (deleted or copied from a table-less
      // DB) — recreate it instead of silently no-op'ing every UPDATE.
      await db.execute("INSERT OR IGNORE INTO auth_lockout (id) VALUES (1)")
      return { failCount: 0, firstFailedAt: null, lockedUntil: null }
    }
    return {
      failCount: Number(row.fail_count ?? 0),
      firstFailedAt: (row.first_failed_at as string | null) ?? null,
      lockedUntil: (row.locked_until as string | null) ?? null,
    }
  } catch (error) {
    console.error("[auth] lockout read failed:", error)
    return null
  }
}

/**
 * Records one failed credential attempt with a single atomic UPDATE.
 *
 * Semantics, all in one statement so concurrent attempts can never lose
 * increments or resurrect a cleared streak (SQLite serializes writes to a
 * row; SET expressions read the pre-update values):
 *  - While locked (locked_until > now): no-op — the count already stands
 *    and the lockout does NOT get extended by further failures.
 *  - Window spent (first failure older than FAILURE_WINDOW_MS) or lockout
 *    expired: reset the window and count this as failure #1.
 *  - Otherwise: increment; reaching MAX_FAILURES sets locked_until.
 *
 * first_failed_at is preserved while the window is live — only the reset
 * branch moves it, so the window measures from the FIRST failure, not the
 * latest one.
 */
export async function recordLoginFailure(now: number = Date.now()): Promise<void> {
  try {
    const db = requireDb()
    await ensureLockoutTable()
    // (julianday(ts) - 2440587.5) * 86400000 converts a stored ISO
    // timestamp to a 1970-epoch millisecond value, comparable with `now`.
    // julianday() counts days from 4713 BC — 2440587.5 days before the
    // 1970 epoch — and forgetting the offset silently breaks every
    // comparison against `now`.
    await db.execute(
      `UPDATE auth_lockout SET
        fail_count = CASE
          WHEN $now - (julianday(first_failed_at) - 2440587.5) * 86400000 <= $window
               AND (locked_until IS NULL OR (julianday(locked_until) - 2440587.5) * 86400000 < $now)
          THEN fail_count + 1
          ELSE 1
        END,
        first_failed_at = CASE
          WHEN $now - (julianday(first_failed_at) - 2440587.5) * 86400000 <= $window
               AND (locked_until IS NULL OR (julianday(locked_until) - 2440587.5) * 86400000 < $now)
          THEN first_failed_at
          ELSE $nowIso
        END,
        locked_until = CASE
          WHEN $now - (julianday(first_failed_at) - 2440587.5) * 86400000 <= $window
               AND (locked_until IS NULL OR (julianday(locked_until) - 2440587.5) * 86400000 < $now)
          THEN CASE WHEN fail_count + 1 >= $maxFailures THEN $lockUntil ELSE locked_until END
          ELSE NULL
        END
      WHERE id = 1
        AND (locked_until IS NULL OR (julianday(locked_until) - 2440587.5) * 86400000 < $now)`,
      {
        now,
        window: FAILURE_WINDOW_MS,
        nowIso: nowIso(now),
        maxFailures: MAX_FAILURES,
        lockUntil: nowIso(now + LOCKOUT_MS),
      }
    )
  } catch (error) {
    console.error("[auth] lockout record failed:", error)
  }
}

function nowIso(ms: number): string {
  return new Date(ms).toISOString()
}

/**
 * Clears the failure window — called on a successful login or recovery-key
 * reset so legitimate use resets the streak. Manual escape hatch when
 * locked out:
 *   UPDATE auth_lockout SET fail_count = 0, first_failed_at = NULL, locked_until = NULL WHERE id = 1;
 */
export async function clearLoginFailures(): Promise<void> {
  try {
    const db = requireDb()
    await ensureLockoutTable()
    await db.execute(
      "UPDATE auth_lockout SET fail_count = 0, first_failed_at = NULL, locked_until = NULL WHERE id = 1"
    )
  } catch (error) {
    console.error("[auth] lockout clear failed:", error)
  }
}
