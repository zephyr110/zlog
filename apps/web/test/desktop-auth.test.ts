import { describe, expect, it } from "vitest"
import { validateDesktopKey } from "@/lib/desktop-auth"

describe("validateDesktopKey", () => {
  it("密钥一致返回 true", () => {
    expect(validateDesktopKey("abc123", "abc123")).toBe(true)
  })

  it("密钥不一致 / 长度不同返回 false（长度不同不得抛异常）", () => {
    expect(validateDesktopKey("abc124", "abc123")).toBe(false)
    expect(validateDesktopKey("abc", "abc123")).toBe(false)
    expect(validateDesktopKey("abc1234", "abc123")).toBe(false)
  })

  it("服务端未配置密钥时一律 false（部署站点无桌面密钥）", () => {
    expect(validateDesktopKey("abc123", undefined)).toBe(false)
    expect(validateDesktopKey("abc123", "")).toBe(false)
  })

  it("缺少请求头返回 false", () => {
    expect(validateDesktopKey(null, "abc123")).toBe(false)
    expect(validateDesktopKey("", "abc123")).toBe(false)
  })
})
