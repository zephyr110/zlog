"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { DEFAULT_SITE_LOGO } from "@/lib/site-config"

type SiteLogoProps = {
  src: string
  /**
   * Invert black↔white in dark mode. Off for the shipped colorful
   * mark; custom uploads honor the site-settings toggle.
   */
  invertInDark?: boolean
  /**
   * Non-chip mode: sizes/styles the mark itself (object-contain base).
   * Chip mode: sizes the tile — the mark fills it edge-to-edge, so pass
   * a square size (e.g. size-9); without one the tile has no intrinsic
   * size and collapses.
   */
  className?: string
  alt?: string
  /**
   * Render the mark inside an opaque tile (muted background + hairline
   * ring) that stands off any page background. The mark fills the tile
   * edge-to-edge and inherits the tile's corner radius (rounded-[inherit]),
   * so it reads as rounded in both themes — an opaque square PNG gets
   * rounded corners, and a rounded/transparent PNG shows the muted tile
   * behind its corners instead of bleeding the page background through
   * (e.g. black corner triangles on a dark footer). Pass a rounded-*
   * in className to set the radius for both tile and mark.
   */
  chip?: boolean
}

/**
 * Site mark. The shipped colorful PNG is never inverted. Custom
 * uploads can opt into a CSS invert via invertInDark. Theme comes
 * from next-themes `resolvedTheme` rather than `dark:` variants.
 */
export function SiteLogo({
  src,
  invertInDark = false,
  className,
  alt = "",
  chip = false,
}: SiteLogoProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    setMounted(true) // eslint-disable-line react-hooks/set-state-in-effect -- theme is only known client-side
  }, [])

  // A stored logo URL can dangle (e.g. the file was deleted from the media
  // library, which removes it from the CDN but can't clear settings) —
  // fall back to the built-in mark instead of showing a broken image.
  // A URL that ever failed is never retried (a failed-set, not a latch):
  // the old code flip-flopped src → fallback → src once the fallback also
  // failed, re-firing img onError on every render; and a latch that pins
  // the fallback for good would ignore a NEW src after one built-in hiccup
  // (e.g. an admin re-uploading a logo). The machine always settles:
  // renderedSrc only changes when an error adds a URL to the set.
  const effectiveSrc = failed.has(src) ? DEFAULT_SITE_LOGO : src
  // Invert only the requested custom mark — never the colorful fallback.
  const needsInvert =
    invertInDark &&
    effectiveSrc !== DEFAULT_SITE_LOGO &&
    mounted &&
    resolvedTheme === "dark"

  function handleError() {
    setFailed((prev) => new Set(prev).add(effectiveSrc))
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- remote/uploaded logos; avoid next/image domain config
    <img
      src={effectiveSrc}
      alt={alt}
      className={cn(
        chip ? "size-full rounded-[inherit] object-cover" : "object-contain",
        !chip && className
      )}
      style={needsInvert ? { filter: "invert(1)" } : undefined}
      onError={handleError}
    />
  )

  if (!chip) return img

  // The tile IS the logo display — the mark fills it edge-to-edge with no
  // padding (a padded tile leaves gaps around small uploaded images), and
  // transparent mark corners show the muted tile behind them — never the
  // page background (the black-triangle fix).
  return (
    <div
      className={cn(
        // Soft tile — avoid a heavy shadow/ring that makes the mark
        // dominate short wordmarks in the navbar lockup.
        "shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border/50 dark:ring-white/10",
        className
      )}
    >
      {img}
    </div>
  )
}
