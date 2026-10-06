import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * 关键接线守护 — 静态源文本断言（同 packages/database/test/site-settings-defaults.test.ts
 * 范式）。这两处接线是配色链路的唯一边界，且删除后其余测试（目录完整性、drift、
 * schema 校验）仍全绿——功能却静默失效：
 * - layout.tsx：引入生成 CSS + <html> 直出 data-* 属性（选择器挂靠点）；
 * - route.ts：dbPatch 透传两字段 + 首存分支默认兜底（保存链路）。
 * 锚点逐字取自真实源文本，不做宽泛子串匹配。
 */
const layoutSrc = readFileSync(join(__dirname, "../src/app/layout.tsx"), "utf8")
const routeSrc = readFileSync(
  join(__dirname, "../src/app/api/site-settings/route.ts"),
  "utf8"
)

describe("root layout 配色接线", () => {
  it("引入生成的配色 CSS", () => {
    expect(layoutSrc).toContain('import "./theme-colors.generated.css"')
  })

  it("<html> 直出 data-base-color / data-theme-color（选择器挂靠点）", () => {
    expect(layoutSrc).toContain("data-base-color={site.baseColor}")
    expect(layoutSrc).toContain("data-theme-color={site.themeColor}")
  })
})

describe("site-settings PUT 配色接线", () => {
  it("dbPatch 透传两字段（upsert 局部合并依赖字段在场）", () => {
    expect(routeSrc).toMatch(/\n {4}baseColor: patch\.baseColor,/)
    expect(routeSrc).toMatch(/\n {4}themeColor: patch\.themeColor,/)
  })

  it("首存分支以编译期默认值兜底两字段", () => {
    expect(routeSrc).toMatch(
      /\n {8}baseColor: patch\.baseColor \?\? defaultSiteConfig\.baseColor,/
    )
    expect(routeSrc).toMatch(
      /\n {8}themeColor: patch\.themeColor \?\? defaultSiteConfig\.themeColor,/
    )
  })
})
