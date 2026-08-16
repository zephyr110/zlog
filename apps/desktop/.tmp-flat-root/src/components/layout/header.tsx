"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { LanguageSwitcher } from "@/components/layout/language-switcher"
import { IconButton } from "@/components/ui/icon-button"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { siteLogoSrc, defaultSiteConfig } from "@/lib/site-config"
import { SiteLogo } from "@/components/layout/site-logo"
import { useT } from "@/components/layout/trans"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Menu, X, ChevronDown } from "lucide-react"
import { GithubIcon } from "@/components/ui/brand-icons"
import { categoryMeta } from "@/lib/categories"
import { SearchInput } from "@/components/layout/search-input"
import { MobileNav } from "@/components/layout/mobile-nav"
import type { NavCategory } from "@/lib/nav-links"

export function Header({ categories }: { categories: NavCategory[] }) {
  const { t } = useT()
  const site = useSiteConfig()
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileTopicsOpen, setMobileTopicsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const logoSrc = siteLogoSrc(site)
  const githubUrl = site.social.github || defaultSiteConfig.social.github

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [mobileOpen])

  if (pathname?.startsWith("/admin")) return null

  const atHome = pathname === "/"
  const atAbout = pathname === "/about"
  const atTopics = pathname?.startsWith("/topics/")

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-all duration-300",
          scrolled
            ? "border-b border-border/40 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75"
            : "border-transparent bg-background"
        )}
      >
        <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4 md:h-16">
          {/* Brand lockup — sized like lucide.dev nav (36px mark, 21px name). */}
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
          >
            <SiteLogo
              src={logoSrc}
              invertInDark={site.logoInvertInDark ?? false}
              className="size-9 rounded-md"
              chip
            />
            <span className="hidden text-[21px] font-semibold leading-6 text-foreground sm:inline">
              {site.name}
            </span>
          </Link>

          {/* Nav + tools — links first, then a quieter tool cluster */}
          <div className="flex items-center gap-0.5">

            {/* 首页 */}
            <NavLink href="/" active={atHome}>
              {t("site.home")}
            </NavLink>

            {/* Topics dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "relative hidden cursor-pointer items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium outline-none transition-all duration-200 md:flex",
                  atTopics
                    ? "bg-muted/60 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <span>{t("site.topics")}</span>
                <ChevronDown aria-hidden className="size-3.5 opacity-45" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={12} className="w-64 p-2">
                {categories.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                    {t("site.noTopics")}
                  </p>
                ) : (
                  categories.map((cat) => {
                    const meta = categoryMeta[cat.key as keyof typeof categoryMeta]
                    if (!meta) return null
                    const Icon = meta.icon
                    const active = pathname === `/topics/${encodeURIComponent(cat.key)}`
                    return (
                      <DropdownMenuItem
                        key={cat.key}
                        onClick={() => router.push(`/topics/${encodeURIComponent(cat.key)}`)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                          active && "bg-primary/5"
                        )}
                      >
                        <div className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "text-sm font-medium",
                              active ? "text-primary" : "text-foreground"
                            )}>
                              {t(meta.i18nKey) as string}
                            </span>
                            <span className="text-[11px] text-muted-foreground/60 tabular-nums font-mono">
                              {cat.count}
                            </span>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    )
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 归档 */}
            <NavLink href="/archive" active={pathname === "/archive"}>
              {t("site.archive")}
            </NavLink>

            {/* 关于 */}
            <NavLink href="/about" active={atAbout}>
              {t("site.about")}
            </NavLink>

            {/* Soft divider between navigation and utility tools */}
            <span
              className="mx-1.5 hidden h-3.5 w-px bg-border/70 md:block"
              aria-hidden="true"
            />

            {/* Tools — search + icon controls */}
            <SearchInput />
            <ThemeToggle />
            <LanguageSwitcher />

            {/* GitHub — hidden on small screens; footer / mobile nav cover it */}
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:inline-flex"
              aria-label="GitHub"
            >
              <GithubIcon size={17} />
            </a>

            {/* Mobile menu toggle */}
            <IconButton
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </IconButton>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      {mobileOpen && (
        <MobileNav
          categories={categories}
          topicsOpen={mobileTopicsOpen}
          onTopicsToggle={() => setMobileTopicsOpen((v) => !v)}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </>
  )
}

/** Nav link — weight aligned with the brand wordmark; quiet active state. */
function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative hidden items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-all duration-200 md:flex",
        active
          ? "bg-muted/60 text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-2.5 -bottom-px h-px rounded-full bg-foreground/50" />
      )}
    </Link>
  )
}
