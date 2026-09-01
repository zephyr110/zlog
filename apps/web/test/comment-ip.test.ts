import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getClientIp, hashIp } from "@/lib/comment-ip"

/** Reference: an unkeyed sha256 of the same input, to prove the HMAC key
 *  actually changes the output. */
function hashIpWithoutSecret(ip: string): string {
  return createHash("sha256").update(ip).digest("hex")
}

describe("getClientIp", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/comments", { headers })
  }

  it("takes the first hop of x-forwarded-for", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4")
  })

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    expect(getClientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9")
  })

  it("prefers x-forwarded-for over x-real-ip", () => {
    expect(
      getClientIp(req({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }))
    ).toBe("1.1.1.1")
  })

  it("returns unknown when no header is present", () => {
    expect(getClientIp(req({}))).toBe("unknown")
  })

  it("handles whitespace around the forwarded IP", () => {
    expect(getClientIp(req({ "x-forwarded-for": " 10.0.0.1 " }))).toBe("10.0.0.1")
  })
})

describe("hashIp", () => {
  const realSecret = process.env.SESSION_SECRET

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret"
  })

  afterEach(() => {
    if (realSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = realSecret
  })

  it("is a deterministic HMAC hex digest", () => {
    const a = hashIp("1.2.3.4")
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(hashIp("1.2.3.4")).toBe(a)
  })

  it("differs per IP", () => {
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("5.6.7.8"))
  })

  it("does not leak the raw IP", () => {
    const h = hashIp("203.0.113.42")
    expect(h).not.toContain("203.0.113.42")
    // A plain sha256 of the IP must not match (HMAC-keyed).
    expect(h).not.toBe(hashIpWithoutSecret("203.0.113.42"))
  })
})
