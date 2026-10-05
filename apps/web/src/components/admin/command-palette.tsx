"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Download,
  FileText,
  FolderGit2,
  Home,
  Image,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Search,
  Settings,
  SunMoon,
  type LucideIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useT } from "@/components/layout/trans"
import { fetchAdminPosts } from "@/lib/admin-posts"
import {
  filterPaletteItems,
  groupPaletteItems,
  stepActiveIndex,
  type PaletteGroup,
  type PaletteItem,
} from "@/lib/command-palette"
import { cn } from "@/lib/utils"
import { type PostSummary } from "@zlog/database"

type Command = PaletteItem & { icon: LucideIcon; run: () => void }

/** ⌘K / Ctrl+K 命令面板：跳转页面、执行操作、搜索并打开文章。
 *  打开状态由 admin layout 持有（header 里还有一个可见触发按钮）。 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { t } = useT()
  const { resolvedTheme, setTheme } = useTheme()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  // null = 尚未拉取；文章列表首次打开时才加载，失败静默（面板仍可用）。
  const [posts, setPosts] = useState<PostSummary[] | null>(null)
  const activeRef = useRef<HTMLButtonElement | null>(null)

  // 全局快捷键：⌘K / Ctrl+K 开合（再按一次关闭）。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open || posts !== null) return
    let cancelled = false
    fetchAdminPosts().then((result) => {
      if (!cancelled && result.ok) setPosts(result.posts)
    })
    return () => {
      cancelled = true
    }
  }, [open, posts])

  // 键盘移动高亮行时保持可见。
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  /** 受控开合：关闭时重置查询与高亮（事件回调里重置，不走 effect）。 */
  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setQuery("")
      setActive(0)
    }
  }

  function run(command: Command) {
    handleOpenChange(false)
    command.run()
  }

  const baseCommands: Command[] = [
    {
      id: "nav-dashboard",
      group: "nav",
      label: t("admin.dashboard") as string,
      icon: LayoutDashboard,
      keywords: ["dashboard", "home"],
      run: () => router.push("/admin/dashboard"),
    },
    {
      id: "nav-posts",
      group: "nav",
      label: t("admin.posts") as string,
      icon: FileText,
      keywords: ["posts", "articles"],
      run: () => router.push("/admin/posts"),
    },
    {
      id: "nav-comments",
      group: "nav",
      label: t("admin.comments") as string,
      icon: MessageSquare,
      keywords: ["comments"],
      run: () => router.push("/admin/comments"),
    },
    {
      id: "nav-media",
      group: "nav",
      label: t("admin.media") as string,
      icon: Image,
      keywords: ["media", "images", "uploads"],
      run: () => router.push("/admin/media"),
    },
    {
      id: "nav-projects",
      group: "nav",
      label: t("admin.projects") as string,
      icon: FolderGit2,
      keywords: ["projects", "项目"],
      run: () => router.push("/admin/projects"),
    },
    {
      id: "nav-settings",
      group: "nav",
      label: t("admin.settings") as string,
      icon: Settings,
      keywords: ["settings", "config"],
      run: () => router.push("/admin/settings"),
    },
    {
      id: "nav-view-blog",
      group: "nav",
      label: t("admin.viewBlog") as string,
      icon: Home,
      keywords: ["blog", "site"],
      run: () => router.push("/"),
    },
    {
      id: "action-new-post",
      group: "action",
      label: t("admin.newPost") as string,
      icon: Plus,
      keywords: ["new", "create", "write", "新建"],
      run: () => router.push("/admin/posts/new"),
    },
    {
      id: "action-export",
      group: "action",
      label: t("admin.exportSite") as string,
      icon: Download,
      keywords: ["export", "backup", "zip", "导出"],
      // 直连下载：临时 <a> 点击走浏览器原生下载流程。
      // （不用 window.location 赋值——那是修改组件外全局，
      // react-hooks/immutability 不允许。）
      run: () => {
        const link = document.createElement("a")
        link.href = "/api/admin/export"
        document.body.append(link)
        link.click()
        link.remove()
      },
    },
    {
      id: "action-toggle-theme",
      group: "action",
      label:
        resolvedTheme === "dark"
          ? (t("admin.commandToLight") as string)
          : (t("admin.commandToDark") as string),
      icon: SunMoon,
      keywords: ["theme", "dark", "light", "主题"],
      run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
  ]

  // 文章结果只在有查询词时出现——空查询直接罗列长列表反而难用。
  const postCommands: Command[] = query.trim()
    ? (posts ?? []).map((post) => ({
        id: `post-${post.slug}`,
        group: "posts" as const,
        label: post.title,
        hint: post.slug,
        keywords: [post.slug, ...post.tags],
        icon: FileText,
        run: () =>
          router.push(`/admin/posts/edit?slug=${encodeURIComponent(post.slug)}`),
      }))
    : []

  const results = filterPaletteItems([...baseCommands, ...postCommands], query)
  const groups = groupPaletteItems(results)
  const activeItem = results[active]

  let flatIndex = -1
  const rows = groups.map(({ group, items }) => ({
    group,
    items: items.map((item) => ({ item, index: ++flatIndex })),
  }))

  const groupLabel = (group: PaletteGroup) =>
    group === "nav"
      ? (t("admin.commandNav") as string)
      : group === "action"
        ? (t("admin.commandActions") as string)
        : (t("admin.posts") as string)

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => stepActiveIndex(i, 1, results.length))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => stepActiveIndex(i, -1, results.length))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (activeItem) run(activeItem)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        // 面板贴顶部（视口是 flex 居中，self-start + 上边距即可），
        // 无内边距 —— 输入行与列表自己管。
        className="mt-[12vh] max-w-[min(32rem,100%)] gap-0 self-start overflow-hidden p-0"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">
          {t("admin.commandSearch") as string}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("admin.commandPlaceholder") as string}
        </DialogDescription>

        <div className="flex items-center gap-2 border-b px-3">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder={t("admin.commandPlaceholder") as string}
            className="h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[min(20rem,50vh)] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("admin.commandEmpty") as string}
            </p>
          ) : (
            rows.map(({ group, items }) => (
              <div key={group} className="[&:not(:first-child)]:mt-1">
                <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  {groupLabel(group)}
                </p>
                {items.map(({ item, index }) => {
                  const Icon = item.icon
                  const isActive = index === active
                  return (
                    <button
                      key={item.id}
                      type="button"
                      ref={isActive ? activeRef : null}
                      // onMouseMove 而非 enter：键盘滚动列表时鼠标静止，
                      // 不该在没有真实移动的情况下抢走高亮。
                      onMouseMove={() => {
                        if (!isActive) setActive(index)
                      }}
                      onClick={() => run(item)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        isActive ? "bg-muted" : ""
                      )}
                    >
                      <Icon
                        size={16}
                        className="shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                      {item.hint && (
                        <span className="max-w-40 shrink-0 truncate text-xs text-muted-foreground">
                          {item.hint}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
          {t("admin.commandHint") as string}
        </div>
      </DialogContent>
    </Dialog>
  )
}
