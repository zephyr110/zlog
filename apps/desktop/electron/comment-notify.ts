import { type ResolvedLang } from "./lang"

/**
 * 评论通知的纯逻辑（轮询与系统通知在 main.ts 里接线）。
 *
 * 通知策略：
 * - prev === null 表示本次会话尚无基线（刚启动）——只记基线不通知，
 *   避免每次启动都为历史积压弹一轮通知；
 * - 只有未读数「上升」才通知（已读过再涨才值得再打扰一次）。
 */
export function shouldNotifyNewComments(
  prev: number | null,
  next: number
): boolean {
  return prev !== null && next > prev
}

/** 评论页 URL 判定：此时用户正在看评论，上涨的未读数不弹系统通知。 */
export function isCommentsPageUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).pathname.startsWith("/admin/comments")
  } catch {
    return false
  }
}

/** macOS Dock 角标：0 清除（空串），超过 99 显示 99+。 */
export function dockBadgeFor(unread: number): string {
  if (unread <= 0) return ""
  return unread > 99 ? "99+" : String(unread)
}

export const COMMENT_NOTIFY_COPY: Record<
  ResolvedLang,
  { title: string; body: (n: number) => string }
> = {
  zh: {
    title: "Zlog 新评论",
    body: (n) => `收到 ${n} 条新评论，点击查看。`,
  },
  en: {
    title: "Zlog: new comment",
    body: (n) => `${n} new comment${n === 1 ? "" : "s"} — click to view.`,
  },
}
