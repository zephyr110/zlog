"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useLocale } from "@/components/layout/i18n-provider"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { useT } from "@/components/layout/trans"
import { categoryMeta, type CategoryKey } from "@/lib/categories"
import type { TranslationPath, TranslationValueAt } from "@/lib/i18n"

type TranslateFn = <P extends TranslationPath>(path: P) => TranslationValueAt<P>

/** Exact pathname → i18n key for the page segment of `Brand | Page`. */
const TITLE_KEYS: Record<string, TranslationPath> = {
  "/archive": "archive.title",
  "/timeline": "timeline.title",
  "/about": "about.title",
  "/admin/login": "admin.loginTitle",
  "/admin/dashboard": "admin.dashboard",
  "/admin/posts": "admin.posts",
  "/admin/posts/new": "admin.newPost",
  "/admin/posts/edit": "admin.editPost",
  "/admin/media": "admin.media",
  "/admin/comments": "admin.commentsPage",
  "/admin/settings": "admin.settings",
}

function pageSegmentFromDocumentTitle(brand: string): string | null {
  const current = document.title.trim()
  if (!current || current === brand) return null

  const prefix = `${brand} | `
  if (current.startsWith(prefix)) {
    const rest = current.slice(prefix.length).trim()
    return rest && rest !== brand ? rest : null
  }

  const suffix = ` | ${brand}`
  if (current.endsWith(suffix)) {
    const rest = current.slice(0, -suffix.length).trim()
    return rest || null
  }

  return null
}

function pageTitleFromPath(
  pathname: string,
  t: TranslateFn,
  brand: string
): string | null | undefined {
  // `null` = use brand only (home). `undefined` = leave document.title alone.
  if (pathname === "/") return null

  const exact = TITLE_KEYS[pathname]
  if (exact) return t(exact) as string

  if (pathname.startsWith("/topics/")) {
    // /category/ URLs never reach the client — category/[name]/page.tsx
    // permanentRedirects to /topics/ before hydration (and next.config
    // redirects cover server responses), so no compat branch is needed.
    const name = pathname.slice("/topics/".length).split("/")[0]
    const meta = categoryMeta[name as CategoryKey]
    if (meta) return t(meta.i18nKey) as string
    return undefined
  }

  if (pathname.startsWith("/tags/")) {
    const raw = pathname.slice("/tags/".length).split("/")[0]
    let tag = raw
    try {
      tag = decodeURIComponent(raw)
    } catch {
      // keep raw segment if malformed
    }
    return t("site.postsTagged")(tag)
  }

  if (pathname.startsWith("/posts/")) {
    // Prefer the article heading once hydrated; never invent a title from a
    // stale prior route (that produced "Zlog | Zlog" / wrong page names).
    const heading = document
      .querySelector("article h1, main h1")
      ?.textContent?.trim()
    if (heading) return heading
    return pageSegmentFromDocumentTitle(brand) ?? undefined
  }

  return undefined
}

function applyDocumentTitle(
  pathname: string,
  t: TranslateFn,
  brand: string
): boolean {
  const page = pageTitleFromPath(pathname, t, brand)
  if (page === undefined) return false
  document.title = page === null ? brand : `${brand} | ${page}`
  return true
}

/**
 * Keeps `document.title` as `Brand | Page` in the active UI locale.
 * Needed because locale lives in localStorage and the site is statically
 * exported — server metadata alone can't follow language switches.
 */
export function DocumentTitle() {
  const pathname = usePathname()
  const { locale } = useLocale()
  const site = useSiteConfig()
  const { t } = useT()

  useEffect(() => {
    const brand = site.title
    applyDocumentTitle(pathname, t, brand)

    // Post pages: h1 / Next metadata may arrive just after this effect.
    if (!pathname.startsWith("/posts/")) return

    let cancelled = false
    const retry = () => {
      if (cancelled) return
      applyDocumentTitle(pathname, t, brand)
    }
    const raf = requestAnimationFrame(retry)
    const timer = window.setTimeout(retry, 50)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
    // `t` is recreated each render; locale is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync title to locale/route
  }, [pathname, locale, site.title])

  return null
}
