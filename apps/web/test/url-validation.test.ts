import { describe, expect, it } from "vitest"
import { optionalHttpUrl } from "@/lib/url-validation"

describe("optionalHttpUrl", () => {
  it("接受空串（可选字段的清除语义）", () => {
    expect(optionalHttpUrl.safeParse("").success).toBe(true)
  })

  it("接受 http/https URL", () => {
    expect(optionalHttpUrl.safeParse("https://github.com/zephyr110/zlog").success).toBe(true)
    expect(optionalHttpUrl.safeParse("http://localhost:3000/x").success).toBe(true)
  })

  it("拒绝 javascript: / data: / 相对路径", () => {
    expect(optionalHttpUrl.safeParse("javascript:alert(1)").success).toBe(false)
    expect(optionalHttpUrl.safeParse("data:text/html,x").success).toBe(false)
    expect(optionalHttpUrl.safeParse("/relative/path").success).toBe(false)
    expect(optionalHttpUrl.safeParse("ftp://example.com").success).toBe(false)
  })

  it("拒绝超长（>300）", () => {
    expect(optionalHttpUrl.safeParse(`https://e.com/${"a".repeat(300)}`).success).toBe(false)
  })
})
