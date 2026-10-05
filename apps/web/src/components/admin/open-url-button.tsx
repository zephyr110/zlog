"use client"

import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

/** Only allow opening http(s) URLs typed in the form — empty/invalid stay inert. */
export function externalHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.href
  } catch {
    return null
  }
}

export function OpenUrlButton({ href, label }: { href: string | null; label: string }) {
  // Match Input height (h-8) so the trailing action sits on the same row.
  const className = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    href ? "hover:bg-muted hover:text-foreground" : "opacity-50"
  )

  if (!href) {
    return (
      <span className={className} aria-hidden="true">
        <ExternalLink size={14} />
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={className}
    >
      <ExternalLink size={14} />
    </a>
  )
}
