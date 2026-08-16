"use client"

import { useEffect, useState, useMemo, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Ellipsis, Search, SquarePen, Eye, Globe, FilePen, Trash2, Pin } from "lucide-react"
import { PostsListSkeleton } from "@/components/ui/loading"
import { HeaderActions } from "@/components/admin/header-actions"
import { PaginationBar } from "@/components/admin/pagination-bar"
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
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
import { type PostSummary } from "@zlog/database"

/** Draft/published badge — shared by the mobile card and desktop table so
 *  the status palette can't drift between the two variants. */
function StatusBadge({ draft }: { draft: boolean }) {
  const { t } = useT()
  return (
    <Badge
      variant={draft ? "secondary" : "default"}
      className={
        draft
          ? "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
      }
    >
      {draft ? (t("admin.draft")) : (t("admin.publishedStatus"))}
    </Badge>
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
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "drafts">(
    initialStatus === "published" || initialStatus === "drafts" ? initialStatus : "all"
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
    if (initialStatus === "published" || initialStatus === "drafts") {
      setStatusFilter(initialStatus)
      setPage(1)
    }
  }

  const filteredPosts = useMemo(() => {
    let result = posts
    if (statusFilter === "published") result = result.filter((p) => !p.draft)
    if (statusFilter === "drafts") result = result.filter((p) => p.draft)
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
            p.slug === slug ? { ...p, draft: !currentDraft } : p
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
          {/* Pinning is published-only — a pin on a draft would sit
              invisible until publication, then silently jump the post to
              the top of the homepage. */}
          {!post.draft && (
            <DropdownMenuItem
              onClick={() => handleTogglePin(post.slug, post.pinnedAt)}
            >
              <Pin />
              {post.pinnedAt ? t("admin.unpin") : t("admin.pin")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              router.push(`/posts/${encodeURIComponent(post.slug)}`)
            }
          >
            <Eye />
            {t("admin.view")}
          </DropdownMenuItem>
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
              {(["all", "published", "drafts"] as const).map((s) => (
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
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    statusFilter === s
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "all"
                    ? (t("admin.all"))
                    : s === "published"
                    ? (t("admin.published"))
                    : (t("admin.drafts"))}
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
                    <StatusBadge draft={post.draft} />
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
                        <StatusBadge draft={post.draft} />
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
