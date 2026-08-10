// post — zh/en translation dictionary (split by domain)

import type { LocaleMessages } from "./locale-messages"

const zh = {

minRead: (n: number) => `${n} 分钟`,
comments: "评论",
commentsCount: (n: number) => `评论 (${n})`,
commentAuthorPlaceholder: "昵称（可选）",
commentEmailPlaceholder: "邮箱（可选）",
commentContentPlaceholder: "写下你的评论…",
commentSubmit: "发表评论",
commentSubmitting: "发布中…",
commentEmpty: "还没有评论，来抢沙发",
commentClosed: "评论已关闭",
commentNotConfigured: "评论功能尚未配置，请稍后再试",
commentReply: "回复",
commentReplyingTo: (n: string) => `回复 @${n}`,
commentCancelReply: "取消",
commentErrorTooFast: "提交过快，请稍后再试",
commentErrorRateLimited: "评论过于频繁，请稍后再试",
commentErrorInvalid: "评论内容不符合要求",
commentErrorVerify: "安全验证未通过，请重新尝试",
commentErrorInvalidTarget: "回复目标不存在或已被删除",
commentErrorSessionExpired: "会话已过期，请重新提交",
commentErrorServiceUnavailable: "评论服务暂时不可用，请稍后再试",
commentErrorClosed: "评论已关闭",
commentErrorFailed: "提交失败，请重试",
commentMirrorUnavailable: "评论功能仅在主站可用，请访问 zephyr110.vercel.app",
commentRetry: "重试",
relatedPosts: "相关文章",
shareOnX: "分享到 X",
copyLink: "复制链接",
linkCopied: "链接已复制！",
copyFailed: "复制失败",
copyCode: "复制代码",
codeCopied: "已复制！",
mermaidError: "图表渲染失败，以下是原始 mermaid 源码：",
tagsLabel: "标签",
chars: (n: number) => `${n} 字`,
words: (n: number) => `${n} 词`,
readTime: (n: number) => `约 ${n} 分钟`,
shortDate: (d: Date) =>
  d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    // UTC calendar date — without this the static-exported HTML (built
    // in one timezone) would differ from the hydrated client render.
    timeZone: "UTC",
  }),
    
} as const

const en = {

minRead: (n: number) => `${n} min`,
comments: "Comments",
commentsCount: (n: number) => `Comments (${n})`,
commentAuthorPlaceholder: "Name (optional)",
commentEmailPlaceholder: "Email (optional)",
commentContentPlaceholder: "Write your comment…",
commentSubmit: "Post comment",
commentSubmitting: "Posting…",
commentEmpty: "No comments yet — be the first",
commentClosed: "Comments closed",
commentNotConfigured: "Comments not configured yet",
commentReply: "Reply",
commentReplyingTo: (n: string) => `Reply to @${n}`,
commentCancelReply: "Cancel",
commentErrorTooFast: "Posting too fast, please wait a moment",
commentErrorRateLimited: "Too many comments, please slow down",
commentErrorInvalid: "Comment content is not valid",
commentErrorVerify: "Security check failed, please try again",
commentErrorInvalidTarget: "The comment you were replying to was removed",
commentErrorSessionExpired: "Session expired, please resubmit",
commentErrorServiceUnavailable: "Comment service is temporarily unavailable",
commentErrorClosed: "Comments are closed",
commentErrorFailed: "Failed to post, please retry",
commentMirrorUnavailable: "Comments are only available on the main site — visit zephyr110.vercel.app",
commentRetry: "Retry",
relatedPosts: "Related posts",
shareOnX: "Share on X",
copyLink: "Copy link",
linkCopied: "Link copied!",
copyFailed: "Copy failed",
copyCode: "Copy code",
codeCopied: "Copied!",
mermaidError: "Failed to render the diagram — raw mermaid source:",
tagsLabel: "Tags",
chars: (n: number) => `${n} chars`,
words: (n: number) => `${n} words`,
readTime: (n: number) => `About ${n} min`,
shortDate: (d: Date) =>
  d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    // UTC calendar date — without this the static-exported HTML (built
    // in one timezone) would differ from the hydrated client render.
    timeZone: "UTC",
  }),

} as const satisfies LocaleMessages<typeof zh>

export const post = { zh, en }
