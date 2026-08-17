import { describe, it, expect } from "vitest"
import { compareVersions, pickAssetUrl, classifyLatestHttpStatus } from "../electron/updater"

describe("compareVersions", () => {
  it("基础数字比较", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0)
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1)
    expect(compareVersions("1.1.0", "1.0.9")).toBe(1)
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1)
    expect(compareVersions("0.9.0", "1.0.0")).toBe(-1)
  })

  it("支持 v 前缀（GitHub tag 格式）", () => {
    expect(compareVersions("v1.1.0", "1.0.0")).toBe(1)
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0)
  })

  it("prerelease 低于对应正式版", () => {
    expect(compareVersions("1.1.0-beta.1", "1.1.0")).toBe(-1)
    expect(compareVersions("1.1.0", "1.1.0-beta.1")).toBe(1)
  })

  it("prerelease 数字段按数值比较（beta.10 > beta.9）", () => {
    expect(compareVersions("1.1.0-beta.10", "1.1.0-beta.9")).toBe(1)
    expect(compareVersions("1.1.0-beta.9", "1.1.0-beta.10")).toBe(-1)
  })

  it("prerelease 跨版本比较（1.1.0-beta.1 > 1.0.0）", () => {
    expect(compareVersions("1.1.0-beta.1", "1.0.0")).toBe(1)
    expect(compareVersions("1.0.0", "1.1.0-beta.1")).toBe(-1)
  })

  it("非法输入回落字典序", () => {
    expect(compareVersions("junk", "1.0.0")).toBe(1) // "j" > "1"
    expect(compareVersions("1.0.0", "junk")).toBe(-1)
  })
})

describe("pickAssetUrl", () => {
  const assets = [
    { name: "Zlog-1.1.0-arm64.dmg", browser_download_url: "https://a/arm64.dmg" },
    { name: "Zlog-1.1.0-x64.dmg", browser_download_url: "https://a/x64.dmg" },
    { name: "Zlog-Setup-1.1.0.exe", browser_download_url: "https://a/setup.exe" },
    { name: "Zlog-1.1.0-x86_64.AppImage", browser_download_url: "https://a/appimage" },
    { name: "Zlog-1.1.0-amd64.deb", browser_download_url: "https://a/deb" },
    { name: "Zlog-1.1.0-arm64.zip", browser_download_url: "https://a/zip" },
  ]

  it("macOS 按架构匹配 dmg", () => {
    expect(pickAssetUrl(assets, "darwin", "arm64")).toBe("https://a/arm64.dmg")
    expect(pickAssetUrl(assets, "darwin", "x64")).toBe("https://a/x64.dmg")
  })

  it("Windows 匹配 NSIS 安装器", () => {
    expect(pickAssetUrl(assets, "win32", "x64")).toBe("https://a/setup.exe")
  })

  it("Linux 匹配 AppImage（忽略 deb）", () => {
    expect(pickAssetUrl(assets, "linux", "x64")).toBe("https://a/appimage")
  })

  it("Linux x64 兼容 electron-builder 的 x64 形态（部分版本产出 -x64.AppImage）", () => {
    const mixed = [
      { name: "Zlog-1.1.0-x64.AppImage", browser_download_url: "https://a/x64.AppImage" },
      { name: "Zlog-1.1.0-arm64.AppImage", browser_download_url: "https://a/arm64.AppImage" },
      { name: "Zlog-1.1.0-aarch64.AppImage", browser_download_url: "https://a/aarch64.AppImage" },
    ]
    expect(pickAssetUrl(mixed, "linux", "x64")).toBe("https://a/x64.AppImage")
    expect(pickAssetUrl(mixed, "linux", "arm64")).toBe("https://a/arm64.AppImage")
  })

  it("Linux arm64 兼容 aarch64 形态", () => {
    const aarch = [
      { name: "Zlog-1.1.0-aarch64.AppImage", browser_download_url: "https://a/aarch64.AppImage" },
    ]
    expect(pickAssetUrl(aarch, "linux", "arm64")).toBe("https://a/aarch64.AppImage")
  })

  it("平台无资产时返回 null", () => {
    expect(pickAssetUrl([{ name: "Zlog-1.1.0-arm64.zip", browser_download_url: "x" }], "linux", "x64")).toBeNull()
    expect(pickAssetUrl([], "darwin", "arm64")).toBeNull()
  })
})

describe("classifyLatestHttpStatus", () => {
  it("404（无正式版 / 仅 draft）映射为 not_found，避免误报网络失败", () => {
    expect(classifyLatestHttpStatus(404)).toBe("not_found")
  })

  it("其他非 2xx 映射为 http", () => {
    expect(classifyLatestHttpStatus(403)).toBe("http")
    expect(classifyLatestHttpStatus(500)).toBe("http")
  })
})
