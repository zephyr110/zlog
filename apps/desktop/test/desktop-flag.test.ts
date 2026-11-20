import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(__dirname, "..", "..", "..")
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8")

describe("桌面能力开关接线", () => {
  it("桌面开关由 next.config 从 NEXT_DESKTOP 派生并构建期内联", () => {
    expect(read("apps/web/next.config.ts")).toContain(
      'NEXT_PUBLIC_DESKTOP: isDesktop ? "1" : "0"'
    )
    const script = read("apps/desktop/scripts/prepare-standalone.mjs")
    expect(script).toContain('NEXT_DESKTOP: "true"')
    // NEXT_PUBLIC_* 只在构建期内联，运行时注入（server-env）影响不到 SSR/客户端
    expect(script).not.toContain('NEXT_PUBLIC_DESKTOP: "1"')
    expect(read("apps/desktop/electron/server-env.ts")).not.toContain(
      "NEXT_PUBLIC_DESKTOP"
    )
  })

  it("根布局挂载命令根壳，公开页与后台挂载模式切换", () => {
    expect(read("apps/web/src/app/layout.tsx")).toContain("<DesktopShell />")
    expect(read("apps/web/src/components/layout/header.tsx")).toContain(
      "<DesktopModeSwitch"
    )
    expect(read("apps/web/src/app/admin/layout.tsx")).toContain(
      "<DesktopModeSwitch />"
    )
  })

  it("编辑器把未保存状态暴露给根壳", () => {
    const editor = read("apps/web/src/components/admin/post-editor.tsx")
    expect(editor).toContain("window.__zlogEditorDirty = dirty")
  })
})
