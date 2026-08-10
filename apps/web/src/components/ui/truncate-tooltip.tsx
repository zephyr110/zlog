"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Ellipsis-truncates a string; when (and only when) it actually overflows
 * its box, the full text is available via tooltip (default) or the native
 * `title` attribute (`nativeTitle`) — use the latter inside buttons/links
 * so we never nest a focusable TooltipTrigger in another control.
 */
export function TruncateTooltip({
  children,
  className,
  side = "top",
  delay = 400,
  nativeTitle = false,
}: {
  children: string
  className?: string
  side?: "top" | "bottom" | "left" | "right"
  delay?: number
  /** Prefer native `title` instead of a Tooltip portal (safe inside buttons). */
  nativeTitle?: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // +1 slack avoids subpixel false positives on fractional layouts.
    setTruncated(el.scrollWidth > el.clientWidth + 1)
  }, [])

  useLayoutEffect(() => {
    measure()
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, children])

  if (nativeTitle) {
    return (
      <span
        ref={ref}
        className={cn("min-w-0 truncate", className)}
        title={truncated ? children : undefined}
      >
        {children}
      </span>
    )
  }

  return (
    <Tooltip disabled={!truncated}>
      <TooltipTrigger
        delay={delay}
        render={
          <span ref={ref} className={cn("min-w-0 truncate", className)}>
            {children}
          </span>
        }
      />
      <TooltipContent
        side={side}
        className="max-w-[min(90vw,20rem)] break-all"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
