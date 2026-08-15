"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { clearToken } from "@/lib/api-client"
import { useCommentUnread } from "@/components/admin/comment-unread"
import { SettingsDialog } from "@/components/admin/settings-dialog"
import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/icon-button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { siteLogoSrc } from "@/lib/site-config"
import { SiteLogo } from "@/components/layout/site-logo"
import { useLocale } from "@/components/layout/i18n-provider"
import { useT } from "@/components/layout/trans"
import { localeLabels, locales, type TranslationPath } from "@/lib/i18n"
import { type AuthUser } from "@zlog/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  FileText,
  Image,
  ExternalLink,
  Settings,
  LogOut,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  PanelLeft,
  SquarePen,
  MessageSquare,
  type LucideIcon,
} from "lucide-react"

const sidebarLinks: {
  href: string
  i18nKey: TranslationPath
  icon: LucideIcon
}[] = [
  { href: "/admin/dashboard", i18nKey: "admin.dashboard", icon: LayoutDashboard },
  { href: "/admin/posts", i18nKey: "admin.posts", icon: FileText },
  { href: "/admin/comments", i18nKey: "admin.comments", icon: MessageSquare },
  { href: "/admin/media", i18nKey: "admin.media", icon: Image },
]

type ThemeMode = "light" | "dark" | "system"

interface AdminSidebarProps {
  collapsed: boolean
  onToggle: () => void
  user: AuthUser
  mobileOpen: boolean
  onMobileClose: () => void
}

export function AdminSidebar({ collapsed, onToggle, user, mobileOpen, onMobileClose }: AdminSidebarProps) {
  const { t } = useT()
  const site = useSiteConfig()
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()

  const currentTheme = (theme as ThemeMode) || "system"
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  const logoSrc = siteLogoSrc(site)
  const { unread: unreadComments } = useCommentUnread()

  // The avatar menu flies out to the right of the rail on desktop, but the
  // mobile drawer is too narrow for a side flyout — open above the trigger.
  // SSR/first paint defaults to desktop placement; the menu isn't open yet.
  const isMobile = useMediaQuery("(max-width: 767px)")

  function handleLogout() {
    clearToken()
    router.push("/admin/login")
    router.refresh()
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault()
        onToggle()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onToggle])

  // Mobile drawer: move focus in on open, restore to the header trigger on
  // close. Desktop rail is not a dialog — skip.
  useEffect(() => {
    if (!mobileOpen) return
    const trigger = document.querySelector<HTMLElement>(
      "[data-admin-sidebar-trigger]"
    )
    const root = asideRef.current
    const toFocus =
      root?.querySelector<HTMLElement>("a[href], button:not([disabled])") ??
      root
    toFocus?.focus()
    return () => {
      trigger?.focus()
    }
  }, [mobileOpen])

  return (
    <>
    {/* Mobile drawer backdrop — sits above the sticky header (z-30), below
        the aside (z-50). Always mounted so the fade animates both ways.
        While the avatar menu is open it stays visible but inert, so a tap
        on the dimmed area dismisses only the menu, not the drawer too. */}
    <div
      aria-hidden="true"
      onClick={onMobileClose}
      className={cn(
        "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 md:hidden",
        mobileOpen
          ? cn("opacity-100", avatarMenuOpen && "pointer-events-none")
          : "pointer-events-none opacity-0"
      )}
    />
    <aside
      ref={asideRef}
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen ? true : undefined}
      aria-label={mobileOpen ? (t("admin.menu") as string) : undefined}
      className={cn(
        // Below md: off-canvas overlay drawer (always full width, the layout
        // passes collapsed=false while open). md+: fixed rail that collapses.
        // invisible when closed keeps the off-canvas drawer out of the a11y
        // tree and hit-testing; transition-all flips it at transition end.
        "fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "md:w-[4.5rem]" : "md:w-64",
        mobileOpen
          ? "max-md:visible max-md:translate-x-0"
          : "max-md:invisible max-md:-translate-x-full"
      )}
    >
      {/* Logo — matches admin header height (h-14) */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center transition-all",
          collapsed ? "justify-center px-2" : "px-3"
        )}
      >
        <Link
          href="/admin/dashboard"
          onClick={onMobileClose}
          className="flex min-w-0 items-center gap-2"
        >
          <SiteLogo
            src={logoSrc}
            invertInDark={site.logoInvertInDark ?? false}
            className="size-9 shrink-0 rounded-md"
            chip
          />
          {!collapsed && (
            <span className="truncate text-[21px] font-semibold leading-6">
              {site.name}
            </span>
          )}
        </Link>
      </div>

      {/* Primary action — expanded: solid CTA + view-site. Collapsed: New
          Post matches View Blog (ghost icon, no primary fill). */}
      <div
        className={cn(
          "shrink-0",
          collapsed
            ? "mb-1 flex flex-col items-center gap-2 border-b border-sidebar-border px-2 pb-3"
            : "px-3 pb-4 pt-1"
        )}
      >
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/admin/posts/new"
                    onClick={onMobileClose}
                    aria-label={t("admin.newPost")}
                    className="flex size-9 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <SquarePen size={16} />
                  </Link>
                }
              />
              <TooltipContent side="right" sideOffset={8}>
                {t("admin.newPost")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/"
                    target="_blank"
                    onClick={onMobileClose}
                    aria-label={t("admin.viewBlog")}
                    className="flex size-9 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <ExternalLink size={16} />
                  </Link>
                }
              />
              <TooltipContent side="right" sideOffset={8}>
                {t("admin.viewBlog")}
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <Link
              href="/admin/posts/new"
              onClick={onMobileClose}
              className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <SquarePen size={16} />
              <span className="truncate">{t("admin.newPost")}</span>
            </Link>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/"
                    target="_blank"
                    onClick={onMobileClose}
                    aria-label={t("admin.viewBlog")}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-sidebar-border text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <ExternalLink size={16} />
                  </Link>
                }
              />
              <TooltipContent side="bottom" sideOffset={6}>
                {t("admin.viewBlog")}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-y-auto",
          collapsed ? "gap-2 px-2 py-2" : "gap-2 px-3 py-1"
        )}
      >
        {!collapsed && (
          <p className="mb-1 px-2.5 text-xs font-medium tracking-wide text-sidebar-foreground/55">
            {t("admin.menu")}
          </p>
        )}
        <nav className="flex flex-col gap-1.5">
        {sidebarLinks.map((link) => {
          const Icon = link.icon
          const isActive =
            pathname === link.href ||
            (link.href !== "/admin/dashboard" && pathname?.startsWith(link.href))

          const isCommentsLink = link.href === "/admin/comments"
          const linkEl = (
            <Link
              key={link.href}
              href={link.href}
              onClick={onMobileClose}
              aria-current={isActive ? "page" : undefined}
              aria-label={collapsed ? (t(link.i18nKey) as string) : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm transition-colors",
                collapsed
                  ? "h-9 justify-center px-0"
                  : "h-9 gap-2.5 px-2.5",
                isActive
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <span className={cn("relative", collapsed && "shrink-0")}>
                <Icon size={16} className="shrink-0" />
                {/* Unread badge — collapsed mode shows a dot, expanded a
                    count pill, both only while there's something new. */}
                {isCommentsLink && unreadComments > 0 && collapsed && (
                  <span className="absolute -right-1 -top-1 size-2 rounded-full bg-destructive ring-2 ring-sidebar" />
                )}
              </span>
              {!collapsed && (
                <span className="truncate">{t(link.i18nKey) as string}</span>
              )}
              {isCommentsLink && unreadComments > 0 && !collapsed && (
                <Badge
                  variant="destructive"
                  className="ml-auto tabular-nums bg-destructive text-white [a]:hover:bg-destructive"
                >
                  {unreadComments > 99 ? "99+" : unreadComments}
                </Badge>
              )}
            </Link>
          )
          // Collapsed sidebar: show the label as a tooltip instead of a
          // native title attribute. `render` makes the trigger BE the link —
          // a default <button> wrapper is inline-block and shrink-wraps the
          // anchor, squeezing the icons onto one line (and nests a link
          // inside a button, which is invalid HTML).
          return collapsed ? (
            <Tooltip key={link.href}>
              <TooltipTrigger render={linkEl} />
              <TooltipContent side="right" sideOffset={8}>
                {t(link.i18nKey) as string}
              </TooltipContent>
            </Tooltip>
          ) : (
            linkEl
          )
        })}
        </nav>
      </div>

      {/* Footer — user menu trigger */}
      <div className={cn("shrink-0", collapsed ? "p-2" : "p-3 pt-2")}>
        <DropdownMenu onOpenChange={setAvatarMenuOpen}>
          <DropdownMenuTrigger
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-lg outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed ? "justify-center p-1.5" : "px-2.5 py-2"
            )}
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                A
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                {/* Just the username — the author name and role badge live
                    in the menu, where there is room for them. */}
                <div className="min-w-0 flex-1 text-left leading-tight">
                  <p className="truncate text-sm font-medium">{user.username}</p>
                </div>
                <ChevronRight
                  size={14}
                  className="shrink-0 text-sidebar-foreground/70 transition-transform duration-200 group-data-[state=open]:rotate-90"
                />
              </>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align={isMobile ? "center" : "start"}
            side={isMobile ? "top" : "right"}
            sideOffset={8}
            className="w-64 p-2"
          >
            {/* User info card */}
            <div className="rounded-lg bg-muted/50 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback className="bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                    A
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 leading-snug">
                  <p className="text-sm font-semibold truncate">{user.username}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{site.author.name}</p>
                </div>
              </div>
            </div>

            <DropdownMenuSeparator className="mx-0 my-2" />

            {/* Appearance + language — shared horizontal inset, even vertical rhythm */}
            <div className="flex flex-col gap-3 px-0.5">
              <div className="flex flex-col gap-1.5">
                <p className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admin.theme")}
                </p>
                <div className="inline-flex w-full rounded-lg bg-muted/50 p-1">
                  {([
                    ["light", Sun],
                    ["dark", Moon],
                    ["system", Monitor],
                  ] as const).map(([mode, Icon]) => (
                    <button
                      key={mode}
                      onClick={() => setTheme(mode)}
                      aria-label={
                        mode === "light"
                          ? (t("admin.light"))
                          : mode === "dark"
                            ? (t("admin.dark"))
                            : (t("admin.system"))
                      }
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all duration-200",
                        currentTheme === mode
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon size={14} />
                      <span className="hidden sm:inline">
                        {mode === "light"
                          ? (t("admin.light"))
                          : mode === "dark"
                            ? (t("admin.dark"))
                            : (t("admin.system"))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admin.language")}
                </p>
                <div className="inline-flex w-full rounded-lg bg-muted/50 p-1">
                  {locales.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLocale(l)}
                      className={cn(
                        "flex-1 rounded-md py-1.5 text-xs font-medium transition-all duration-200",
                        locale === l
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {localeLabels[l]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DropdownMenuSeparator className="mx-0 my-2" />

            <div className="flex flex-col gap-0.5">
              <DropdownMenuItem
                onClick={() => setSettingsOpen(true)}
                className="cursor-pointer gap-2.5 rounded-md px-2.5 py-2"
              >
                <Settings size={16} className="shrink-0 opacity-60" />
                <span>{t("admin.settings")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer gap-2.5 rounded-md px-2.5 py-2 text-destructive focus:text-destructive"
              >
                <LogOut size={16} className="shrink-0 opacity-60" />
                <span>{t("admin.logout")}</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
    </>
  )
}

/**
 * Sidebar collapse trigger, shadcn dashboard-01 style — a PanelLeft icon
 * button that lives in the admin top header, to the left of the page title.
 */
export function AdminSidebarTrigger({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const { t } = useT()
  const label = collapsed
    ? (t("admin.expand"))
    : (t("admin.collapse"))
  // Detect platform client-side only — SSR always renders "Ctrl+B", so a
  // mount-time check avoids a hydration mismatch ("⌘B" on first paint).
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(/Mac/i.test(navigator.userAgent)) // eslint-disable-line react-hooks/set-state-in-effect -- one-time platform detection after hydration
  }, [])
  const shortcut = isMac ? "⌘B" : "Ctrl+B"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <IconButton
            size="sm"
            onClick={onToggle}
            data-admin-sidebar-trigger
            // Always-on muted background; deepens on hover.
            className="bg-muted hover:bg-muted/80"
          >
            <PanelLeft size={16} />
            {/* Accessible name is breakpoint-aware: below md the button opens
                the drawer, on desktop it collapses the rail. aria-label can't
                switch per breakpoint, so visually hidden spans do — display:none
                content is excluded from the computed name. */}
            <span className="sr-only max-md:hidden">
              {label} · {shortcut}
            </span>
            <span className="sr-only md:hidden">{t("admin.menu")}</span>
          </IconButton>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {/* Match the breakpoint-aware accessible name on the trigger. */}
        <span className="max-md:hidden">
          {label} · {shortcut}
        </span>
        <span className="md:hidden">{t("admin.menu")}</span>
      </TooltipContent>
    </Tooltip>
  )
}
