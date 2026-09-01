import { describe, expect, it } from "vitest"
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  ADMIN_TOKEN_COOKIE,
  adminCookieOptions,
  isLoopbackHost,
} from "@/lib/auth-cookie"

describe("adminCookieOptions", () => {
  it("sets HttpOnly, SameSite=Lax and root path", () => {
    const opts = adminCookieOptions("https:", "zephyr110.vercel.app")
    expect(opts.httpOnly).toBe(true)
    expect(opts.sameSite).toBe("lax")
    expect(opts.path).toBe("/")
  })

  it("sets Secure on https regardless of host", () => {
    expect(adminCookieOptions("https:", "zephyr110.vercel.app").secure).toBe(true)
    expect(adminCookieOptions("https:", "localhost").secure).toBe(true)
  })

  it("sets Secure on loopback hosts over plain http (desktop / local dev)", () => {
    expect(adminCookieOptions("http:", "127.0.0.1").secure).toBe(true)
    expect(adminCookieOptions("http:", "localhost").secure).toBe(true)
    expect(adminCookieOptions("http:", "::1").secure).toBe(true)
  })

  it("leaves Secure off for non-loopback http hosts", () => {
    expect(adminCookieOptions("http:", "192.168.1.10").secure).toBe(false)
    expect(adminCookieOptions("http:", "blog.example.com").secure).toBe(false)
  })

  it("keeps the cookie max-age in lockstep with the 7d JWT lifetime", () => {
    expect(adminCookieOptions("https:", "x.com").maxAge).toBe(7 * 24 * 60 * 60)
    expect(ADMIN_SESSION_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60)
  })
})

describe("isLoopbackHost", () => {
  it("matches localhost and loopback IPs", () => {
    expect(isLoopbackHost("localhost")).toBe(true)
    expect(isLoopbackHost("127.0.0.1")).toBe(true)
    expect(isLoopbackHost("::1")).toBe(true)
  })

  it("rejects other hosts", () => {
    expect(isLoopbackHost("example.com")).toBe(false)
    expect(isLoopbackHost("127.0.0.2")).toBe(false)
    expect(isLoopbackHost("")).toBe(false)
  })
})

describe("ADMIN_TOKEN_COOKIE", () => {
  it("keeps the historical cookie name (proxy/desktop depend on it)", () => {
    expect(ADMIN_TOKEN_COOKIE).toBe("blog-admin-token")
  })
})
