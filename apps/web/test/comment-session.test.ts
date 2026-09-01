import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  isBeforeMinSubmitDelay,
  signCommentSession,
  verifyCommentSession,
} from "@/lib/comment-session"

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "unit-test-secret")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("signCommentSession / verifyCommentSession", () => {
  it("round-trips a payload", async () => {
    const token = await signCommentSession({
      postSlug: "hello-world",
      ipHash: "abc123",
      issuedAt: Date.now(),
    })
    expect(token).not.toBeNull()
    const payload = await verifyCommentSession(token!)
    expect(payload).toEqual({
      postSlug: "hello-world",
      ipHash: "abc123",
      issuedAt: expect.any(Number),
    })
  })

  it("returns null on a forged signature", async () => {
    const token = await signCommentSession({
      postSlug: "hello-world",
      ipHash: "abc123",
      issuedAt: Date.now(),
    })
    const [body] = token!.split(".")
    const forged = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
    expect(await verifyCommentSession(forged)).toBeNull()
  })

  it("returns null on garbage input", async () => {
    expect(await verifyCommentSession("")).toBeNull()
    expect(await verifyCommentSession("no-dot")).toBeNull()
    expect(await verifyCommentSession("a.b.c")).toBeNull()
  })

  it("rejects tokens whose signature was made with a different secret", async () => {
    const token = await signCommentSession({
      postSlug: "hello-world",
      ipHash: "abc123",
      issuedAt: Date.now(),
    })
    vi.stubEnv("SESSION_SECRET", "another-secret")
    expect(await verifyCommentSession(token!)).toBeNull()
  })

  it("rejects tokens older than the TTL", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const token = await signCommentSession({
      postSlug: "hello-world",
      ipHash: "abc123",
      issuedAt: Date.now(),
    })
    // 6 minutes later — past the 5-minute TTL.
    vi.setSystemTime(new Date("2026-01-01T00:06:00Z"))
    expect(await verifyCommentSession(token!)).toBeNull()
  })

  it("rejects payloads with a wrong shape", async () => {
    // Tamper with the body but re-sign with the same secret.
    const evil = Buffer.from(
      JSON.stringify({ postSlug: 42, ipHash: [], issuedAt: "x" })
    ).toString("base64url")
    // Re-sign the evil body using the same HMAC (mirrors internals).
    const sig = await hmacSign(evil)
    expect(await verifyCommentSession(`${evil}.${sig}`)).toBeNull()
  })

  it("fails closed (null) without a secret in production", async () => {
    // Empty string is falsy — getSecret() skips it and consults NODE_ENV,
    // so the result is deterministic regardless of ambient env vars.
    vi.unstubAllEnvs()
    vi.stubEnv("SESSION_SECRET", "")
    vi.stubEnv("NODE_ENV", "production")
    expect(
      await signCommentSession({
        postSlug: "hello-world",
        ipHash: "abc123",
        issuedAt: Date.now(),
      })
    ).toBeNull()
    expect(await verifyCommentSession("anything.anything")).toBeNull()
  })

  it("uses the dev secret only in an explicit development build", async () => {
    vi.unstubAllEnvs()
    vi.stubEnv("SESSION_SECRET", "")
    vi.stubEnv("NODE_ENV", "development")
    const token = await signCommentSession({
      postSlug: "hello-world",
      ipHash: "abc123",
      issuedAt: Date.now(),
    })
    expect(token).not.toBeNull()
    expect(await verifyCommentSession(token!)).not.toBeNull()
  })
})

describe("isBeforeMinSubmitDelay", () => {
  it("is true right after issuance (time-trap)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const issuedAt = Date.now()
    expect(isBeforeMinSubmitDelay({ postSlug: "p", ipHash: "i", issuedAt })).toBe(true)
  })

  it("is false once the minimum delay has passed", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const issuedAt = Date.now()
    vi.setSystemTime(new Date("2026-01-01T00:00:03Z"))
    expect(isBeforeMinSubmitDelay({ postSlug: "p", ipHash: "i", issuedAt })).toBe(false)
  })
})

/** HMAC-SHA256 of a body, mirroring comment-session's internal signing. */
async function hmacSign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("unit-test-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  return Buffer.from(sig).toString("base64url")
}
