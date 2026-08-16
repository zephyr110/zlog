"use client"

import type { RefObject } from "react"
import { useTheme } from "next-themes"
import { Turnstile } from "@marsidev/react-turnstile"
import { useT } from "@/components/layout/trans"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { displayName, type PublicComment } from "@/lib/comment-shared"

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export function CommentForm({
  formRef,
  honeypotRef,
  replyingTo,
  onCancelReply,
  authorName,
  onAuthorNameChange,
  authorEmail,
  onAuthorEmailChange,
  content,
  onContentChange,
  turnstileRound,
  onTurnstileSuccess,
  onTurnstileError,
  onTurnstileExpire,
  canSubmit,
  submitting,
  error,
  onSubmit,
}: {
  formRef: RefObject<HTMLFormElement | null>
  honeypotRef: RefObject<HTMLInputElement | null>
  replyingTo: PublicComment | null
  onCancelReply: () => void
  authorName: string
  onAuthorNameChange: (value: string) => void
  authorEmail: string
  onAuthorEmailChange: (value: string) => void
  content: string
  onContentChange: (value: string) => void
  turnstileRound: number
  onTurnstileSuccess: (token: string) => void
  onTurnstileError: () => void
  onTurnstileExpire: () => void
  canSubmit: boolean
  submitting: boolean
  error: string | null
  onSubmit: () => void
}) {
  const { t } = useT()
  const { resolvedTheme } = useTheme()

  return (
    <form
      ref={formRef}
      className="mt-8 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {replyingTo && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {t("post.commentReplyingTo")(
              displayName(replyingTo.authorName)
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={onCancelReply}
          >
            {t("post.commentCancelReply")}
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={authorName}
          onChange={(e) => onAuthorNameChange(e.target.value)}
          placeholder={t("post.commentAuthorPlaceholder")}
          maxLength={30}
          className="sm:max-w-40"
        />
        <Input
          value={authorEmail}
          onChange={(e) => onAuthorEmailChange(e.target.value)}
          placeholder={t("post.commentEmailPlaceholder")}
          type="email"
          maxLength={100}
          className="sm:max-w-56"
        />
      </div>
      <Textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder={t("post.commentContentPlaceholder")}
        maxLength={1000}
        rows={4}
        required
      />
      {/* Honeypot — invisible to humans, filled by bots. */}
      <input
        ref={honeypotRef}
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Turnstile
          key={turnstileRound}
          siteKey={TURNSTILE_SITE_KEY!}
          onSuccess={onTurnstileSuccess}
          // onError must NOT re-mount the widget: a persistent
          // failure (ad-blocker, unreachable CDN) would loop
          // mount→error→mount forever. Just drop the stale token;
          // onExpire (or a successful submit's reset) re-challenges.
          onError={onTurnstileError}
          onExpire={onTurnstileExpire}
          options={{
            theme:
              resolvedTheme === "dark"
                ? "dark"
                : resolvedTheme === "light"
                  ? "light"
                  : "auto",
          }}
        />
        <Button
          type="submit"
          disabled={!canSubmit || submitting}
          className="sm:ml-auto"
        >
          {submitting
            ? (t("post.commentSubmitting"))
            : (t("post.commentSubmit"))}
        </Button>
      </div>
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
