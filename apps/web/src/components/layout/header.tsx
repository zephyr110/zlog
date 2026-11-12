"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { IconButton } from "@/components/ui/icon-button"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { siteLogoSrc } from "@/lib/site-config"
import { SiteLogo } from "@/components/layout/site-logo"
import { useT } from "@/components/layout/trans"
import { NavigationMenu } from "@base-ui/react/navigation-menu"
import { Menu, X, ChevronDown } from "lucide-react"
import { categoryMeta } from "@/lib/categories"
import { SearchInput } from "@/components/layout/search-input"
import { MobileNav } from "@/components/layout/mobile-nav"
import type { NavCategory } from "@/lib/nav-links"

export function Header({ categories }: { categories: NavCategory[] }) {
  const { t } = useT()
  const site = useSiteConfig()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileTopicsOpen, setMobileTopicsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const logoSrc = siteLogoSrc(site)

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
      {/* Floating navbar: the outer bar keeps a constant height (it is
          sticky, so changing it would shift the whole document); once the
          page scrolls, the full-width backing fades out and the inner pill
          contracts onto the page container with a glass layer. */}
      <header
        className={cn(
          "sticky top-0 z-50 flex h-[var(--header-h)] w-full items-center px-3 transition-colors duration-300 md:px-4",
          scrolled ? "bg-transparent" : "bg-background"
        )}
      >
        <div
          className={cn(
            "relative mx-auto flex h-12 w-full items-center justify-between gap-3 rounded-full border px-2.5 transition-[max-width,background-color,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none md:h-14 md:px-3",
            scrolled
              ? "max-w-5xl border-border/60 bg-background/80 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 2xl:max-w-7xl"
              : "max-w-6xl border-transparent bg-transparent 2xl:max-w-[88rem]"
          )}
        >
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

            {/* Topics dropdown — NavigationMenu owns hover, click, focus
                and the pointer gap, so hovering never steals focus from the
                search box. */}
            <NavigationMenu.Root
              delay={100}
              closeDelay={160}
              className="hidden md:block"
            >
              <NavigationMenu.List className="flex items-center">
                <NavigationMenu.Item>
                  <NavigationMenu.Trigger
                    className={cn(
                      "group relative flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium outline-none transition-all duration-200",
                      atTopics
                        ? "bg-muted/60 text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <span>{t("site.topics")}</span>
                    <ChevronDown
                      aria-hidden
                      className="size-3.5 opacity-45 transition-transform duration-200 group-data-[popup-open]:rotate-180"
                    />
                  </NavigationMenu.Trigger>
                  <NavigationMenu.Content>
                    <div className="flex flex-col gap-0.5">
                      {categories.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                          {t("site.noTopics")}
                        </p>
                      ) : (
                        categories.map((cat) => {
                          const meta = categoryMeta[cat.key as keyof typeof categoryMeta]
                          if (!meta) return null
                          const Icon = meta.icon
                          const active = pathname === `/topics/${encodeURIComponent(cat.key)}`
                          return (
                            <NavigationMenu.Link
                              key={cat.key}
                              active={active}
                              closeOnClick
                              render={<Link href={`/topics/${encodeURIComponent(cat.key)}`} />}
                              className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors hover:bg-muted focus:bg-muted",
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
                            </NavigationMenu.Link>
                          )
                        })
                      )}
                    </div>
                  </NavigationMenu.Content>
                </NavigationMenu.Item>
              </NavigationMenu.List>
              <NavigationMenu.Portal>
                <NavigationMenu.Positioner align="start" sideOffset={12} className="z-50">
                  <NavigationMenu.Popup className="w-64 rounded-lg bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <NavigationMenu.Viewport className="w-full" />
                  </NavigationMenu.Popup>
                </NavigationMenu.Positioner>
              </NavigationMenu.Portal>
            </NavigationMenu.Root>

            {/* 归档 */}
            <NavLink href="/archive" active={pathname === "/archive"}>
              {t("site.archive")}
            </NavLink>

            {/* 项目（总开关控制入口） */}
            {site.projectsEnabled && (
              <NavLink href="/projects" active={pathname === "/projects"}>
                {t("site.projects")}
              </NavLink>
            )}

            {/* 关于 */}
            <NavLink href="/about" active={atAbout}>
              {t("site.about")}
            </NavLink>

            {/* Utility — search stays last at the far right; theme and
                language live in the footer and mobile menu. */}
            <SearchInput />

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
