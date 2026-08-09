"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Reply, FileText, Mail, Trash2, Check } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { useCommentUnread } from "@/components/admin/comment-unread"
import { useT } from "@/components/layout/trans"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CommentInboxCardSkeleton } from "@/components/ui/loading"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { PaginationBar } from "@/components/admin/pagination-bar"
import { HeaderActions } from "@/components/admin/header-actions"
import { CommentAvatar } from "@/components/blog/comment-avatar"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useStaleRequest } from "@/hooks/use-stale-request"
// The admin API passes the DB result through untouched, so the wire
// shape IS the package type — no local re-declaration to drift.
import type { AdminCommentRecord, AdminCommentPage } from "@zlog/database"

/** Comment inbox — new comments land here (unread-first) with the
 *  sidebar badge; spam gets deleted, legit comments marked read. */
export default function AdminCommentsPage() {
  const { t } = useT()
  const [comments, setComments] = useState<AdminCommentRecord[]>([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const { refresh: refreshUnread } = useCommentUnread()
  // Stale-response guard: fast page clicks can interleave fetches; only
  // the latest request may write state.
  const { begin, isCurrent } = useStaleRequest()

  const load = useCallback(async () => {
    const seq = begin()
    setLoading(true)
    try {
      const res = await apiFetch(
        `/api/admin/comments?page=${page}&pageSize=${pageSize}`
      )
      if (!res.ok) return
      if (!isCurrent(seq)) return // superseded by a newer load
      const data = (await res.json()) as AdminCommentPage
      setComments(data.items)
      setTotal(data.total)
      setUnreadCount(data.unreadCount)
      const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize))
      setTotalPages(lastPage)
      // Dead-page guard: comments deleted elsewhere (or a pageSize
      // switch) can leave `page` beyond the last page — an empty list
      // with total > 0 would strand the admin with no pagination bar.
      if (data.items.length === 0 && data.total > 0 && page > lastPage) {
        setPage(lastPage)
      }
    } finally {
      if (isCurrent(seq)) setLoading(false)
    }
  }, [page, pageSize, begin, isCurrent])

  useEffect(() => {
    void load() // eslint-disable-line react-hooks/set-state-in-effect -- async fetch, same pattern as admin/media
  }, [load])

  /** True only when the server actually applied the change — the delete
   *  route answers 200 with {ok:false} for a missing id, so res.ok alone
   *  is not enough. */
  async function applied(res: Response): Promise<boolean> {
    if (!res.ok) return false
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
    return data?.ok !== false
  }

  async function markRead(id: number) {
    setBusyId(id)
    try {
      const res = await apiFetch(`/api/admin/comments/${id}/read`, {
        method: "POST",
      })
      if (!(await applied(res))) {
        toast.error(t("admin.loadFailed"))
        return
      }
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isRead: true } : c))
      )
      setUnreadCount((n) => Math.max(0, n - 1))
      // Sidebar badge + dashboard card read the shared provider — tell
      // it to re-fetch now instead of waiting up to 60 s.
      refreshUnread()
    } catch {
      toast.error(t("admin.loadFailed"))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: number) {
    if (!window.confirm(t("admin.commentDeleteConfirm"))) return
    setBusyId(id)
    try {
      const res = await apiFetch(`/api/admin/comments/${id}`, {
        method: "DELETE",
      })
      if (!(await applied(res))) {
        toast.error(t("admin.loadFailed"))
        return
      }
      // The server cascades a root's replies — mirror that locally:
      // drop the row and any replies pointing at it on THIS page, and
      // adjust total/unread by the server-reported counts (which cover
      // replies on other pages too), so the counts and pagination stay
      // truthful without a full reload.
      const data = (await res.json().catch(() => null)) as {
        removed?: number
        removedUnread?: number
      } | null
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id))
      setTotal((n) => Math.max(0, n - (data?.removed ?? 1)))
      setUnreadCount((n) => Math.max(0, n - (data?.removedUnread ?? 0)))
      refreshUnread()
      // Dead-page clamp: if this page emptied out, step back a page —
      // setPage re-triggers load(). Otherwise the local update is
      // enough; no full reload (avoids skeleton flicker).
      const goneOnPage = comments.filter((c) => c.id === id || c.parentId === id)
      if (goneOnPage.length >= comments.length && page > 1) setPage(page - 1)
    } catch {
      toast.error(t("admin.loadFailed"))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {unreadCount > 0 && (
        <HeaderActions>
          <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
            {t("admin.unreadComments")} · {unreadCount}
          </span>
        </HeaderActions>
      )}

      {loading ? (
        <div className="min-h-0 flex-1">
          {/* Mirror the inbox card layout — same heights and shapes as
              the live cards so the swap causes no layout shift. The
              second card shows the thread-context line (unread-first
              ordering keeps threads co-located). */}
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <CommentInboxCardSkeleton key={i} withThread={i === 1} />
            ))}
          </div>
        </div>
      ) : comments.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-card ring-1 ring-foreground/10">
          <AdminBlockEmpty className="min-h-0 flex-1" />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {comments.map((comment) => (
              <Card
                key={comment.id}
                size="sm"
                className={cn(
                  "transition-colors",
                  !comment.isRead && "bg-primary/[0.03] ring-primary/30"
                )}
              >
                <CardHeader className="flex flex-row flex-wrap items-center gap-3">
                  <CommentAvatar
                    commentId={comment.id}
                    name={comment.authorName || "Anonymous"}
                    size="default"
                  />
                  <div className="min-w-0 flex-1 basis-32">
                    <div className="flex items-center gap-2">
                      <CardTitle
                        className={cn(
                          "truncate text-sm",
                          comment.isRead
                            ? "font-semibold text-muted-foreground"
                            : "font-bold"
                        )}
                      >
                        {/* Raw stored name — the Anonymous_<hex> suffix
                            is what lets the admin tell nameless
                            visitors apart; only the public page folds
                            it to "Anonymous". */}
                        {comment.authorName || "Anonymous"}
                      </CardTitle>
                      {!comment.isRead && (
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </div>
                    <CardDescription className="mt-0.5 text-xs">
                      {new Date(comment.createdAt).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </CardDescription>
                  </div>
                  {/* Status / delete live in the header corner so the
                      body reads author → comment → context without a
                      full-width action band. On narrow panes the
                      actions wrap to their own row (basis-full). */}
                  <div className="ml-auto flex shrink-0 items-center gap-1 max-sm:basis-full max-sm:justify-end">
                    {comment.isRead ? (
                      <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground/70">
                        <Check size={13} />
                        {t("admin.commentRead")}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void markRead(comment.id)}
                        disabled={busyId === comment.id}
                      >
                        <Check size={14} className="mr-1.5" />
                        {t("admin.markRead")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void remove(comment.id)}
                      disabled={busyId === comment.id}
                    >
                      <Trash2 size={14} className="mr-1.5" />
                      {t("admin.delete")}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-2.5">
                  {comment.parentName != null && (
                    <div className="flex items-center gap-1.5 border-l-2 border-foreground/10 pl-2.5 text-xs text-muted-foreground">
                      <Reply size={12} className="shrink-0" />
                      <span className="truncate">
                        {t("post.commentReplyingTo")(comment.parentName)}
                      </span>
                    </div>
                  )}

                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {comment.content}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/50 pt-2.5 text-xs text-muted-foreground/80">
                    <Link
                      href={`/posts/${encodeURIComponent(comment.postSlug)}`}
                      className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline"
                    >
                      <FileText size={12} className="shrink-0" />
                      <span className="truncate">{comment.postSlug}</span>
                    </Link>
                    {comment.authorEmail && (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <Mail size={12} className="shrink-0" />
                        <span className="truncate">{comment.authorEmail}</span>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            itemLabel={t("admin.comments")}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </div>
  )
}
