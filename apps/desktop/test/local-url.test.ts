import { describe, it, expect } from "vitest"
import { isDesktopLocalUrl } from "../electron/local-url"

const SERVER = "http://127.0.0.1:4310"

describe("isDesktopLocalUrl", () => {
  it("同源留下", () => {
    expect(isDesktopLocalUrl("http://127.0.0.1:4310/admin", SERVER)).toBe(true)
  })

  it("loopback 同端口同协议视为本机", () => {
    expect(isDesktopLocalUrl("http://localhost:4310/", SERVER)).toBe(true)
    expect(isDesktopLocalUrl("http://[::1]:4310/", SERVER)).toBe(true)
  })

  it("同端口但协议不同不当成本机", () => {
    expect(isDesktopLocalUrl("https://localhost:4310/", SERVER)).toBe(false)
    expect(isDesktopLocalUrl("https://127.0.0.1:4310/", SERVER)).toBe(false)
  })

  it("外站与非 http(s) 不留下", () => {
    expect(isDesktopLocalUrl("https://example.com/", SERVER)).toBe(false)
    expect(isDesktopLocalUrl("file:///tmp/x", SERVER)).toBe(false)
    expect(isDesktopLocalUrl("not-a-url", SERVER)).toBe(false)
  })
})
