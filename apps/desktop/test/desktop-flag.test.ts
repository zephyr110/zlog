import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(__dirname, "..", "..", "..")
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8")

describe("桌面能力开关接线", () => {
  it("桌面构建注入 NEXT_PUBLIC_DESKTOP，Web 构建不注入", () => {
    const script = read("apps/desktop/scripts/prepare-standalone.mjs")
    expect(script).toContain('NEXT_PUBLIC_DESKTOP: "1"')
  })

  it("服务端 SSR 也能读到开关（与客户端内联值一致）", () => {
    const env = read("apps/desktop/electron/server-env.ts")
    expect(env).toContain('NEXT_PUBLIC_DESKTOP: "1"')
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
    expect(editor).toContain("window.__zlogEditorDirty = hasUnsavedChanges()")
  })
})
