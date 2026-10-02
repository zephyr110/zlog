import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  COMMENT_NOTIFY_COPY,
  dockBadgeFor,
  isCommentsPageUrl,
  shouldNotifyNewComments,
} from "../electron/comment-notify"

const main = readFileSync(join(__dirname, "../electron/main.ts"), "utf8")

describe("shouldNotifyNewComments", () => {
  it("尚无基线（刚启动）时不通知，避免历史积压弹一轮", () => {
    expect(shouldNotifyNewComments(null, 3)).toBe(false)
    expect(shouldNotifyNewComments(null, 0)).toBe(false)
  })

  it("未读数上升才通知", () => {
    expect(shouldNotifyNewComments(0, 1)).toBe(true)
    expect(shouldNotifyNewComments(2, 3)).toBe(true)
  })

  it("数量不变或下降（读完标记已读）不通知", () => {
    expect(shouldNotifyNewComments(3, 3)).toBe(false)
    expect(shouldNotifyNewComments(3, 1)).toBe(false)
    expect(shouldNotifyNewComments(1, 0)).toBe(false)
  })
})

describe("isCommentsPageUrl", () => {
  it("评论页（含查询串）判定为真", () => {
    expect(isCommentsPageUrl("http://127.0.0.1:4310/admin/comments")).toBe(true)
    expect(
      isCommentsPageUrl("http://127.0.0.1:4310/admin/comments?filter=unread")
    ).toBe(true)
  })

  it("其他页面 / 空值 / 非法 URL 判定为假", () => {
    expect(isCommentsPageUrl("http://127.0.0.1:4310/admin/posts")).toBe(false)
    expect(isCommentsPageUrl(undefined)).toBe(false)
    expect(isCommentsPageUrl("not a url")).toBe(false)
  })
})

describe("dockBadgeFor", () => {
  it("0 清空角标，个位数原样，超过 99 显示 99+", () => {
    expect(dockBadgeFor(0)).toBe("")
    expect(dockBadgeFor(-1)).toBe("")
    expect(dockBadgeFor(5)).toBe("5")
    expect(dockBadgeFor(100)).toBe("99+")
  })
})

describe("COMMENT_NOTIFY_COPY", () => {
  it("中英文案都带条数，且英文单复数正确", () => {
    expect(COMMENT_NOTIFY_COPY.zh.body(3)).toContain("3")
    expect(COMMENT_NOTIFY_COPY.en.body(1)).toContain("1 new comment —")
    expect(COMMENT_NOTIFY_COPY.en.body(2)).toContain("2 new comments")
  })
})

describe("main process wiring", () => {
  it("轮询桌面密钥接口，Dock 角标 + 通知点击跳评论页", () => {
    expect(main).toContain("shouldNotifyNewComments")
    expect(main).toContain("/api/desktop/comment-unread")
    expect(main).toContain("setBadge(dockBadgeFor(")
    expect(main).toContain("COMMENT_NOTIFY_COPY[currentLang]")
    expect(main).toContain("/admin/comments")
  })
})
