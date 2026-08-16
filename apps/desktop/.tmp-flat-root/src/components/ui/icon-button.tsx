"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** sm = 8 (toolbars), md = 9 (navbars), lg = 10 (hero actions) */
  size?: "sm" | "md" | "lg"
  /** Adds a border (e.g. share buttons) */
  bordered?: boolean
}

/**
 * Unified icon-button style — replaces the repeated
 * "inline-flex items-center justify-center size-8/9 rounded-md hover:bg-muted"
 * class strings across the codebase.
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "md", bordered = false, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "size-8",
        size === "md" && "size-9",
        size === "lg" && "size-10",
        bordered && "border hover:bg-muted",
        className
      )}
      {...props}
    />
  )
)
IconButton.displayName = "IconButton"

export { IconButton }
