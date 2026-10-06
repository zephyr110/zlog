import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SiteSettingsRecord } from "@zlog/database"
import { getSiteConfig } from "@/lib/get-site-config"

// get-site-config 在模块级调用 unstable_cache，且内部调用 getSiteSettings。
// 两个 mock 工厂会被提升到 import 之上，可控状态用 vi.hoisted 提前声明。
const state = vi.hoisted(() => ({
  // 用例 1：DB 里的完整行（12 字段，含配色）。
  record: null as SiteSettingsRecord | null,
  // 用例 2：模拟跨部署遗留的旧缓存条目（缺 baseColor/themeColor）。
  staleCache: null as Record<string, unknown> | null,
}))

vi.mock("@zlog/database", () => ({
  getSiteSettings: vi.fn(async () => state.record),
}))

// unstable_cache 替换为：staleCache 有值（旧部署写进 Data Cache 的条目）
// 就直接返回；否则透传真实 loadCachedConfig（内部读 mock 的 getSiteSettings）。
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => async () =>
    state.staleCache ?? (fn as () => Promise<unknown>)(),
}))

const fullRow: SiteSettingsRecord = {
  name: "Zlog",
  title: "Zlog",
  description: "desc",
  authorName: "Admin",
  logoUrl: "",
  logoInvertDark: false,
  githubUrl: "",
  twitterUrl: "",
  commentEnabled: true,
  projectsEnabled: false,
  baseColor: "slate",
  themeColor: "blue",
}

beforeEach(() => {
  state.record = null
  state.staleCache = null
})

describe("getSiteConfig：缓存链路的配色字段", () => {
  it("DB 行的 baseColor/themeColor 经 loadCachedConfig 透传后原样读出", async () => {
    state.record = fullRow
    const config = await getSiteConfig()
    expect(config.baseColor).toBe("slate")
    expect(config.themeColor).toBe("blue")
  })

  it("旧缓存条目缺配色字段 → ?? 兜底为编译期默认（不得渲染 undefined）", async () => {
    // 先按当前版本完整读一次拿缓存对象的真实形状（cachedLoad 不产出
    // siteUrl/ogImage），再剥掉 T6 新增的 baseColor/themeColor —— 即 T6
    // 之前部署写入 Data Cache 的条目。
    state.record = fullRow
    const current = await getSiteConfig()
    const stale: Record<string, unknown> = { ...current }
    delete stale.baseColor
    delete stale.themeColor
    delete stale.siteUrl
    delete stale.ogImage

    state.staleCache = stale
    const config = await getSiteConfig()
    expect(config.baseColor).toBe("neutral")
    expect(config.themeColor).toBe("default")
  })
})
