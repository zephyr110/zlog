"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Rss, UserRoundKey, LayoutDashboard } from "lucide-react"
import { GithubIcon, XIcon } from "@/components/ui/brand-icons"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { siteLogoSrc, defaultSiteConfig } from "@/lib/site-config"
import { SiteLogo } from "@/components/layout/site-logo"
import { useT } from "@/components/layout/trans"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getToken } from "@/lib/api-client"

const iconButtonClass =
  "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"

/**
 * Site footer — brand block + quick nav + icon actions, sitting on a
 * gradient that fades from the page background into the muted panel tone
 * (no hairline: the tonal zone itself marks the boundary). The admin entry
 * is a quiet icon button (lock when signed out, dashboard when signed in):
 * invisible to readers, always where the admin expects it.
 */
export function Footer() {
  const pathname = usePathname()
  const { t } = useT()
  const site = useSiteConfig()
  const logoSrc = siteLogoSrc(site)
  const githubUrl = site.social.github || defaultSiteConfig.social.github
  const [loggedIn, setLoggedIn] = useState(false)

  // The token lives in localStorage, so it can only be read after mount —
  // and re-read on navigation so login/logout elsewhere reflects here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; post-mount read avoids hydration mismatch
    setLoggedIn(!!getToken())
  }, [pathname])

  if (pathname?.startsWith("/admin")) return null

  return (
    <footer className="bg-gradient-to-b from-background via-muted/40 to-muted">
      <div className="container mx-auto max-w-5xl px-4 pb-8 pt-16 2xl:max-w-7xl">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* Brand */}
          <div className="flex max-w-xs flex-col gap-3">
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
            >
              <SiteLogo
                src={logoSrc}
                invertInDark={site.logoInvertInDark ?? true}
                className="size-6 rounded-md"
                chip
              />
              <span className="font-heading text-lg font-black tracking-tight">
                {site.name}
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
              {t("site.heroSubtitle")}
            </p>
            <p className="text-xs text-muted-foreground/70">
              © {new Date().getFullYear()} {site.name}
            </p>
          </div>

          <div className="flex flex-col gap-8 sm:flex-row sm:gap-16">
            {/* Quick nav */}
            <nav className="flex flex-col gap-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {t("site.navigate")}
              </p>
              <Link
                href="/"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("site.home")}
              </Link>
              <Link
                href="/archive"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("site.archive")}
              </Link>
              <Link
                href="/about"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("site.about")}
              </Link>
            </nav>

            {/* Icon actions */}
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {t("site.links")}
              </p>
              <div className="flex items-center gap-1">
                <FooterIconButton
                  href={githubUrl}
                  label="GitHub"
                  icon={<GithubIcon size={18} />}
                />
                {site.social.twitter ? (
                  <FooterIconButton
                    href={site.social.twitter}
                    label="Twitter"
                    icon={<XIcon size={18} />}
                  />
                ) : null}
                <FooterIconButton
                  href="/feed.xml"
                  label="RSS"
                  icon={<Rss size={18} />}
                />
                <FooterIconButton
                  href={loggedIn ? "/admin/dashboard" : "/admin/login"}
                  label={
                    loggedIn
                      ? (t("admin.dashboard"))
                      : (t("admin.signIn"))
                  }
                  icon={
                    loggedIn ? <LayoutDashboard size={18} /> : <UserRoundKey size={18} />
                  }
                  internal
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

/** Icon action wrapped in a tooltip — the four footer icons share this
 *  chrome. External links open in a new tab; `internal` renders a Next
 *  Link for client-side navigation. */
function FooterIconButton({
  href,
  label,
  icon,
  internal = false,
}: {
  href: string
  label: string
  icon: React.ReactNode
  internal?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          internal ? (
            <Link href={href} className={iconButtonClass} aria-label={label} />
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={iconButtonClass}
              aria-label={label}
            />
          )
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
