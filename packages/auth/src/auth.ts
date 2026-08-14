import { randomInt } from "node:crypto"
import { SignJWT, jwtVerify } from "jose"
import bcrypt from "bcryptjs"
import {
  getUserByUsername,
  getLockoutState,
  recordLoginFailure,
  clearLoginFailures,
  type LockoutState,
} from "@zlog/database"
import { type AuthUser } from "@zlog/core"

const JWT_EXPIRATION = "7d"

function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    // Only an explicit development build gets the hardcoded dev secret
    // (mirrors lib/comment-session). Production fails closed — a
    // missing secret must never mint JWT with a public constant.
    if (process.env.NODE_ENV === "development") {
      return new TextEncoder().encode("dev-jwt-secret")
    }
    throw new Error(
      "SESSION_SECRET environment variable is required for authentication."
    )
  }
  return new TextEncoder().encode(secret)
}

/**
 * Resolve the password hash + version for a username from the database.
 * Returns null when the user does not exist or the database is unavailable.
 */
async function resolveCredential(
  username: string
): Promise<{ hash: string; version: string } | null> {
  const dbUser = await getUserByUsername(username)
  if (!dbUser) return null
  return { hash: dbUser.passwordHash, version: dbUser.passwordVersion }
}

export async function createToken(user: AuthUser): Promise<string> {
  const credential = await resolveCredential(user.username)
  const version = credential?.version ?? "none"
  return new SignJWT({ username: user.username, pv: version })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(getJwtSecret())
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    const username = payload.username
    if (typeof username !== "string" || !username) return null

    const credential = await resolveCredential(username)
    if (!credential) return null

    const pv = payload.pv
    if (pv !== credential.version) return null

    return { username }
  } catch {
    return null
  }
}

export async function verifyLogin(
  username: string,
  password: string
): Promise<AuthUser | null> {
  // bcrypt ignores everything past the 72nd byte — a longer password would
  // silently compare equal to its first 72 bytes, so reject it outright.
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return null
  }

  const credential = await resolveCredential(username)
  if (!credential) {
    // Equalize timing with the wrong-password branch: a cost-12 compare
    // against a dummy hash costs the same as the real one, so response
    // time can't reveal whether the username exists (the admin username
    // is effectively public, but the leak is free to close).
    await bcrypt.compare(password, DUMMY_TIMING_HASH)
    return null
  }

  let isValid = false
  try {
    isValid = await bcrypt.compare(password, credential.hash)
  } catch {
    // A malformed stored hash (e.g. a non-bcrypt ADMIN_PASSWORD_HASH that
    // slipped past base64 decode) would throw — treat it as a failed login
    // instead of a 500, so the attacker pays the delay and the count.
    isValid = false
  }
  if (!isValid) return null

  return { username }
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new Error("Password must be at most 72 bytes")
  }
  // Cost 12 (~250ms) — heavy enough to meaningfully slow a dictionary
  // attack without hurting the single-admin login UX. Existing hashes are
  // unaffected: bcrypt.compare reads the cost from the stored hash.
  return bcrypt.hash(password, 12)
}

// ── Brute-force protection ──────────────────────────────────────────────

// A single-admin blog needs no per-IP bookkeeping: any failure streak is
// attacker traffic, so a global counter (persisted in @zlog/database's
// auth_lockout table) is the strongest form of defense.
const LOGIN_FAILURE_DELAY_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** bcrypt silently truncates at 72 bytes — enforced by every password path. */
const MAX_PASSWORD_BYTES = 72

/** Cost-12 hash of a throwaway string, compared only for timing equalization. */
const DUMMY_TIMING_HASH = "$2b$12$J8axBd0m31x99pTRZsUK0uJzy7KN7o4bC2206Dx98LOcT15UyT1S6"

/** Seconds until the lockout expires for a state; null when not locked.
 *  Fail-open: null/parse-failure reads as "not locked". */
function lockoutSecondsLeft(state: LockoutState | null): number | null {
  const lockedUntil = state?.lockedUntil ? Date.parse(state.lockedUntil) : NaN
  if (!Number.isFinite(lockedUntil) || lockedUntil <= Date.now()) return null
  return Math.ceil((lockedUntil - Date.now()) / 1000)
}

export type LoginAttempt =
  | { status: "ok"; user: AuthUser }
  | { status: "invalid" }
  | { status: "locked"; retryAfterSeconds: number }

/**
 * Single-admin login gate for public endpoints. Checks the lockout BEFORE
 * any bcrypt work (keeps the endpoint from doubling as a CPU DoS sink),
 * and records every failure — unknown usernames included, since the admin
 * username is effectively public. verifyLogin equalizes the timing between
 * "no such user" and "wrong password"; recordFailedAttempt adds a constant
 * delay on top. On success the failure streak is cleared.
 */
export async function attemptLogin(
  username: string,
  password: string
): Promise<LoginAttempt> {
  const retryAfter = lockoutSecondsLeft(await getLockoutState())
  if (retryAfter !== null) {
    return { status: "locked", retryAfterSeconds: retryAfter }
  }

  const user = await verifyLogin(username, password)
  if (!user) {
    await recordFailedAttempt()
    return { status: "invalid" }
  }

  await clearLoginFailures()
  return { status: "ok", user }
}

/**
 * Count one failed credential attempt and eat a constant delay. Shared by
 * the login gate and the change-password route (a session-holder's
 * current-password guesses must feed the same counter and throttle).
 */
export async function recordFailedAttempt(): Promise<void> {
  await recordLoginFailure()
  await delay(LOGIN_FAILURE_DELAY_MS)
}

export type RecoveryAttempt =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "locked"; retryAfterSeconds: number }

/**
 * Recovery-key verification with the same lockout accounting as login.
 * While the lockout is active, a CORRECT key is still honored — the
 * recovery flow is the admin's escape hatch when the login lock is armed
 * (the key's entropy makes brute-forcing it pointless, and honoring it
 * clears the lockout). Wrong keys during a lockout are rejected without
 * extending it.
 */
export async function attemptRecoveryKey(
  username: string,
  key: string
): Promise<RecoveryAttempt> {
  const state = await getLockoutState()
  const retryAfter = lockoutSecondsLeft(state)

  const keyValid = await verifyRecoveryKey(username, key)
  if (keyValid) {
    await clearLoginFailures()
    return { status: "ok" }
  }

  if (retryAfter !== null) {
    return { status: "locked", retryAfterSeconds: retryAfter }
  }
  await recordFailedAttempt()
  return { status: "invalid" }
}

// ── Recovery key ─────────────────────────────────────────────────────────

// No 0/O/1/I/L — unambiguous when transcribed by hand.
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Normalize a key for comparison: strip separators/whitespace, uppercase.
 *  The stored bcrypt hash covers the normalized form, so users may type
 *  the key in any case and with or without the dashes. */
export function normalizeRecoveryKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
}

/** Generate a one-time recovery key: 20 chars in 4 groups of 5, e.g.
 *  "4F8K9-W2P3X-7L6QD-MZQTN". Shown to the user exactly once; only its
 *  bcrypt hash is persisted. */
export function generateRecoveryKey(): string {
  const chars: string[] = []
  for (let i = 0; i < 20; i++) {
    chars.push(KEY_ALPHABET[randomInt(KEY_ALPHABET.length)])
  }
  const normalized = chars.join("")
  return `${normalized.slice(0, 5)}-${normalized.slice(5, 10)}-${normalized.slice(10, 15)}-${normalized.slice(15, 20)}`
}

/**
 * Verifies a recovery key for the user. Returns false when the user does
 * not exist, has no key set, or the key doesn't match — callers surface a
 * single generic error to avoid user enumeration.
 */
async function verifyRecoveryKey(
  username: string,
  key: string
): Promise<boolean> {
  const dbUser = await getUserByUsername(username)
  if (!dbUser?.recoveryHash) return false
  return bcrypt.compare(normalizeRecoveryKey(key), dbUser.recoveryHash)
}
