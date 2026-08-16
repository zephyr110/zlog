import { describe, it, expect, vi } from "vitest"
import { ProxyAgent, Socks5ProxyAgent } from "undici"
import { createProxyDispatcher, redactProxyUrl } from "../electron/proxy-agent"

describe("redactProxyUrl", () => {
  it("去掉 user:pass 凭据", () => {
    expect(redactProxyUrl("http://user:pass@host:1080")).toBe("http://host:1080/")
  })

  it("只带用户名也脱敏", () => {
    expect(redactProxyUrl("http://user@host:1080")).toBe("http://host:1080/")
  })

  it("socks5 URL 同样脱敏（非特殊 scheme，URL 序列化不带尾斜杠）", () => {
    expect(redactProxyUrl("socks5://u:p@host:1080")).toBe("socks5://host:1080")
  })

  it("无凭据 URL 原样返回", () => {
    expect(redactProxyUrl("http://host:1080")).toBe("http://host:1080")
    expect(redactProxyUrl("")).toBe("")
  })

  it("非标准 URL（无 scheme）走兜底正则，不留明文密码", () => {
    const out = redactProxyUrl("//user:pass@host:1080")
    expect(out).not.toContain("pass")
    expect(out).toContain("***")
  })
})

describe("createProxyDispatcher", () => {
  it("空串/空白 → undefined（直连）", () => {
    expect(createProxyDispatcher("")).toBeUndefined()
    expect(createProxyDispatcher("   ")).toBeUndefined()
  })

  it("http:// → ProxyAgent", () => {
    expect(createProxyDispatcher("http://127.0.0.1:1080")).toBeInstanceOf(ProxyAgent)
  })

  it("socks5:// → Socks5ProxyAgent", () => {
    expect(createProxyDispatcher("socks5://127.0.0.1:1080")).toBeInstanceOf(Socks5ProxyAgent)
  })

  it("socks5h:// 归一化为 socks5://（远端 DNS 语义差异可接受）", () => {
    expect(createProxyDispatcher("socks5h://127.0.0.1:1080")).toBeInstanceOf(Socks5ProxyAgent)
  })

  it("裸 socks:// 归一化为 socks5://，不抛错", () => {
    expect(() => createProxyDispatcher("socks://127.0.0.1:1080")).not.toThrow()
    expect(createProxyDispatcher("socks://127.0.0.1:1080")).toBeInstanceOf(Socks5ProxyAgent)
  })

  it("socks4 拒绝并降级直连，warn 不含凭据", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(createProxyDispatcher("socks4://user:pass@host:1080")).toBeUndefined()
      expect(warn).toHaveBeenCalledOnce()
      const msg = String(warn.mock.calls[0].at(-1))
      expect(msg).not.toContain("pass")
    } finally {
      warn.mockRestore()
    }
  })
})
