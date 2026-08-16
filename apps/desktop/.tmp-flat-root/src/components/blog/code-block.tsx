"use client"

import { useRef, type ComponentProps } from "react"
import { cn } from "@/lib/utils"
import { CopyButton } from "@/components/blog/copy-button"

interface CodeBlockProps extends ComponentProps<"pre"> {
  "data-language"?: string
}

export function CodeBlock({
  children,
  className,
  "data-language": dataLanguage,
  ...props
}: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null)

  const raw = (props as Record<string, unknown>)
  const title = typeof raw["data-title"] === "string" ? raw["data-title"] as string : undefined
  const lang = dataLanguage || undefined

  return (
    <div className="my-8 rounded-xl border border-border dark:border-zinc-800 overflow-hidden shadow-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/50 dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="flex items-center gap-2 min-w-0">
          {title ? (
            <span className="text-xs text-muted-foreground dark:text-zinc-400 font-medium truncate">
              {title}
            </span>
          ) : lang ? (
            <span className="inline-flex items-center rounded-md border border-border/60 dark:border-zinc-700 bg-muted dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground dark:text-zinc-400">
              {lang}
            </span>
          ) : null}
        </div>

        <CopyButton
          getText={() => preRef.current?.querySelector("code")?.textContent || ""}
        />
      </div>

      {/* Code content */}
      <div className="relative bg-zinc-50 dark:bg-zinc-950">
        <pre
          ref={preRef}
          className={cn(
            "code-block line-numbers overflow-x-auto p-4 text-sm leading-relaxed",
            className
          )}
          {...props}
        >
          {children}
        </pre>
      </div>
    </div>
  )
}
