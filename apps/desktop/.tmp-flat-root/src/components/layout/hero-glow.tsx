import { cn } from "@/lib/utils"

/**
 * Shared page-header glow: a flat elliptical wash centered on the top
 * edge (same recipe as the admin login spotlight). Theme color comes from
 * `--login-glow` (amber on light, white on dark). `className` tweaks the
 * wash box (height / opacity), not a floating blob.
 */
export function HeroGlow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 h-40 opacity-[0.16] md:h-48 dark:opacity-20",
        className
      )}
      style={{
        background:
          "radial-gradient(ellipse 72% 100% at 50% 0%, var(--login-glow) 0%, transparent 70%)",
      }}
    />
  )
}
