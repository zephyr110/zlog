import { describe, it, expect } from "vitest"
import { isValidSyncUrl } from "../electron/validate"

describe("isValidSyncUrl", () => {
  it("接受 libsql:// 远程库 URL", () => {
    expect(isValidSyncUrl("libsql://bitlog.turso.io")).toBe(true)
    expect(isValidSyncUrl("libsql://bitlog-zephyr110.aws-ap-northeast-1.turso.io")).toBe(true)
  })

  it("拒绝 file: URL（同步无本地语义）", () => {
    expect(isValidSyncUrl("file:./zlog.db")).toBe(false)
    expect(isValidSyncUrl("file:///tmp/x.db")).toBe(false)
  })

  it("拒绝非 URL / 误填的用户名等垃圾值（libsql 解析会 panic）", () => {
    expect(isValidSyncUrl("admin")).toBe(false)
    expect(isValidSyncUrl("")).toBe(false)
    expect(isValidSyncUrl(undefined)).toBe(false)
    expect(isValidSyncUrl("libsql:no-slashes")).toBe(false)
    expect(isValidSyncUrl("https://example.com")).toBe(false)
  })
})
