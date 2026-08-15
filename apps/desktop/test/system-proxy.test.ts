import { describe, it, expect } from "vitest"
import {
  parseChromiumProxy,
  parseGnomeManualProxy,
  parseManualHttpProxy,
  parseScutilProxy,
  parseWindowsProxyServer,
  parseWindowsRegQuery,
  resolveDesktopHttpProxy,
} from "../electron/system-proxy"

describe("parseChromiumProxy", () => {
  it("DIRECT 表示没有系统代理", () => {
    expect(parseChromiumProxy("DIRECT")).toBeUndefined()
  })

  it("读出 HTTP 系统代理", () => {
    expect(parseChromiumProxy("PROXY 127.0.0.1:7890")).toBe("http://127.0.0.1:7890")
  })

  it("HTTPS 代理用 https scheme", () => {
    expect(parseChromiumProxy("HTTPS proxy.example:8443")).toBe(
      "https://proxy.example:8443"
    )
  })

  it("SOCKS 后若还有 HTTP 代理则用后者", () => {
    expect(parseChromiumProxy("SOCKS5 127.0.0.1:7891; PROXY 127.0.0.1:7890")).toBe(
      "http://127.0.0.1:7890"
    )
  })

  it("只有 SOCKS 时不编造 HTTP 代理", () => {
    expect(parseChromiumProxy("SOCKS5 127.0.0.1:7891")).toBeUndefined()
  })
})

describe("parseWindowsProxyServer", () => {
  it("单一 host:port（Clash for Windows 常见）", () => {
    expect(parseWindowsProxyServer("127.0.0.1:7890")).toBe("http://127.0.0.1:7890")
  })

  it("按协议列表时优先 https", () => {
    expect(
      parseWindowsProxyServer("http=127.0.0.1:1080;https=127.0.0.1:7890;socks=127.0.0.1:7891")
    ).toBe("http://127.0.0.1:7890")
  })

  it("ProxyEnable=0 时忽略 ProxyServer", () => {
    expect(
      parseWindowsRegQuery(
        "    ProxyEnable    REG_DWORD    0x0\n    ProxyServer    REG_SZ    127.0.0.1:7890\n"
      )
    ).toBeUndefined()
  })

  it("ProxyEnable=1 时读出 ProxyServer", () => {
    expect(
      parseWindowsRegQuery(
        "    ProxyEnable    REG_DWORD    0x1\n    ProxyServer    REG_SZ    127.0.0.1:7890\n"
      )
    ).toBe("http://127.0.0.1:7890")
  })
})

describe("parseGnomeManualProxy", () => {
  it("mode=none 时不使用 host/port", () => {
    expect(
      parseGnomeManualProxy({
        mode: "'none'",
        httpsHost: "'127.0.0.1'",
        httpsPort: "uint32 7890",
        httpHost: "''",
        httpPort: "uint32 0",
      })
    ).toBeUndefined()
  })

  it("manual 时用 https host/port", () => {
    expect(
      parseGnomeManualProxy({
        mode: "'manual'",
        httpsHost: "'127.0.0.1'",
        httpsPort: "uint32 7890",
        httpHost: "''",
        httpPort: "uint32 0",
      })
    ).toBe("http://127.0.0.1:7890")
  })
})

describe("parseScutilProxy", () => {
  it("HTTPSEnable=1 时拼出代理 URL", () => {
    expect(
      parseScutilProxy(`
      HTTPEnable : 0
      HTTPSEnable : 1
      HTTPSPort : 7890
      HTTPSProxy : 127.0.0.1
    `)
    ).toBe("http://127.0.0.1:7890")
  })

  it("都未启用时为空", () => {
    expect(parseScutilProxy("HTTPEnable : 0\nHTTPSEnable : 0\n")).toBeUndefined()
  })
})

describe("parseManualHttpProxy", () => {
  it("空值表示走自动检测", () => {
    expect(parseManualHttpProxy("")).toBeUndefined()
    expect(parseManualHttpProxy("   ")).toBeUndefined()
    expect(parseManualHttpProxy(undefined)).toBeUndefined()
  })

  it("接受完整 URL 或 host:port", () => {
    expect(parseManualHttpProxy("http://127.0.0.1:65502")).toBe("http://127.0.0.1:65502")
    expect(parseManualHttpProxy("127.0.0.1:65502")).toBe("http://127.0.0.1:65502")
  })

  it("拒绝 SOCKS、缺端口、非法值", () => {
    expect(parseManualHttpProxy("socks5://127.0.0.1:1080")).toBeUndefined()
    expect(parseManualHttpProxy("127.0.0.1")).toBeUndefined()
    expect(parseManualHttpProxy("http://127.0.0.1")).toBeUndefined()
    expect(parseManualHttpProxy("not a proxy")).toBeUndefined()
  })

  it("接受协议默认端口 80/443（URL.port 会被收成空）", () => {
    expect(parseManualHttpProxy("http://127.0.0.1:80")).toBe("http://127.0.0.1")
    expect(parseManualHttpProxy("https://proxy.example:443")).toBe(
      "https://proxy.example"
    )
    expect(parseManualHttpProxy("127.0.0.1:80")).toBe("http://127.0.0.1")
  })
})

describe("resolveDesktopHttpProxy", () => {
  it("设置里的覆盖值优先于 env 与 Chromium", async () => {
    const prev = process.env.HTTPS_PROXY
    process.env.HTTPS_PROXY = "http://127.0.0.1:65500"
    try {
      await expect(
        resolveDesktopHttpProxy({
          override: "127.0.0.1:65503",
          resolveChromium: async () => "PROXY 127.0.0.1:1",
        })
      ).resolves.toBe("http://127.0.0.1:65503")
    } finally {
      if (prev === undefined) delete process.env.HTTPS_PROXY
      else process.env.HTTPS_PROXY = prev
    }
  })

  it("进程 env 优先于 Chromium 系统代理", async () => {
    const prev = process.env.HTTPS_PROXY
    process.env.HTTPS_PROXY = "http://127.0.0.1:65500"
    try {
      await expect(
        resolveDesktopHttpProxy({
          resolveChromium: async () => "PROXY 127.0.0.1:1",
        })
      ).resolves.toBe("http://127.0.0.1:65500")
    } finally {
      if (prev === undefined) delete process.env.HTTPS_PROXY
      else process.env.HTTPS_PROXY = prev
    }
  })

  it("无 env 时用 Chromium resolveProxy 结果", async () => {
    const keys = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const
    const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
    for (const k of keys) delete process.env[k]
    try {
      await expect(
        resolveDesktopHttpProxy({
          resolveChromium: async () => "PROXY 127.0.0.1:65501",
        })
      ).resolves.toBe("http://127.0.0.1:65501")
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k]
        else process.env[k] = prev[k]
      }
    }
  })
})
