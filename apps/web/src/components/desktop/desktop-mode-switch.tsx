"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { BookOpen, PenLine } from "lucide-react"
import { cn } from "@/lib/utils"
import { isDesktopBuild } from "@/lib/desktop"
import { confirmDesktopNavigation } from "@/lib/desktop-commands"
import { useT } from "@/components/layout/trans"

const LAST_WRITING_KEY = "zlog.desktop.lastWritingPath"
const DEFAULT_WRITING_PATH = "/admin/dashboard"

function lastWritingPath(): string {
  try {
    const stored = localStorage.getItem(LAST_WRITING_KEY)
    if (stored) {
      // 编辑页靠 ?slug= 定位；只存路径会把用户打回 /admin/posts
      const url = new URL(stored, "http://localhost")
      const isAdmin =
        url.pathname === "/admin" || url.pathname.startsWith("/admin/")
      if (isAdmin && url.pathname !== "/admin/login") {
        return url.pathname + url.search
      }
    }
  } catch {}
  return DEFAULT_WRITING_PATH
}

/** 主窗口的阅读/写作切换。只在桌面构建渲染；Web 端不出现任何入口。 */
export function DesktopModeSwitch({ className }: { className?: string }) {
  const { t } = useT()
  const pathname = usePathname()
  const router = useRouter()

  const writing =
    pathname?.startsWith("/admin") === true && pathname !== "/admin/login"

  // 记住最近停留的后台页面，切回写作模式时回到这里
  useEffect(() => {
    if (!isDesktopBuild() || !writing || !pathname) return
    try {
      localStorage.setItem(LAST_WRITING_KEY, pathname + window.location.search)
    } catch {}
  }, [pathname, writing])

  if (!isDesktopBuild()) return null

  const enterReading = () => {
    if (!writing) return
    if (!confirmDesktopNavigation(t("site.desktopLeaveUnsaved"))) return
    router.push("/")
  }
  const enterWriting = () => {
    if (writing) return
    router.push(lastWritingPath())
  }

  return (
    <div
      role="group"
      aria-label={t("site.desktopMode")}
      className={cn(
        "hidden items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 md:flex",
        className
      )}
    >
      <ModeButton
        active={!writing}
        icon={<BookOpen size={14} />}
        label={t("site.desktopReading")}
        onClick={enterReading}
      />
      <ModeButton
        active={writing}
        icon={<PenLine size={14} />}
        label={t("site.desktopWriting")}
        onClick={enterWriting}
      />
    </div>
  )
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  )
}
