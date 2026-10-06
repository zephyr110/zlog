import { describe, it, expect, vi } from "vitest"
import { siteConfigFromRow } from "@/lib/get-site-config"
import { updateSchema } from "@/lib/site-settings-schema"
import type { SiteSettingsRecord } from "@zlog/database"

// get-site-config 在模块级调用 unstable_cache —— 测试里透传为恒等函数。
// （vi.mock 会被 vitest 提升到 import 之上，无需块内引用。）
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}))

const baseRow: SiteSettingsRecord = {
  name: "Zlog",
  title: "Zlog",
  description: "",
  authorName: "Admin",
  logoUrl: "",
  logoInvertDark: false,
  githubUrl: "",
  twitterUrl: "",
  commentEnabled: true,
  projectsEnabled: false,
  baseColor: "neutral",
  themeColor: "default",
}

describe("siteConfigFromRow：配色字段", () => {
  it("原样透传合法值", () => {
    const config = siteConfigFromRow({
      ...baseRow,
      baseColor: "slate",
      themeColor: "blue",
    })
    expect(config.baseColor).toBe("slate")
    expect(config.themeColor).toBe("blue")
  })

  it("脏值（手改 DB）与缺省（无行）回落默认", () => {
    const dirty = siteConfigFromRow({
      ...baseRow,
      baseColor: "mauve",
      themeColor: "cyan",
    })
    expect(dirty.baseColor).toBe("neutral")
    expect(dirty.themeColor).toBe("default")
    const noRow = siteConfigFromRow(null)
    expect(noRow.baseColor).toBe("neutral")
    expect(noRow.themeColor).toBe("default")
  })
})

describe("updateSchema：枚举校验（400 路径）", () => {
  it("接受合法值与空对象（全 optional）", () => {
    expect(
      updateSchema.safeParse({ baseColor: "slate", themeColor: "blue" }).success
    ).toBe(true)
    expect(updateSchema.safeParse({}).success).toBe(true)
  })

  it("拒绝未知枚举", () => {
    expect(updateSchema.safeParse({ baseColor: "mauve" }).success).toBe(false)
    expect(updateSchema.safeParse({ themeColor: "cyan" }).success).toBe(false)
  })
})
