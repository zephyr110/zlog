"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useT } from "@/components/layout/trans"
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard"

interface CopyButtonProps {
  /** Direct text to copy. When provided, the "copied" state is bound to
   *  it: if the content changes underneath (e.g. a live editor preview),
   *  the success state is dropped instead of asserting a stale copy. */
  text?: string
  /** Alternative: read the text at click time (e.g. from a DOM node). */
  getText?: () => string
}

/** Ghost copy button with a transient "Copied" state — shared by the
 *  CodeBlock and Mermaid header bars so copy feedback stays identical.
 *  The accessible name follows the visible state (copying feedback is
 *  announced to screen readers). */
export function CopyButton({ text, getText }: CopyButtonProps) {
  const { t } = useT()
  const { copied, copy } = useCopyToClipboard()
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  async function handleCopy() {
    const content = getText ? getText() : text
    if (!content) return
    if (await copy(content)) {
      if (text !== undefined) {
        if (resetTimer.current) clearTimeout(resetTimer.current)
        setCopiedText(content)
        resetTimer.current = setTimeout(() => setCopiedText(null), 2000)
      }
    }
  }

  // When `text` is provided, the "copied" state only holds while the
  // copied content is still what the button would copy.
  const shownCopied =
    text !== undefined && copiedText !== null
      ? copied && copiedText === text
      : copied

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void handleCopy()}
      aria-label={
        (shownCopied ? t("post.codeCopied") : t("post.copyCode")) as string
      }
      className={cn(
        "h-7 px-2 rounded-md text-xs gap-1.5 -mr-1 transition-all",
        shownCopied
          ? "text-emerald-600 dark:text-emerald-400 opacity-100 hover:text-emerald-500 dark:hover:text-emerald-300 hover:bg-emerald-500/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
      )}
    >
      {shownCopied ? (
        <>
          <Check size={13} />
          {t("post.codeCopied")}
        </>
      ) : (
        <>
          <Copy size={13} />
          {t("post.copyCode")}
        </>
      )}
    </Button>
  )
}
