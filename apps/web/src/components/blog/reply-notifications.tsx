"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BellRing } from "lucide-react"
import { useT } from "@/components/layout/trans"
import { Button } from "@/components/ui/button"
import {
  STATIC_MIRROR,
  displayName,
  type PublicComment,
} from "@/lib/comment-shared"
import {
  findUnseenReplies,
  listMyComments,
  markRepliesSeen,
  type MyCommentEntry,
} from "@/lib/my-comments"

/** A visible tab re-asks for new replies at most this often. */
const RECHECK_INTERVAL_MS = 60_000

type UnseenReply = { reply: PublicComment; entry: MyCommentEntry }

/** Site-wide reply-notification banner for anonymous commenters (bottom
 *  left, clear of sonner's bottom-right stack). Guests have no account,
 *  so "did my comment get a reply" is answered from the browser's own
 *  record of posted comment ids (my-comments.ts) plus a batched lookup
 *  (GET /api/comments/replies). Best-effort by design: any failure just
 *  leaves the banner as it was. */
export function ReplyNotifications() {
  const { t } = useT()
  const [unseen, setUnseen] = useState<UnseenReply[]>([])
  const lastCheckRef = useRef(0)
  // Every check() and dismissAll() bumps this — a response landing after
  // a dismissal (or after a newer check started) is discarded instead of
  // resurrecting the banner from stale state.
  const checkSeqRef = useRef(0)

  const check = useCallback(async () => {
    const entries = listMyComments()
    if (entries.length === 0) return
    lastCheckRef.current = Date.now()
    const seq = ++checkSeqRef.current
    try {
      const ids = entries.map((e) => e.id).join(",")
      const res = await fetch(`/api/comments/replies?ids=${ids}`)
      if (!res.ok) return
      const data = (await res.json()) as { replies: PublicComment[] }
      if (seq !== checkSeqRef.current) return
      // Re-read the watermark AFTER the await: findUnseenReplies is pure
      // over the entries it receives, so the pre-fetch snapshot would
      // resurrect replies the visitor dismissed while the request was
      // in flight.
      setUnseen(findUnseenReplies(listMyComments(), data.replies ?? []))
    } catch {
      // Offline / aborted — retry on the next tick.
    }
  }, [])

  const maybeCheck = useCallback(() => {
    if (Date.now() - lastCheckRef.current < RECHECK_INTERVAL_MS) return
    void check()
  }, [check])

  useEffect(() => {
    if (STATIC_MIRROR) return
    void check() // eslint-disable-line react-hooks/set-state-in-effect -- async fetch, same pattern as admin/media
    // Returning to the tab is the moment a stale banner is most likely —
    // check immediately instead of waiting for the interval.
    const onVisibility = () => {
      if (document.visibilityState === "visible") maybeCheck()
    }
    document.addEventListener("visibilitychange", onVisibility)
    const timer = setInterval(maybeCheck, RECHECK_INTERVAL_MS)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      clearInterval(timer)
    }
  }, [check, maybeCheck])

  /** Mark every shown reply as seen (watermark per my-comment) and hide
   *  the banner. Shared by both actions — "View" navigates away, but the
   *  banner must not re-appear on the next page (the root layout keeps
   *  this component mounted across client-side navigation). */
  const dismissAll = useCallback(() => {
    checkSeqRef.current++ // discard any in-flight check's stale result
    const groups = new Map<
      number,
      { entry: MyCommentEntry; replies: PublicComment[] }
    >()
    for (const item of unseen) {
      const group = groups.get(item.entry.id) ?? {
        entry: item.entry,
        replies: [],
      }
      group.replies.push(item.reply)
      groups.set(item.entry.id, group)
    }
    for (const { entry, replies } of groups.values()) {
      markRepliesSeen(entry, replies)
    }
    setUnseen([])
  }, [unseen])

  if (STATIC_MIRROR || unseen.length === 0) return null

  // Newest reply leads — it is the one most likely to still be on the
  // visitor's mind (the list is oldest-first).
  const latest = unseen[unseen.length - 1]

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-4 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BellRing size={16} />
        </span>
        <p className="text-sm font-semibold">
          {t("post.replyNoticeTitle")(unseen.length)}
        </p>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">
          {displayName(latest.reply.authorName)}
        </span>
        {" — "}
        {latest.reply.content}
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={dismissAll}>
          {t("post.replyNoticeDismiss")}
        </Button>
        <Button
          size="sm"
          render={
            <Link
              href={`/posts/${latest.reply.postSlug}#comment-${latest.reply.id}`}
              onClick={dismissAll}
            />
          }
        >
          {t("post.replyNoticeOpen")}
        </Button>
      </div>
    </div>
  )
}
