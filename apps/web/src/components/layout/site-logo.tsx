"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { DEFAULT_SITE_LOGO, isBuiltinLogo, LOGO_DARK, LOGO_LIGHT } from "@/lib/site-config"

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
 * Site mark. Built-in assets follow the theme: light mark on a light
 * theme, the original dark mark when `.dark` is set. Custom uploads
 * can opt into a CSS invert via invertInDark.
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

  const builtin = isBuiltinLogo(src) || src === DEFAULT_SITE_LOGO
  // A stored logo URL can dangle — fall back to the built-in pair.
  const customBroken = !builtin && failed.has(src)
  const showBuiltin = builtin || customBroken
  const needsInvert =
    invertInDark &&
    !showBuiltin &&
    mounted &&
    resolvedTheme === "dark"

  function handleError(failedSrc: string) {
    setFailed((prev) => (prev.has(failedSrc) ? prev : new Set(prev).add(failedSrc)))
  }

  const markClass = cn(
    chip ? "size-full rounded-[inherit] object-cover" : "object-contain",
    !chip && className
  )
  const lightSrc = failed.has(LOGO_LIGHT) ? LOGO_DARK : LOGO_LIGHT
  const darkSrc = failed.has(LOGO_DARK) ? LOGO_LIGHT : LOGO_DARK

  const img = showBuiltin ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- local theme marks; keep in sync with the dark variant */}
      <img
        src={lightSrc}
        alt={alt}
        className={cn(markClass, "dark:hidden")}
        onError={() => handleError(lightSrc)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={darkSrc}
        alt=""
        className={cn(markClass, "hidden dark:block")}
        onError={() => handleError(darkSrc)}
      />
    </>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- remote/uploaded logos; avoid next/image domain config
    <img
      src={src}
      alt={alt}
      className={markClass}
      style={needsInvert ? { filter: "invert(1)" } : undefined}
      onError={() => handleError(src)}
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
