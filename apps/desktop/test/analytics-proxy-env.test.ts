import { describe, it, expect } from "vitest"
import {
  collectProxyCandidates,
  envLocalFilePaths,
  isDesktopAnalyticsProcess,
  isLoopbackProxyUrl,
  parseDotenvProxyValues,
  selectProxyUrl,
  trustedProxyUrls,
} from "../../web/src/lib/analytics-proxy-env"

describe("parseDotenvProxyValues", () => {
  it("抽出代理键并忽略注释", () => {
    expect(
      parseDotenvProxyValues(`
# HTTPS_PROXY=http://127.0.0.1:1
HTTPS_PROXY=http://127.0.0.1:65502
HTTP_PROXY="http://127.0.0.1:65502"
NEXT_PUBLIC_SITE_URL=https://example.com
`)
    ).toEqual(["http://127.0.0.1:65502", "http://127.0.0.1:65502"])
  })
})

describe("collectProxyCandidates", () => {
  it(".env.local 优先于进程 env，避免 IDE 死代理抢先", () => {
    expect(
      collectProxyCandidates({
        env: { HTTPS_PROXY: "http://127.0.0.1:1" },
        fileText: "HTTPS_PROXY=http://127.0.0.1:65502\n",
      })
    ).toEqual(["http://127.0.0.1:65502", "http://127.0.0.1:1"])
  })

  it("按 cwd 列出 .env.local 候选路径", () => {
    expect(envLocalFilePaths("/repo/apps/web")).toContain("/repo/apps/web/.env.local")
    expect(envLocalFilePaths("/repo")).toContain("/repo/apps/web/.env.local")
  })

  it("去重且 ANALYTICS_HTTPS_PROXY 优先", () => {
    expect(
      collectProxyCandidates({
        env: {
          ANALYTICS_HTTPS_PROXY: "http://127.0.0.1:65503",
          HTTPS_PROXY: "http://127.0.0.1:65503",
        },
      })
    ).toEqual(["http://127.0.0.1:65503"])
  })
})

describe("selectProxyUrl", () => {
  it("文件里的代理不因探测失败被丢掉", async () => {
    const chosen = await selectProxyUrl(
      ["http://127.0.0.1:65502", "http://127.0.0.1:1"],
      ["http://127.0.0.1:65502"],
      async () => false
    )
    expect(chosen).toBe("http://127.0.0.1:65502")
  })

  it("仅进程 env 时仍按探测结果取舍", async () => {
    const chosen = await selectProxyUrl(
      ["http://127.0.0.1:1", "http://127.0.0.1:65502"],
      [],
      async (url) => url.endsWith(":65502")
    )
    expect(chosen).toBe("http://127.0.0.1:65502")
  })
})

describe("trustedProxyUrls", () => {
  it("桌面信任已注入的 env，不读 web .env.local", () => {
    expect(isDesktopAnalyticsProcess({ ZLOG_DESKTOP_KEY: "k" })).toBe(true)
    expect(
      trustedProxyUrls({
        desktop: true,
        fileUrls: ["http://127.0.0.1:65502"],
        candidates: ["http://127.0.0.1:65503"],
      })
    ).toEqual(["http://127.0.0.1:65503"])
  })

  it("本地 web 只信任文件里的代理", () => {
    expect(isDesktopAnalyticsProcess({})).toBe(false)
    expect(
      trustedProxyUrls({
        desktop: false,
        fileUrls: ["http://127.0.0.1:65502"],
        candidates: ["http://127.0.0.1:1", "http://127.0.0.1:65502"],
      })
    ).toEqual(["http://127.0.0.1:65502"])
  })
})

describe("isLoopbackProxyUrl", () => {
  it("认本机代理", () => {
    expect(isLoopbackProxyUrl("http://127.0.0.1:65502")).toBe(true)
    expect(isLoopbackProxyUrl("http://proxy.example:8080")).toBe(false)
  })
})
