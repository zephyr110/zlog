"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AdminSidebar, AdminSidebarTrigger } from "@/components/admin/admin-sidebar"
import { CommentUnreadProvider } from "@/components/admin/comment-unread"
import { CommandPalette } from "@/components/admin/command-palette"
import { apiFetch, clearToken } from "@/lib/api-client"
import { PageLoader } from "@/components/ui/page-loader"
import { useT } from "@/components/layout/trans"
import { cn } from "@/lib/utils"
import { Search } from "lucide-react"
import { IconButton } from "@/components/ui/icon-button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { type AuthUser } from "@zlog/auth"
import type { TranslationPath } from "@/lib/i18n"

/** Page title/subtitle shown in the top header, keyed by exact pathname.
 *  descKey is optional — editor pages use title only (+ optional
 *  #admin-header-title-extra for e.g. "View live post"). */
const pageMeta: Record<
  string,
  { titleKey: TranslationPath; descKey?: TranslationPath }
> = {
  "/admin/dashboard": { titleKey: "admin.dashboard", descKey: "admin.dashboardWelcome" },
  "/admin/posts": { titleKey: "admin.posts", descKey: "admin.postsDesc" },
  "/admin/posts/new": { titleKey: "admin.newPost" },
  "/admin/posts/edit": { titleKey: "admin.editPost" },
  "/admin/media": { titleKey: "admin.media", descKey: "admin.mediaDesc" },
  "/admin/comments": { titleKey: "admin.commentsPage", descKey: "admin.commentsDesc" },
  "/admin/settings": { titleKey: "admin.settings", descKey: "admin.settingsDesc" },
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useT()
  const [user, setUser] = useState<AuthUser | null>(null)
  const isLoginPage = pathname === "/admin/login"
  const [loading, setLoading] = useState(!isLoginPage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // One trigger, two behaviors: slide-in drawer below md, collapse toggle
  // on desktop. matchMedia is read at event time, so no hydration concern.
  function handleSidebarTrigger() {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((open) => !open)
    } else {
      setSidebarCollapsed((c) => !c)
    }
  }

  // Close the drawer on navigation — adjust state during render (React's
  // endorsed pattern) rather than syncing in an effect.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setMobileOpen(false)
  }

  // ESC + body scroll lock while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  // If the viewport crosses into desktop while the drawer is open (device
  // rotation, window resize), close it — otherwise the scroll lock and
  // drawer state outlive the overlay, which is md:hidden.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    function onChange() {
      if (mq.matches) setMobileOpen(false)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  useEffect(() => {
    if (isLoginPage) {
      return
    }

    async function checkAuth() {
      // The session token lives in an HttpOnly cookie JS can't read —
      // the server is the only authority: /api/auth/me answers 200 with
      // the user, or 401 when the cookie is missing/expired.
      try {
        // skipAuthRedirect: the layout owns the redirect here, so the
        // apiFetch 401 interceptor doesn't race it with a hard reload.
        const res = await apiFetch("/api/auth/me", { skipAuthRedirect: true })
        if (res.ok) {
          const data = await res.json()
          setUser(data.user)
        } else {
          await clearToken()
          router.push("/admin/login")
        }
      } catch {
        await clearToken()
        router.push("/admin/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [isLoginPage, router])

  if (loading && !isLoginPage) {
    return <PageLoader />
  }

  if (isLoginPage) {
    return <>{children}</>
  }

  if (!user) {
    return null
  }

  const meta = pathname ? pageMeta[pathname] : undefined

  return (
    <CommentUnreadProvider>
      <div className="min-h-screen bg-muted/30">
      <AdminSidebar
        collapsed={mobileOpen ? false : sidebarCollapsed}
        onToggle={handleSidebarTrigger}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        user={user}
      />
      <div
        // Inert while the drawer is open: pointer and keyboard interaction
        // stay inside the overlay instead of reaching behind the backdrop.
        inert={mobileOpen}
        className={cn(
          "transition-all duration-300 min-h-screen",
          // Content only yields space to the fixed sidebar on md+; on
          // mobile the sidebar is an overlay drawer and content is full-bleed.
          sidebarCollapsed ? "md:pl-[4.5rem]" : "md:pl-64"
        )}
      >
        {/* Top header — sidebar trigger followed by the current page's
            title and description. Horizontal insets match the content
            area below so header and content share the same edges. */}
        <header
          className={cn(
            "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 backdrop-blur px-4 md:px-8",
            // While the drawer is open the header is both covered and inert —
            // drop it from layout entirely on mobile so no renderer/capture
            // quirk can stack its trigger above the drawer's logo row.
            mobileOpen && "max-md:hidden"
          )}
        >
          <AdminSidebarTrigger
            collapsed={sidebarCollapsed}
            onToggle={handleSidebarTrigger}
          />
          {meta && (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
                  {/* titleKey/descKey are TranslationPath (union of all
                      leaves); t() therefore returns string | function.
                      pageMeta only stores string keys — narrow for JSX. */}
                  {t(meta.titleKey) as string}
                </h1>
              </div>
              {meta.descKey && (
                <>
                  <span
                    aria-hidden
                    className="hidden h-4 w-px shrink-0 bg-border sm:block"
                  />
                  <p className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
                    {t(meta.descKey) as string}
                  </p>
                </>
              )}
            </div>
          )}
          {/* ⌘K 命令面板触发（面板本体在页面底部挂载，全局监听快捷键）。
              图标按钮而非输入框样式：媒体页顶栏还挂着页面自己的
              「搜索文件名…」输入框，两个输入框样式的控件并排会互相混淆
              （与移动端表现一致）；⌘K 提示收进 tooltip。 */}
          <Tooltip>
            <TooltipTrigger
              render={
                <IconButton
                  size="sm"
                  bordered
                  aria-label={t("admin.commandSearch") as string}
                  onClick={() => setPaletteOpen(true)}
                  className="ml-auto rounded-lg border-border bg-background"
                >
                  <Search size={14} />
                </IconButton>
              }
            />
            <TooltipContent>
              {t("admin.commandSearch") as string}
              <kbd className="ml-1.5 rounded border border-border bg-muted/60 px-1 font-sans text-[10px] leading-4">
                ⌘K
              </kbd>
            </TooltipContent>
          </Tooltip>
          {/* Page primary actions portaled in via <HeaderActions /> */}
          <div
            id="admin-header-actions"
            className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2"
          />
        </header>
        {/* Content column fills the viewport under the header. List pages
            grow their table/grid (flex-1) and pin PaginationBar to the
            bottom via the bar's !mt-auto + sticky. */}
        <div className="flex min-h-[calc(100vh-3.5rem)] flex-col p-4 md:p-8">{children}</div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </CommentUnreadProvider>
  )
}
