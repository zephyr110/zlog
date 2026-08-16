"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MessageSquare } from "lucide-react"
import { useT } from "@/components/layout/trans"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { Button } from "@/components/ui/button"
import {
  COMMENT_MIN_SUBMIT_DELAY_MS,
  type PublicComment,
} from "@/lib/comment-shared"
import { CommentCard } from "@/components/blog/comment-card"
import { CommentForm } from "@/components/blog/comment-form"
import { useStaleRequest } from "@/hooks/use-stale-request"

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
// The GitHub Pages mirror (static export) has no API routes — comments
// cannot work there. Build-time flag from the CI-injected site URL:
// deploy.yml sets NEXT_PUBLIC_SITE_URL=https://zephyr110.github.io.
const STATIC_MIRROR = !!process.env.NEXT_PUBLIC_SITE_URL?.includes("github.io")

/** Guest comments, self-hosted (replaces giscus): no login, immediate
 *  display, spam-gated server-side (signed session token + Turnstile +
 *  rate limits + content filters in /api/comments). The email is stored
 *  for contact only — never rendered. */
export function CommentSection({ slug }: { slug: string }) {
  const { t } = useT()
  const site = useSiteConfig()

  const [comments, setComments] = useState<PublicComment[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  // False until the signed session is COMMENT_MIN_SUBMIT_DELAY_MS old
  // (time-trap mirror). Set from a timer rather than Date.now() at
  // render — render must stay pure.
  const [sessionReady, setSessionReady] = useState(false)
  // True when the session endpoint failed (missing SESSION_SECRET in
  // production, outage, static host) — the form shows a notice instead
  // of a silently dead submit button.
  const [sessionError, setSessionError] = useState(false)

  const [authorName, setAuthorName] = useState("")
  const [authorEmail, setAuthorEmail] = useState("")
  const [content, setContent] = useState("")
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  // Bumping this re-mounts the Turnstile widget (fresh challenge).
  const [turnstileRound, setTurnstileRound] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const honeypotRef = useRef<HTMLInputElement>(null)
  // The time-trap mirror timer — cleared on unmount so a stale timer
  // can't unlock a replaced form instance early.
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Reply target — null = plain top-level form; a comment id puts the
  // form into "reply to" mode (the next submit carries parentId).
  const [replyingTo, setReplyingTo] = useState<PublicComment | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const commentsEnabled = site.commentEnabled
  const turnstileConfigured = !!TURNSTILE_SITE_KEY

  function armSessionTimer() {
    if (armTimerRef.current) clearTimeout(armTimerRef.current)
    armTimerRef.current = setTimeout(
      () => setSessionReady(true),
      COMMENT_MIN_SUBMIT_DELAY_MS
    )
  }

  useEffect(() => {
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current)
    }
  }, [])

  const canSubmit =
    !!sessionToken &&
    sessionReady &&
    !sessionError &&
    content.trim().length >= 2 &&
    content.trim().length <= 1000 &&
    !!turnstileToken

  /** Fetch a fresh signed session token; null on any failure. */
  const fetchSession = useCallback(
    async (signal?: AbortSignal): Promise<string | null> => {
      try {
        const res = await fetch(
          `/api/comments/session?post=${encodeURIComponent(slug)}`,
          { signal }
        )
        if (!res.ok) return null
        const data = (await res.json()) as { token: string }
        return data.token
      } catch {
        return null
      }
    },
    [slug]
  )

  // Sequence guard for loadComments — the submit-path reload has no
  // AbortSignal (only the mount effect's controller covers its own
  // fetches), so without this a stale response could clobber a newer
  // load (e.g. after client-side navigation to another post). Each
  // call bumps the sequence; only the latest may write state.
  const { begin, isCurrent } = useStaleRequest()

  /** Load the comment list. `signal` lets a stale navigation abort; the
   *  list is cleared first so an old post's comments never linger under
   *  a new post's heading. */
  const loadComments = useCallback(
    async (signal?: AbortSignal) => {
      const seq = begin()
      // A post switch must not carry a reply target from the old post
      // into the new one (the API would reject it, but the stale chip
      // would linger until then).
      setReplyingTo(null)
      setComments([])
      setLoading(true)
      try {
        const res = await fetch(
          `/api/comments?post=${encodeURIComponent(slug)}`,
          { signal }
        )
        if (!res.ok) return
        if (!isCurrent(seq)) return // superseded by a newer load
        const data = (await res.json()) as { comments: PublicComment[] }
        setComments(data.comments)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        // Other failures keep the list empty — comments are progressive.
      } finally {
        if (isCurrent(seq)) setLoading(false)
      }
    },
    [slug, begin, isCurrent]
  )

  /** Re-fetch the session and re-arm the form — shown as a Retry
   *  button when the first attempt failed (sessionError is not a
   *  terminal state: transient cold-starts/deploys recover). */
  const retrySession = useCallback(async () => {
    const token = await fetchSession()
    if (token) {
      setSessionToken(token)
      setSessionError(false)
      setSessionReady(false)
      armSessionTimer()
    }
  }, [fetchSession])

  /** Enter reply mode for a root comment. Ignored while a submit is in
   *  flight: the success path clears the target, so a click during the
   *  POST would be silently wiped (and the next submit would post the
   *  text as a top-level comment). */
  function startReply(comment: PublicComment) {
    if (submitting) return
    setError(null)
    setReplyingTo(comment)
    // The form sits below the list — bring it into view so the visitor
    // sees where the reply lands.
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  /** Display order: roots chronologically, each followed by its replies
   *  (also chronological). #N counts across the whole list. */
  const orderedGroups = useMemo(() => {
    const repliesByParent = new Map<number, PublicComment[]>()
    for (const c of comments) {
      if (c.parentId == null) continue
      const list = repliesByParent.get(c.parentId) ?? []
      list.push(c)
      repliesByParent.set(c.parentId, list)
    }
    const groups: {
      root: PublicComment
      no: number
      replies: PublicComment[]
    }[] = []
    let no = 0
    for (const root of comments) {
      if (root.parentId != null) continue
      const replies = repliesByParent.get(root.id) ?? []
      groups.push({ root, no: ++no, replies })
      // Replies are numbered immediately after their root.
      no += replies.length
    }
    return groups
  }, [comments])

  // List + signed session in parallel on mount (and when the post slug
  // changes via client-side navigation). The controller aborts the
  // in-flight fetches on cleanup so a late response can't clobber the
  // next post's state. Skipped entirely on the static mirror (no API).
  useEffect(() => {
    if (STATIC_MIRROR) return
    const controller = new AbortController()
    let cancelled = false
    void loadComments(controller.signal) // eslint-disable-line react-hooks/set-state-in-effect -- async fetch, same pattern as admin/media
    ;(async () => {
      const token = await fetchSession(controller.signal)
      if (cancelled) return
      if (!token) {
        setSessionError(true)
        return
      }
      setSessionToken(token)
      setSessionError(false)
      // Time-trap mirror: the token can't be spent until it is
      // COMMENT_MIN_SUBMIT_DELAY_MS old.
      setSessionReady(false)
      armSessionTimer()
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/permalink-only: reloads fetch both fresh
  }, [slug])

  function resetTurnstile() {
    setTurnstileToken(null)
    setTurnstileRound((r) => r + 1)
  }

  async function onSubmit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postSlug: slug,
          parentId: replyingTo?.id ?? undefined,
          authorName: authorName.trim(),
          authorEmail: authorEmail.trim(),
          content: content.trim(),
          token: sessionToken,
          turnstileToken: turnstileToken ?? undefined,
          // Honeypot — hidden input; a bot filling it is silently dropped.
          website: honeypotRef.current?.value ?? "",
        }),
      })

      if (res.ok) {
        setAuthorName("")
        setAuthorEmail("")
        setContent("")
        setReplyingTo(null)
        resetTurnstile()
        // Re-mint the session: a fresh token keeps the time-trap honest
        // for the next comment. A failure here keeps the old token —
        // still valid until its TTL — so the form stays usable.
        const fresh = await fetchSession()
        if (fresh) {
          setSessionToken(fresh)
          setSessionReady(false)
          armSessionTimer()
        }
        // The 201 body carries the stored row (server-generated id,
        // Anonymous fallback name, createdAt) — append it locally
        // instead of re-fetching the whole list: no loading flash, no
        // re-render of every card. The list sorts by created_at ASC, so
        // appending is the correct position.
        const data = (await res.json().catch(() => null)) as {
          comment?: PublicComment
        } | null
        const newComment = data?.comment
        if (newComment) {
          setComments((prev) => [...prev, newComment])
        } else {
          // Response parsing should not fail on 201 — but if it ever
          // does, fall back to the full refetch so the list stays true.
          void loadComments()
        }
        return
      }

      // Any failed attempt gets a fresh Turnstile challenge: the widget
      // token may already be spent server-side (siteverify), and retrying
      // with a used token always fails.
      resetTurnstile()

      switch (res.status) {
        case 401: {
          // Session expired or mismatched — re-mint and let the visitor
          // resubmit instead of locking them out until a page refresh.
          const fresh = await fetchSession()
          if (fresh) {
            setSessionToken(fresh)
            setSessionError(false)
            setSessionReady(false)
            armSessionTimer()
            setError(t("post.commentErrorSessionExpired"))
          } else {
            setSessionError(true)
            setError(t("post.commentErrorServiceUnavailable"))
          }
          break
        }
        case 429:
          setError(t("post.commentErrorRateLimited"))
          break
        case 503:
          setError(t("post.commentErrorClosed"))
          break
        case 400: {
          // Server distinguishes the failure cause via a machine-
          // readable code; surface the matching message instead of
          // lumping verification/time-trap/content failures together.
          const data = (await res.json().catch(() => null)) as {
            code?: string
          } | null
          switch (data?.code) {
            case "verification_failed":
              setError(t("post.commentErrorVerify"))
              break
            case "too_soon":
              setError(t("post.commentErrorTooFast"))
              break
            case "invalid_parent":
              // The reply target vanished (e.g. an admin deleted it) —
              // drop the chip AND the draft so a retry can't silently
              // post the text as a top-level comment.
              setReplyingTo(null)
              setContent("")
              setError(t("post.commentErrorInvalidTarget"))
              break
            default:
              setError(t("post.commentErrorInvalid"))
          }
          break
        }
        default:
          setError(t("post.commentErrorFailed"))
      }
    } catch {
      setError(t("post.commentErrorFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="container mx-auto max-w-5xl px-4 py-12 2xl:max-w-7xl">
      <div className="rounded-2xl border bg-card p-6 md:p-8">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessageSquare size={18} />
          </span>
          <h2 className="text-xl font-bold">
            {t("post.commentsCount")(comments.length)}
          </h2>
        </div>

        {/* List — the static mirror (GitHub Pages) has no API routes,
            so comments are simply not available there. */}
        {STATIC_MIRROR ? (
          <p className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {t("post.commentMirrorUnavailable")}
          </p>
        ) : loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        ) : comments.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {t("post.commentEmpty")}
          </p>
        ) : (
          <ul className="space-y-4">
            {orderedGroups.map(({ root, no, replies }) => (
              <li key={root.id}>
                {/* Reply is only actionable when the form can render —
                    in the closed / unconfigured / session-error states
                    the button would arm a chip that can never appear. */}
                <CommentCard
                  comment={root}
                  no={no}
                  onReply={
                    commentsEnabled && turnstileConfigured && !sessionError
                      ? startReply
                      : undefined
                  }
                />
                {replies.map((reply, i) => (
                  <div
                    key={reply.id}
                    className="mt-1.5 ml-5 border-l-2 border-foreground/10 pl-4"
                  >
                    <CommentCard comment={reply} no={no + i + 1} />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}

        {/* Form — on the static mirror there is no API at all: the
            mirror notice above is the whole story, so render nothing
            here (the "not configured" notice would be false — comments
            ARE configured, just not on this host). */}
        {STATIC_MIRROR ? null : !commentsEnabled ? (
          <p className="mt-6 rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {t("post.commentClosed")}
          </p>
        ) : !turnstileConfigured ? (
          <p className="mt-6 rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {t("post.commentNotConfigured")}
          </p>
        ) : sessionError ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed bg-destructive/10 p-6 text-center text-sm text-destructive">
            <p>{t("post.commentErrorServiceUnavailable")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void retrySession()}
            >
              {t("post.commentRetry")}
            </Button>
          </div>
        ) : (
          <CommentForm
            formRef={formRef}
            honeypotRef={honeypotRef}
            replyingTo={replyingTo}
            onCancelReply={() => {
              // Cancel abandons the reply draft too — otherwise
              // the still-enabled submit button would silently
              // post the text as a top-level comment.
              setReplyingTo(null)
              setContent("")
            }}
            authorName={authorName}
            onAuthorNameChange={setAuthorName}
            authorEmail={authorEmail}
            onAuthorEmailChange={setAuthorEmail}
            content={content}
            onContentChange={setContent}
            turnstileRound={turnstileRound}
            onTurnstileSuccess={setTurnstileToken}
            onTurnstileError={() => setTurnstileToken(null)}
            onTurnstileExpire={resetTurnstile}
            canSubmit={canSubmit}
            submitting={submitting}
            error={error}
            onSubmit={() => void onSubmit()}
          />
        )}
      </div>
    </section>
  )
}
