"use client"

import { useT } from "@/components/layout/trans"
import { CommentAvatar } from "@/components/blog/comment-avatar"
import { displayName, type PublicComment } from "@/lib/comment-shared"

/** One comment bubble — #number (display order), avatar, name, date,
 *  content, and (for root comments) the reply action. */
export function CommentCard({
  comment,
  no,
  onReply,
}: {
  comment: PublicComment
  no: number
  onReply?: (comment: PublicComment) => void
}) {
  const { t } = useT()
  const name = displayName(comment.authorName)
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">#{no}</span>
        <CommentAvatar commentId={comment.id} name={name} />
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(comment.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
        {onReply && (
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="ml-auto text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            {t("post.commentReply")}
          </button>
        )}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
        {comment.content}
      </p>
    </div>
  )
}
