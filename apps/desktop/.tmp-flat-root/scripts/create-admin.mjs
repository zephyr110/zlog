#!/usr/bin/env node
/**
 * Create or update an admin user in the Turso database.
 *
 * Usage:
 *   node scripts/create-admin.mjs --username admin --password "your-password"
 *   node scripts/create-admin.mjs --password "new-password"   # updates the existing ADMIN_USERNAME user
 *
 * Every run also generates a fresh one-time recovery key (bcrypt hash
 * stored in the DB, plaintext printed exactly once) for the forgot-
 * password flow on the login page.
 *
 * Environment: TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for remote DBs)
 * are loaded from .env.local automatically.
 */
import { randomInt } from "node:crypto"
import { createRequire } from "module"
import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

// No 0/O/1/I/L — unambiguous when transcribed by hand.
// NOTE: keep in sync with packages/auth/src/auth.ts (generateRecoveryKey /
// normalizeRecoveryKey) — the app verifies keys with THAT implementation,
// so a drift here would make printed keys unredeemable.
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** 20 chars in 4 groups of 5, e.g. "4F8K9-W2P3X-7L6QD-MZQTN". */
function generateRecoveryKey() {
  const chars = []
  for (let i = 0; i < 20; i++) chars.push(KEY_ALPHABET[randomInt(KEY_ALPHABET.length)])
  const k = chars.join("")
  return `${k.slice(0, 5)}-${k.slice(5, 10)}-${k.slice(10, 15)}-${k.slice(15, 20)}`
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

// pnpm workspaces: resolve deps from the packages that declare them.
const requireDb = createRequire(resolve(root, "packages/database/package.json"))
const requireAuth = createRequire(resolve(root, "packages/auth/package.json"))
const { createClient } = requireDb("@libsql/client")
const bcrypt = requireAuth("bcryptjs")

// Load .env.local from the web app (moved into apps/web by the monorepo
// migration), falling back to a repo-root copy. Simple parser — no dotenv.
const envPath = [resolve(root, "apps/web/.env.local"), resolve(root, ".env.local")].find(
  (p) => existsSync(p)
)
if (envPath) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "")
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      out[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : ""
      if (args[i + 1] && !args[i + 1].startsWith("--")) i++
    }
  }
  return out
}

async function main() {
  const args = parseArgs()
  const { username: argUsername, password } = args

  if ("username" in args && !argUsername) {
    console.error("--username requires a value.")
    process.exit(1)
  }
  if (!password) {
    console.error("Usage: node scripts/create-admin.mjs --username <name> --password <password>")
    process.exit(1)
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.")
    process.exit(1)
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    // bcrypt silently truncates at 72 bytes — reject so the stored hash
    // covers the whole password (same limit as the runtime routes).
    console.error("Password must be at most 72 bytes.")
    process.exit(1)
  }

  const url = process.env.TURSO_DATABASE_URL
  if (!url) {
    console.error("TURSO_DATABASE_URL is not set (check .env.local).")
    process.exit(1)
  }

  const username = argUsername || process.env.ADMIN_USERNAME
  if (!username) {
    console.error("No username provided and ADMIN_USERNAME is not set.")
    process.exit(1)
  }

  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        recovery_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `)
    // Migrate pre-recovery tables (CREATE IF NOT EXISTS won't touch an
    // existing table). Duplicate-column errors are fine.
    try {
      await db.execute("ALTER TABLE users ADD COLUMN recovery_hash TEXT")
    } catch {
      // column already exists
    }

    // Cost 12 — keep in sync with hashPassword in packages/auth/src/auth.ts.
    const hash = await bcrypt.hash(password, 12)
    const existing = await db.execute(
      "SELECT id FROM users WHERE username = ?",
      [username]
    )

    if (existing.rows.length > 0) {
      await db.execute(
        "UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE username = ?",
        [hash, username]
      )
      console.log(`✓ Updated password for "${username}" (existing JWTs invalidated).`)
    } else {
      await db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        [username, hash]
      )
      console.log(`✓ Created admin user "${username}".`)
    }

    // Fresh one-time recovery key on every run — the old one is replaced.
    const recoveryKey = generateRecoveryKey()
    const recoveryHash = await bcrypt.hash(
      recoveryKey.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
      12
    )
    await db.execute("UPDATE users SET recovery_hash = ? WHERE username = ?", [
      recoveryHash,
      username,
    ])
    console.log("\n⚠ Save this recovery key now — it is shown only once:")
    console.log(`  ${recoveryKey}`)
    console.log(
      "  Use it on the admin login page → “Forgot password?” to reset your password.\n"
    )
  } catch (error) {
    console.error("Failed to create/update user:", error.message)
    // process.exitCode + normal return lets the finally block run
    // (process.exit() would skip it, leaking the db connection).
    process.exitCode = 1
  } finally {
    db.close()
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error.message)
  process.exit(1)
})
