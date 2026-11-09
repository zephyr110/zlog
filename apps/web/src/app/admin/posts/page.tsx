"use client"

import { useEffect, useRef, useState, useMemo, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Download, Ellipsis, Search, SquarePen, Eye, EyeOff, Globe, FilePen, Trash2, Pin } from "lucide-react"
import { PostsListSkeleton } from "@/components/ui/loading"
import { HeaderActions } from "@/components/admin/header-actions"
import { PaginationBar } from "@/components/admin/pagination-bar"
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch } from "@/lib/api-client"
import { fetchAdminPosts } from "@/lib/admin-posts"
import { FormattedDate } from "@/components/blog/formatted-date"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { categoryKeys, getCategoryLabel, resolveCategory } from "@/lib/categories"
import { isPublic, isPublished, isScheduled } from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { type PostSummary } from "@zlog/database"

const STATUS_FILTERS = ["all", "published", "scheduled", "drafts", "hidden"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_LABELS = {
  all: "admin.all",
  published: "admin.published",
  scheduled: "admin.statusScheduled",
  drafts: "admin.drafts",
  hidden: "admin.hidden",
} as const satisfies Record<StatusFilter, string>

const STATUS_PREDICATES: Record<
  Exclude<StatusFilter, "all">,
  (post: PostSummary) => boolean
> = {
  published: isPublished,
  scheduled: (post) => !post.draft && isScheduled(post.publishAt),
  drafts: (post) => post.draft,
  hidden: (post) => !post.visible,
}

function parseStatusFilter(value: string | null): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as StatusFilter)
    : "all"
}

/** Must match the bulk endpoint's max array length. Selection survives
 *  pagination, so a batch can span many pages and needs splitting. */
const BULK_CHUNK_SIZE = 100

/** Native checkbox (with indeterminate support) for row selection. */
function SelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label?: string
  disabled?: boolean
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      className={cn(
        "size-4 shrink-0 cursor-pointer accent-primary",
        className
      )}
    />
  )
}

/** Draft / scheduled / published badge, plus a hidden marker — shared by
 *  the mobile card and desktop table so the status palette can't drift
 *  between the variants. */
function StatusBadge({ post }: { post: PostSummary }) {
  const { t } = useT()
  const scheduled = !post.draft && isScheduled(post.publishAt)
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge
        variant={post.draft ? "secondary" : "default"}
        className={
          post.draft
            ? "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
            : scheduled
              ? "bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
        }
      >
        {post.draft
          ? (t("admin.draft"))
          : scheduled
            ? (t("admin.statusScheduled"))
            : (t("admin.publishedStatus"))}
      </Badge>
      {!post.visible ? (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <EyeOff className="size-3" />
          {t("admin.hidden")}
        </Badge>
      ) : null}
    </span>
  )
}

/** First 3 tags + "+N" overflow — shared by the mobile card and table. */
function TagChips({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.slice(0, 3).map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="max-w-full truncate font-normal text-foreground"
        >
          {tag}
        </Badge>
      ))}
      {tags.length > 3 && (
        <span className="text-xs text-muted-foreground">
          +{tags.length - 3}
        </span>
      )}
    </div>
  )
}

function AdminPostsContent() {
  const { t } = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialStatus = searchParams?.get("status")
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    parseStatusFilter(initialStatus)
  )
  // "all" or a category key (frontend, backend, ...) — tags roll up to
  // their topic via resolveCategory, same as the dashboard chart.
  const [topicFilter, setTopicFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [deleteTarget, setDeleteTarget] = useState<PostSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function fetchPosts() {
    // A failed list fetch used to render an empty table — surface it.
    const result = await fetchAdminPosts()
    if (result.ok) {
      setPosts(result.posts)
    } else {
      toast.error(t("admin.loadFailed"))
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPosts() // eslint-disable-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync filter when arriving via ?status= query (same-route navigation
  // does not remount the component, so the initial state would be stale).
  // Adjusting state during render is the React-recommended alternative
  // to setState-in-effect for prop-driven state resets.
  const [prevInitialStatus, setPrevInitialStatus] = useState(initialStatus)
  if (prevInitialStatus !== initialStatus) {
    setPrevInitialStatus(initialStatus)
    setStatusFilter(parseStatusFilter(initialStatus))
    setPage(1)
  }

  const filteredPosts = useMemo(() => {
    let result = posts
    if (statusFilter !== "all") {
      result = result.filter(STATUS_PREDICATES[statusFilter])
    }
    if (topicFilter !== "all") {
      result = result.filter((p) =>
        p.tags.some((tag) => resolveCategory(tag) === topicFilter)
      )
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((p) => p.title.toLowerCase().includes(query))
    }
    return result
  }, [posts, searchQuery, statusFilter, topicFilter])

  const paginatedPosts = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredPosts.slice(start, start + pageSize)
  }, [filteredPosts, page, pageSize])

  const totalPages = Math.ceil(filteredPosts.length / pageSize)

  // Selection is by slug and survives pagination; the header checkbox
  // acts on the rows currently visible on this page.
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(
    () => new Set()
  )
  const [bulkPending, setBulkPending] = useState(false)
  // Selection is scoped to the current filter/search and survives only
  // pagination. Without this, rows picked in one view stay selected while
  // another view shows none of them, and the bulk bar would act on
  // invisible rows. Adjusting state during render matches the page/filter
  // resets above.
  const selectionScope = JSON.stringify([statusFilter, topicFilter, searchQuery])
  const [prevSelectionScope, setPrevSelectionScope] = useState(selectionScope)
  if (prevSelectionScope !== selectionScope) {
    setPrevSelectionScope(selectionScope)
    setSelectedSlugs((prev) => (prev.size > 0 ? new Set() : prev))
  }
  const pageSlugs = paginatedPosts.map((post) => post.slug)
  const allPageSelected =
    pageSlugs.length > 0 && pageSlugs.every((slug) => selectedSlugs.has(slug))
  const somePageSelected = pageSlugs.some((slug) => selectedSlugs.has(slug))

  // Keep the page in bounds when the list shrinks — deleting a post,
  // toggling its draft (moves it out of the filtered view), or narrowing
  // a filter can leave page > totalPages, which renders an empty table
  // with a bogus "Page N/M" summary. Adjusting state during render is the
  // React-recommended alternative to setState-in-effect for derived resets.
  const [prevTotalPages, setPrevTotalPages] = useState(totalPages)
  if (prevTotalPages !== totalPages) {
    setPrevTotalPages(totalPages)
    if (page > totalPages) setPage(Math.max(1, totalPages))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    // Capture the target so the finally below only closes THIS confirm:
    // if the user dismissed it and opened another delete confirm while
    // the request was in flight, a stale unconditional close would kill
    // the new dialog without deleting its post.
    const target = deleteTarget
    setDeleting(true)

    try {
      const res = await apiFetch(
        `/api/posts?slug=${encodeURIComponent(target.slug)}`,
        {
          method: "DELETE",
        }
      )
      if (res.ok) {
        // Functional update — the render-time `posts` closure may predate
        // pin/draft toggles that landed while the DELETE was in flight;
        // filtering a stale array would wipe them from the UI.
        setPosts((prev) => prev.filter((p) => p.slug !== target.slug))
        setSelectedSlugs((prev) => {
          if (!prev.has(target.slug)) return prev
          const next = new Set(prev)
          next.delete(target.slug)
          return next
        })
        toast.success(t("admin.deleteSuccess"))
      } else {
        toast.error(t("admin.deleteFailed"))
      }
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setDeleting(false)
      setDeleteTarget((cur) => (cur === target ? null : cur))
    }
  }

  async function handleToggleDraft(slug: string, currentDraft: boolean) {
    try {
      const res = await apiFetch(
        `/api/posts?slug=${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: !currentDraft }),
        }
      )

      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) =>
            p.slug === slug
              ? {
                  ...p,
                  draft: !currentDraft,
                  // Mirror movePost: publishing now clears any pending
                  // schedule, so the optimistic row matches the server.
                  publishAt: currentDraft ? null : p.publishAt,
                }
              : p
          )
        )
        toast.success(
          currentDraft ? (t("admin.publishSuccess")) : (t("admin.unpublishSuccess"))
        )
      } else {
        toast.error(t("admin.updateFailed"))
      }
    } catch {
      toast.error(t("admin.networkError"))
    }
  }

  async function handleTogglePin(slug: string, pinnedAt: string | null) {
    const nextPinned = !pinnedAt
    try {
      const res = await apiFetch(
        `/api/posts?slug=${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: nextPinned }),
        }
      )
      if (res.ok) {
        const data = (await res.json()) as {
          post?: { pinnedAt: string | null }
        }
        setPosts((prev) =>
          prev.map((p) =>
            p.slug === slug
              ? {
                  ...p,
                  // Mirror the server's SQLite "YYYY-MM-DD HH:MM:SS"
                  // format so the optimistic value matches what the DB
                  // stores (setPostPinned writes it, not ISO-8601).
                  pinnedAt:
                    data.post?.pinnedAt ??
                    (nextPinned
                      ? new Date().toISOString().slice(0, 19).replace("T", " ")
                      : null),
                }
              : p
          )
        )
        toast.success(
          nextPinned ? t("admin.pinSuccess") : t("admin.unpinSuccess")
        )
      } else {
        toast.error(t("admin.updateFailed"))
      }
    } catch {
      toast.error(t("admin.networkError"))
    }
  }

  async function handleToggleVisible(slug: string, currentVisible: boolean) {
    const nextVisible = !currentVisible
    try {
      const res = await apiFetch(
        `/api/posts?slug=${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visible: nextVisible }),
        }
      )
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) =>
            p.slug === slug ? { ...p, visible: nextVisible } : p
          )
        )
        toast.success(
          nextVisible ? t("admin.showSuccess") : t("admin.hideSuccess")
        )
      } else {
        toast.error(t("admin.updateFailed"))
      }
    } catch {
      toast.error(t("admin.networkError"))
    }
  }

  function toggleSlug(slug: string) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function togglePageSelection() {
    setSelectedSlugs((prev) => {
      const next = new Set(prev)
      if (pageSlugs.every((slug) => next.has(slug))) {
        pageSlugs.forEach((slug) => next.delete(slug))
      } else {
        pageSlugs.forEach((slug) => next.add(slug))
      }
      return next
    })
  }

  async function handleBulkAction(action: "hide" | "show" | "draft") {
    const slugs = Array.from(selectedSlugs)
    if (slugs.length === 0 || bulkPending) return
    setBulkPending(true)
    try {
      const updated = new Set<string>()
      const skipped = new Set<string>()
      for (let i = 0; i < slugs.length; i += BULK_CHUNK_SIZE) {
        const chunk = slugs.slice(i, i + BULK_CHUNK_SIZE)
        try {
          const res = await apiFetch("/api/posts/bulk", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slugs: chunk, action }),
          })
          if (!res.ok) {
            chunk.forEach((slug) => skipped.add(slug))
            continue
          }
          const data = (await res.json()) as {
            updated?: string[]
            missing?: string[]
            failed?: string[]
          }
          for (const slug of data.updated ?? []) updated.add(slug)
          for (const slug of data.missing ?? []) skipped.add(slug)
          for (const slug of data.failed ?? []) skipped.add(slug)
        } catch {
          chunk.forEach((slug) => skipped.add(slug))
        }
      }

      if (updated.size === 0) {
        toast.error(t("admin.updateFailed"))
        return
      }

      setPosts((prev) =>
        prev.map((post) => {
          if (!updated.has(post.slug)) return post
          if (action === "hide") return { ...post, visible: false }
          if (action === "show") return { ...post, visible: true }
          // movePost(toDraft) keeps any pending schedule.
          return { ...post, draft: true }
        })
      )
      // Keep whatever did not go through selected — a stuck slug is then
      // visible in the bar and can be retried instead of silently dropped.
      setSelectedSlugs((prev) => {
        const next = new Set(prev)
        updated.forEach((slug) => next.delete(slug))
        return next
      })
      toast.success(
        action === "hide"
          ? t("admin.bulkHideSuccess")(updated.size)
          : action === "show"
            ? t("admin.bulkShowSuccess")(updated.size)
            : t("admin.bulkDraftSuccess")(updated.size)
      )
      if (skipped.size > 0) toast.error(t("admin.bulkPartial")(skipped.size))
    } finally {
      setBulkPending(false)
    }
  }

  // Row actions menu shared by the desktop table cell and the mobile card.
  function renderPostActions(post: PostSummary) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("admin.actions")}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Ellipsis size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36 whitespace-nowrap">
          <DropdownMenuItem
            onClick={() =>
              router.push(
                `/admin/posts/edit?slug=${encodeURIComponent(post.slug)}`
              )
            }
          >
            <SquarePen />
            {t("admin.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleToggleDraft(post.slug, post.draft)}
          >
            {post.draft ? <Globe /> : <FilePen />}
            {post.draft ? (t("admin.publish")) : (t("admin.unpublish"))}
          </DropdownMenuItem>
          {!post.draft && (
            <DropdownMenuItem
              onClick={() => handleToggleVisible(post.slug, post.visible)}
            >
              {post.visible ? <EyeOff /> : <Eye />}
              {post.visible
                ? t("admin.hideFromFrontend")
                : t("admin.restoreToFrontend")}
            </DropdownMenuItem>
          )}
          {/* Pinning is public-only — a pin on a draft or hidden post
              would sit invisible until it goes public, then silently jump
              to the top of the homepage. An existing pin stays reachable
              so it can be removed. */}
          {!post.draft && (post.visible || post.pinnedAt) && (
            <DropdownMenuItem
              onClick={() => handleTogglePin(post.slug, post.pinnedAt)}
            >
              <Pin />
              {post.pinnedAt ? t("admin.unpin") : t("admin.pin")}
            </DropdownMenuItem>
          )}
          {/* Only public posts have a live page — for the rest this link
              would 404. */}
          {isPublic(post) && (
            <DropdownMenuItem
              onClick={() =>
                router.push(`/posts/${encodeURIComponent(post.slug)}`)
              }
            >
              <Eye />
              {t("admin.view")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteTarget(post)}
          >
            <Trash2 />
            {t("admin.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (loading) {
    // Mirrors the loaded layout on both breakpoints: filter row, then
    // table columns on md+ and stacked cards below md.
    return <PostsListSkeleton rows={5} />
  }

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <HeaderActions>
        {/* 纯 <a> 直连下载：GET /api/admin/export 带 cookie 即返回 zip，
            无需客户端 JS 参与（大文件走浏览器原生下载 UI）。 */}
        <a
          href="/api/admin/export"
          title={t("admin.exportSiteHint")}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-muted"
        >
          <Download size={16} />
          {t("admin.exportSite")}
        </a>
        <Link
          href="/admin/posts/new"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary text-primary-foreground text-sm font-medium px-2.5 hover:bg-primary/80 transition-all"
        >
          {t("admin.newPost")}
        </Link>
      </HeaderActions>

      {posts.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-card ring-1 ring-foreground/10">
          <AdminBlockEmpty className="min-h-0 flex-1" />
        </div>
      ) : (
        <>
          {/* Search & Filter */}
          <div className="flex shrink-0 items-center gap-3 flex-wrap">
            {/* Status tabs */}
            <div className="inline-flex rounded-lg border p-0.5 bg-muted/30">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStatusFilter(s)
                    setPage(1)
                    // Keep the URL in sync so back/forward doesn't
                    // silently override the user's filter choice.
                    router.replace(
                      s === "all"
                        ? "/admin/posts"
                        : `/admin/posts?status=${s}`
                    )
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all pointer-coarse:min-h-8 ${
                    statusFilter === s
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(STATUS_LABELS[s])}
                </button>
              ))}
            </div>

            {/* Topic filter — tags roll up to their category (dashboard's
                Posts by Topic uses the same resolution). */}
            <Select
              value={topicFilter}
              onValueChange={(v) => { setTopicFilter(v || "all"); setPage(1) }}
            >
              <SelectTrigger className="w-44">
                {/* Explicit label: Base UI's SelectValue would otherwise
                    render the raw value ("all", "frontend"…) instead of
                    the translated category name. */}
                <SelectValue>
                  {topicFilter === "all"
                    ? (t("admin.allTopics"))
                    : getCategoryLabel(topicFilter, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.allTopics")}</SelectItem>
                {categoryKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {getCategoryLabel(key, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative min-w-40 flex-1 max-w-sm">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                placeholder={t("admin.searchPosts")}
                className="pl-9"
              />
            </div>
            {(searchQuery || topicFilter !== "all") && (
              <p className="text-sm text-muted-foreground">
                {filteredPosts.length} / {posts.length} {t("admin.posts")}
              </p>
            )}
          </div>

          {/* Bulk bar — appears once something is checked. Selection is
              keyed by slug and survives pagination, but the filter/search
              scope reset above clears it when the visible set changes. */}
          {selectedSlugs.size > 0 && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-sm font-medium">
                {t("admin.bulkSelected")(selectedSlugs.size)}
              </p>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("hide")}
                  disabled={bulkPending}
                >
                  <EyeOff />
                  {t("admin.bulkHide")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("show")}
                  disabled={bulkPending}
                >
                  <Eye />
                  {t("admin.bulkShow")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("draft")}
                  disabled={bulkPending}
                >
                  <FilePen />
                  {t("admin.bulkDraft")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedSlugs(new Set())}
                  disabled={bulkPending}
                >
                  {t("admin.bulkClear")}
                </Button>
              </div>
            </div>
          )}

          {/* Mobile select-all — the table's header checkbox is desktop-only. */}
          {paginatedPosts.length > 0 && (
            <label className="flex items-center gap-2 md:hidden">
              <SelectionCheckbox
                checked={allPageSelected}
                indeterminate={somePageSelected && !allPageSelected}
                onChange={togglePageSelection}
                label={t("admin.selectPage")}
                disabled={bulkPending}
              />
              <span className="text-xs text-muted-foreground">
                {t("admin.selectPage")}
              </span>
            </label>
          )}

          {/* Mobile cards — below md the 6-column table can't fit, so each
              post becomes a stacked card: title + actions, a meta row
              (status / pin / date), then tags. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:hidden">
            {paginatedPosts.length === 0 ? (
              <div className="flex min-h-0 flex-1 rounded-xl border bg-card">
                <AdminBlockEmpty className="min-h-0 flex-1" />
              </div>
            ) : (
              paginatedPosts.map((post) => (
                <article
                  key={post.slug}
                  className="rounded-xl border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <SelectionCheckbox
                      checked={selectedSlugs.has(post.slug)}
                      onChange={() => toggleSlug(post.slug)}
                      label={`${t("admin.selectPost")}: ${post.title}`}
                      disabled={bulkPending}
                      className="mt-0.5"
                    />
                    <Link
                      href={`/admin/posts/edit?slug=${encodeURIComponent(
                        post.slug
                      )}`}
                      className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors hover:text-primary"
                    >
                      {post.title}
                    </Link>
                    {/* Negative offsets optically align the icon button with
                        the title's cap height and the card's right edge. */}
                    <div className="-mr-2 -mt-1 shrink-0">
                      {renderPostActions(post)}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <StatusBadge post={post} />
                    {post.pinnedAt ? (
                      <Pin
                        className="size-3.5 text-foreground"
                        strokeWidth={2}
                        aria-label={t("admin.pinned")}
                      />
                    ) : null}
                    {/* UTC dates — same as the table, every admin sees the
                        authored date. */}
                    <FormattedDate
                      date={post.date}
                      month="short"
                      className="text-xs tabular-nums text-muted-foreground"
                    />
                  </div>
                  {post.tags.length > 0 ? (
                    <div className="mt-2.5">
                      <TagChips tags={post.tags} />
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>

          {/* Outer flex-1 fills space above the pinned PaginationBar.
              Empty: flex column so the no-data block fills below thead
              and centers. With rows: inner table container scrolls and
              sticky thead pins against that scrollport. Desktop only —
              mobile renders the card list above. */}
          <div
            className={
              paginatedPosts.length === 0
                ? "hidden min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card md:flex"
                : "hidden min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card md:block"
            }
          >
            <Table
              className="table-fixed"
              containerClassName={
                paginatedPosts.length === 0
                  ? "shrink-0 overflow-x-auto"
                  : "max-h-full overflow-y-auto"
              }
            >
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-8">
                    {pageSlugs.length > 0 && (
                      <SelectionCheckbox
                        checked={allPageSelected}
                        indeterminate={somePageSelected && !allPageSelected}
                        onChange={togglePageSelection}
                        label={t("admin.selectPage")}
                        disabled={bulkPending}
                      />
                    )}
                  </TableHead>
                  <TableHead className="w-[32%] min-w-0">
                    {t("admin.title")}
                  </TableHead>
                  <TableHead className="w-36">{t("admin.status")}</TableHead>
                  <TableHead className="w-16 text-center">
                    {t("admin.pin")}
                  </TableHead>
                  <TableHead className="w-36">{t("admin.date")}</TableHead>
                  <TableHead className="min-w-0">
                    {t("admin.tags")}
                  </TableHead>
                  <TableHead className="w-24 text-right">
                    {t("admin.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              {paginatedPosts.length > 0 ? (
              <TableBody>
                  {paginatedPosts.map((post) => (
                    <TableRow key={post.slug}>
                      <TableCell>
                        <SelectionCheckbox
                          checked={selectedSlugs.has(post.slug)}
                          onChange={() => toggleSlug(post.slug)}
                          label={`${t("admin.selectPost")}: ${post.title}`}
                          disabled={bulkPending}
                        />
                      </TableCell>
                      {/* Title / Pin / Date / Tags share foreground + text-sm;
                          title uses weight alone for hierarchy. Status stays
                          a colored badge; empty pin/tag overflow stay muted. */}
                      <TableCell className="min-w-0">
                        <Link
                          href={`/admin/posts/edit?slug=${encodeURIComponent(
                            post.slug
                          )}`}
                          className="block truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {post.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge post={post} />
                      </TableCell>
                      <TableCell className="text-center">
                        {post.pinnedAt ? (
                          <span className="inline-flex text-foreground">
                            <Pin
                              className="size-3.5"
                              strokeWidth={2}
                              aria-label={t("admin.pinned")}
                            />
                          </span>
                        ) : (
                          <span
                            className="inline-flex text-sm text-muted-foreground"
                            aria-label={t("admin.notPinned")}
                          >
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums text-foreground">
                        {/* UTC dates — format in UTC so every admin sees
                            the authored date, not the previous day. */}
                        <FormattedDate date={post.date} month="short" />
                      </TableCell>
                      <TableCell className="min-w-0">
                        <TagChips tags={post.tags} />
                      </TableCell>
                      <TableCell className="text-right">
                        {renderPostActions(post)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
              ) : null}
            </Table>
            {paginatedPosts.length === 0 ? (
              <AdminBlockEmpty className="min-h-0 flex-1" />
            ) : null}
          </div>

          {/* Pagination — shared with the media library */}
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={filteredPosts.length}
            itemLabel={t("admin.posts")}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </>
      )}
    </div>

      {/* Outside the gap flex column so the portal root cannot steal spacing */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={deleting}
        title={t("admin.delete")}
        description={t("admin.deleteConfirm")}
      />
    </>
  )
}

export default function AdminPostsPage() {
  return (
    <Suspense fallback={<PostsListSkeleton rows={5} />}>
      <AdminPostsContent />
    </Suspense>
  )
}
