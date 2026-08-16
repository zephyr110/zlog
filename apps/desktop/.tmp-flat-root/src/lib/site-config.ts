export type SiteConfig = {
  name: string
  title: string
  description: string
  author: {
    name: string
    avatar: string
  }
  /** Canonical public URL — from NEXT_PUBLIC_SITE_URL only (not editable in settings). */
  siteUrl: string
  ogImage: string
  /** Uploaded site logo URL; empty means use the built-in mark. */
  logoUrl: string
  /** Invert logo colors in dark mode (for monochrome marks). */
  logoInvertInDark: boolean
  social: {
    github: string
    twitter: string
  }
  /** Guest comments master switch (settings, DB-backed). */
  commentEnabled: boolean
}

/**
 * Resolve the canonical public URL, most-explicit wins.
 *
 * - NEXT_PUBLIC_SITE_URL — the real override. A value left at the
 *   localhost placeholder (the .env.local.example default, which also
 *   got copied into the Vercel project env and made the feed/meta
 *   render 399 localhost URLs) is treated as unset.
 * - VERCEL_URL — injected by every Vercel build (production →
 *   zephyr110.vercel.app, previews a random hash).
 * - Production final fallback — the site's real domain, so a production
 *   build NEVER renders localhost URLs, no matter what the env holds.
 * - Local dev — localhost.
 *
 * GitHub Actions (deploy.yml) sets NEXT_PUBLIC_SITE_URL explicitly, so
 * the Pages mirror resolves via the first branch.
 */
function resolveSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL
  const explicit = envUrl && envUrl !== "http://localhost:3000" ? envUrl : ""
  const vercel = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : ""
  // Trailing slash stripped so URL concatenation (ogImageUrl, feeds)
  // never produces double slashes regardless of the env value.
  return (
    explicit ||
    vercel ||
    (process.env.NODE_ENV === "production"
      ? "https://zephyr110.vercel.app"
      : "http://localhost:3000")
  ).replace(/\/+$/, "")
}

/** Compile-time / fallback defaults when DB has no row yet. */
export const defaultSiteConfig: SiteConfig = {
  name: "Zlog",
  title: "Zlog",
  description: "A personal blog about technology, programming, and more.",
  author: {
    name: "Admin",
    avatar: "/images/avatar.jpg",
  },
  siteUrl: resolveSiteUrl(),
  ogImage: process.env.NEXT_PUBLIC_OG_IMAGE || "/images/og-default.jpg",
  logoUrl: "",
  logoInvertInDark: false,
  social: {
    github: "https://github.com/zephyr110/zlog",
    twitter: "https://twitter.com",
  },
  commentEnabled: true,
}

export const DEFAULT_SITE_LOGO = "/zlog-logo.png"
/** Built-in favicon — same colorful mark as the navbar. */
export const DEFAULT_FAVICON = "/zlog-logo.png"

export function siteLogoSrc(config: Pick<SiteConfig, "logoUrl">): string {
  return config.logoUrl || DEFAULT_SITE_LOGO
}
