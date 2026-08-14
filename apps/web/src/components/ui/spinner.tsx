import { cn } from "@/lib/utils"

/**
 * Size scale (optical stroke weight scales with diameter):
 * - sm  14px — inline with text / inside buttons
 * - md  20px — block overlays, dialog panels (default)
 * - lg  28px — full-page / large empty content areas
 */
const sizeClass = {
  sm: "size-3.5 border-[1.5px]",
  md: "size-5 border-2",
  lg: "size-7 border-2",
} as const

type SpinnerSize = keyof typeof sizeClass

/**
 * Loading spinner. Pass `fill` for page/block loaders so it expands and
 * centers in the available space; omit `fill` for inline use next to text.
 * Color via `text-*` on className (ring uses currentColor).
 */
export function Spinner({
  className,
  size = "md",
  fill = false,
}: {
  className?: string
  size?: SpinnerSize
  /** Expand to fill the parent and center both axes. */
  fill?: boolean
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "flex items-center justify-center text-primary",
        fill ? "h-full min-h-0 w-full flex-1 self-stretch" : "shrink-0",
        className
      )}
    >
      <div
        className={cn(
          "animate-spin rounded-full border-current border-t-transparent",
          sizeClass[size]
        )}
      />
    </div>
  )
}
