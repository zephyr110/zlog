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
import { ThemeCycleButton } from "@/components/layout/theme-toggle"
import { LanguageSwitcher } from "@/components/layout/language-switcher"
import { hasAdminSession } from "@/lib/api-client"

/**
 * Site footer — brand block + three link columns (navigate / links /
 * settings), sitting on a gradient that fades from the page background into
 * the muted panel tone. The admin entry sits in the links column as a quiet
 * row: sign-in when signed out, dashboard when signed in.
 */
export function Footer() {
  const pathname = usePathname()
  const { t } = useT()
  const site = useSiteConfig()
  const logoSrc = siteLogoSrc(site)
  const githubUrl = site.social.github || defaultSiteConfig.social.github
  const [loggedIn, setLoggedIn] = useState(false)

  // The session flag lives in localStorage (the JWT itself is in an
  // HttpOnly cookie JS can't read), so it can only be read after mount —
  // and re-read on navigation so login/logout elsewhere reflects here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; post-mount read avoids hydration mismatch
    setLoggedIn(hasAdminSession())
  }, [pathname])

  if (pathname?.startsWith("/admin")) return null

  return (
    <footer className="border-t bg-gradient-to-b from-background via-muted/40 to-muted">
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
                invertInDark={site.logoInvertInDark ?? false}
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

          <div className="flex flex-col gap-8 sm:flex-row sm:gap-12 lg:gap-16">
            {/* Quick nav */}
            <nav className="flex flex-col gap-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {t("site.navigate")}
              </p>
              <Link
                href="/"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {t("site.home")}
              </Link>
              <Link
                href="/archive"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {t("site.archive")}
              </Link>
              {site.projectsEnabled && (
                <Link
                  href="/projects"
                  className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {t("site.projects")}
                </Link>
              )}
              <Link
                href="/about"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {t("site.about")}
              </Link>
            </nav>

            {/* Links — labelled rows, stacked */}
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {t("site.links")}
              </p>
              <div className="flex flex-col gap-2.5">
                <FooterLink
                  href={githubUrl}
                  label="GitHub"
                  icon={<GithubIcon size={16} />}
                />
                {site.social.twitter ? (
                  <FooterLink
                    href={site.social.twitter}
                    label="Twitter"
                    icon={<XIcon size={16} />}
                  />
                ) : null}
                <FooterLink
                  href="/feed.xml"
                  label="RSS"
                  icon={<Rss size={16} />}
                />
                <FooterLink
                  href={loggedIn ? "/admin/dashboard" : "/admin/login"}
                  label={
                    loggedIn
                      ? (t("admin.dashboard"))
                      : (t("admin.signIn"))
                  }
                  icon={
                    loggedIn ? <LayoutDashboard size={16} /> : <UserRoundKey size={16} />
                  }
                  internal
                />
              </div>
            </div>

            {/* Display settings — icon-only stack, no column heading */}
            <div className="flex flex-col items-start gap-1">
              <ThemeCycleButton />
              <LanguageSwitcher variant="footer" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

/** Footer link row — icon + label, opening in a new tab unless internal. */
function FooterLink({
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
  const className =
    "inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-primary"

  return internal ? (
    <Link href={href} className={className}>
      {icon}
      {label}
    </Link>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {icon}
      {label}
    </a>
  )
}
