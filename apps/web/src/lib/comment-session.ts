// Signed session token for the public comment API.
//
// A guest's form must hold a token issued by GET /api/comments/session
// before POST /api/comments is accepted. This closes the door on plain
// curl scripts (they cannot forge the HMAC), and the token binds
// post_slug + IP + a short TTL so a stale token can't be replayed after
// the page sits. Tokens are NOT single-use — replay within the 5 min
// TTL is bounded by the DB rate limits (IP/post/global buckets), which
// are the real volume gate.
//
// Two extra constraints ride on the token's issuedAt:
//  - TTL 5 min: a stale token can't be replayed after the page sits.
//  - Min age 2 s (time-trap): a script that fetches the session and
//    POSTs immediately is rejected — a human takes longer to type.
//
// The secret reuses SESSION_SECRET (same env as @zlog/auth). In local
// development a hardcoded fallback keeps the feature testable; in
// production a missing secret disables token issuance (the session
// endpoint returns 503) rather than minting forgeable tokens.

import { COMMENT_MIN_SUBMIT_DELAY_MS } from "@/lib/comment-shared"

const SESSION_TTL_MS = 5 * 60 * 1000

interface CommentSessionPayload {
  postSlug: string
  ipHash: string
  issuedAt: number // epoch ms
}

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret
  // Only an explicit development build gets the hardcoded dev secret.
  // A self-hosted production that forgets NODE_ENV (undefined) must NOT
  // fall into it — that would make tokens forgeable with a public key.
  // It fails closed instead: the session endpoint 503s.
  if (process.env.NODE_ENV === "development") {
    return "dev-comment-session-secret"
  }
  return null
}

function encodeBase64Url(data: Uint8Array): string {
  return Buffer.from(data).toString("base64url")
}

function decodeBase64Url(data: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(data, "base64url")
  // Copy into an exact-size buffer: `buf.buffer` may be a shared memory
  // POOL (byteLength >> length for small buffers), and a Uint8Array over
  // it would feed the pool's garbage bytes into the HMAC check — every
  // token would fail verification. new Uint8Array(buf) copies precisely
  // `buf.length` bytes into a fresh ArrayBuffer.
  return new Uint8Array(buf)
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  )
  return encodeBase64Url(new Uint8Array(sig))
}

/** Serialize a payload into a signed token, or null when no secret is
 *  configured (production). */
export async function signCommentSession(
  payload: CommentSessionPayload
): Promise<string | null> {
  const secret = getSecret()
  if (!secret) return null
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await sign(body, secret)
  return `${body}.${sig}`
}

/** Verify signature + TTL, returning the payload or null. */
export async function verifyCommentSession(
  token: string
): Promise<CommentSessionPayload | null> {
  const secret = getSecret()
  if (!secret) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64Url(sig),
    new TextEncoder().encode(body)
  )
  if (!valid) return null

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(body))
    ) as CommentSessionPayload
    if (
      typeof payload.postSlug !== "string" ||
      typeof payload.ipHash !== "string" ||
      typeof payload.issuedAt !== "number"
    ) {
      return null
    }
    if (Date.now() - payload.issuedAt > SESSION_TTL_MS) return null
    return payload
  } catch {
    return null
  }
}

/** A token older than this is not yet spendable (time-trap). */
export function isBeforeMinSubmitDelay(payload: CommentSessionPayload): boolean {
  return Date.now() - payload.issuedAt < COMMENT_MIN_SUBMIT_DELAY_MS
}
