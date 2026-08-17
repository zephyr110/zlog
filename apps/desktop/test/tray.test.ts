import { describe, it, expect } from "vitest"
import { trayMenuLabels } from "../electron/tray"

describe("trayMenuLabels", () => {
  it("中文菜单：立即同步之后是检查更新，退出在最后", () => {
    expect(trayMenuLabels("zh")).toEqual([
      "打开",
      "设置",
      "立即同步",
      "检查更新",
      "退出",
    ])
  })

  it("英文菜单顺序与中文一致，且不含汉字", () => {
    const labels = trayMenuLabels("en")
    expect(labels).toEqual([
      "Open",
      "Settings",
      "Sync Now",
      "Check for Updates",
      "Quit",
    ])
    for (const label of labels) {
      expect(label).not.toMatch(/[\u4e00-\u9fff]/)
    }
  })
})
