import * as React from "react"

import { cn } from "@/lib/utils"

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Extra vertical padding (default none) */
  size?: "none" | "sm" | "md" | "lg"
}

/**
 * Standard page container — unified width (max-w-5xl, wider on 2xl screens)
 * and horizontal padding across all pages.
 */
export function Container({
  className,
  size = "none",
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        "container mx-auto px-4 max-w-5xl 2xl:max-w-7xl",
        size === "sm" && "py-6",
        size === "md" && "py-12 md:py-16",
        size === "lg" && "py-16 md:py-20",
        className
      )}
      {...props}
    />
  )
}
