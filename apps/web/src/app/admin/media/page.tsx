"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { HeaderActions } from "@/components/admin/header-actions"
import { PaginationBar } from "@/components/admin/pagination-bar"
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog"
import { MediaLightbox, type MediaFile } from "@/components/admin/media-lightbox"
import { MediaGrid, MediaGridSkeleton } from "@/components/admin/media-grid"
import { MediaList, MediaListSkeleton } from "@/components/admin/media-list"
import { Input } from "@/components/ui/input"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { Upload, LayoutGrid, List, X, Search, TriangleAlert, SlidersHorizontal } from "lucide-react"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { useLocale } from "@/components/layout/i18n-provider"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { IconButton } from "@/components/ui/icon-button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { createSemaphore } from "@/lib/semaphore"
import { useMediaLibrary } from "@/hooks/use-media-library"
import { apiFetch } from "@/lib/api-client"
import {
  UPLOAD_ACCEPT,
  uploadImageFile,
  validateImageFile,
} from "@/lib/upload"

const UPLOAD_CONCURRENCY = 3
/** Batch cap — a stray 200-file drop would otherwise lock the page for
 *  half an hour (30s × 67 slots). Generous for any realistic selection. */
const MAX_BATCH_SIZE = 30

type ViewMode = "grid" | "list"

export default function AdminMediaPage() {
  const { t } = useT()
  const { locale } = useLocale()
  const {
    files,
    loading,
    refreshing,
    page,
    setPage,
    total,
    totalPages,
    dateFrom,
    dateTo,
    pageSize,
    searchInput,
    setSearchInput,
    searchQuery,
    apiError,
    setApiError,
    fetchMedia,
    updateDateRange,
    clearDateFilter,
    changePageSize,
  } = useMediaLibrary()

  // Batch progress — null while idle. total includes files rejected in the
  // pre-check so the counter matches what the user picked.
  const [uploadStats, setUploadStats] = useState<{
    total: number
    done: number
    failed: number
  } | null>(null)
  // Ref mirror of the same state — uploadFiles reads it so its identity
  // doesn't depend on uploadStats (which changes on every progress tick,
  // and would ripple through handleDrop's dependency array).
  const uploadingRef = useRef(false)
  const isUploading = uploadStats !== null
  const [dragActive, setDragActive] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MediaFile | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Restore the user's last view once mounted (localStorage is client-only;
  // SSR always renders the grid so there is no hydration mismatch).
  useEffect(() => {
    const saved = localStorage.getItem("media-view")
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the saved view on mount
    if (saved === "grid" || saved === "list") setViewMode(saved)
  }, [])

  function switchView(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem("media-view", mode)
  }

  /** Batch upload — pre-checks every file, then runs the POSTs through a
   *  concurrency-capped worker pool. Failures are isolated per file; the
   *  summary toast at the end reports the overall result. */
  const uploadFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0) return
      // One batch at a time — a drop landing mid-upload is ignored (the
      // disabled buttons/tile cover most paths; the drop zone is the rest).
      if (uploadingRef.current) return

      const files = Array.from(fileList)
      if (files.length > MAX_BATCH_SIZE) {
        toast.error(t("admin.uploadFailed"))
        files.length = MAX_BATCH_SIZE
      }

      // Pre-check: separate valid files from rejections so the progress
      // total reflects the whole selection from the start.
      const valid: File[] = []
      let preCheckFailed = 0
      for (const file of files) {
        if (validateImageFile(file) !== "ok") {
          preCheckFailed++
        } else {
          valid.push(file)
        }
      }
      if (valid.length === 0) {
        toast.error(t("admin.uploadFailed"))
        return
      }

      const total = valid.length + preCheckFailed
      // Mutable counters — the state updates they drive may not have been
      // flushed by the time Promise.all resolves, so the summary toast
      // reads the refs, not the state.
      const statsRef = { done: 0, failed: preCheckFailed }

      uploadingRef.current = true
      setUploadStats({ total, done: 0, failed: preCheckFailed })

      const sem = createSemaphore(UPLOAD_CONCURRENCY)
      const worker = async (file: File) => {
        await sem.acquire()
        try {
          const result = await uploadImageFile(file)
          if (result.ok) {
            statsRef.done++
          } else {
            statsRef.failed++
          }
        } catch {
          statsRef.failed++
        } finally {
          setUploadStats({ total, done: statsRef.done, failed: statsRef.failed })
          sem.release()
        }
      }

      await Promise.all(valid.map(worker))

      // New uploads are newest-first → jump to page 1 to see them. A
      // no-op setPage(1) would never refire the effect (React bails out
      // on the same value), so fetch directly when already on page 1.
      if (page === 1) {
        await fetchMedia(1)
      } else {
        setPage(1)
      }

      const { done, failed } = statsRef
      if (failed === 0) {
        toast.success(
          t("admin.uploadBatchSuccess")(done)
        )
      } else if (done === 0) {
        toast.error(t("admin.uploadFailed"))
      } else {
        toast.error(
          t("admin.uploadBatchPartial")(done, failed)
        )
      }

      uploadingRef.current = false
      setUploadStats(null)
      const input = document.getElementById("media-file-input") as HTMLInputElement
      if (input) input.value = ""
    },
    [t, page, fetchMedia, setPage]
  )

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    await uploadFiles(e.target.files)
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      await uploadFiles(e.dataTransfer.files)
    },
    [uploadFiles]
  )

  // Backend now returns absolute jsdelivr URLs — only prepend the site
  // origin for legacy relative paths.
  function fullUrl(url: string) {
    return url.startsWith("http") ? url : `${window.location.origin}${url}`
  }

  function copyToClipboard(url: string) {
    navigator.clipboard.writeText(fullUrl(url)).then(() => {
      toast.success(t("admin.urlCopied"))
    })
  }

  function copyMarkdown(url: string) {
    navigator.clipboard
      .writeText(`![alt text](${fullUrl(url)})`)
      .then(() => {
        toast.success(t("admin.markdownCopied"))
      })
  }

  async function handleDelete() {
    if (!deleteTarget) return
    // Capture the target so the finally below only closes THIS confirm:
    // if the user dismissed it and opened another delete confirm while
    // the request was in flight, a stale unconditional close would kill
    // the new dialog without deleting its file.
    const target = deleteTarget
    setDeleting(true)

    try {
      const res = await apiFetch(
        `/api/upload?filename=${encodeURIComponent(target.name)}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        // Refetch the page: the row is gone (so totals shift). If this was
        // the last item on a page > 1, step back a page instead.
        if (files.length === 1 && page > 1) {
          setPage(page - 1)
        } else {
          await fetchMedia(page)
        }
        toast.success(t("admin.imageDeleted"))
        if (previewFile?.name === target.name) {
          // Close the dialog first — its deferred scroll-lock restore runs
          // while the lightbox still holds body overflow:hidden — then drop
          // the lightbox a frame later. Closing both in the same tick makes
          // the lightbox's cleanup clear the lock first, and the dialog's
          // restore then re-applies the stale hidden, locking body scroll
          // until a reload.
          requestAnimationFrame(() => setPreviewFile(null))
        }
      } else {
        toast.error(t("admin.deleteImageFailed"))
      }
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setDeleting(false)
      setDeleteTarget((cur) => (cur === target ? null : cur))
    }
  }

  function openFileInput() {
    document.getElementById("media-file-input")?.click()
  }

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <HeaderActions>
        <input
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          onChange={handleUpload}
          className="hidden"
          id="media-file-input"
        />

        {/* Desktop toolbar (md+) — every control inline in the header. */}
        <div className="hidden items-center gap-2 md:flex">
          {/* Filename search — debounced, resets to page 1 on query */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("admin.searchMedia")}
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>
          {/* Date range filter — one trigger opens a two-month range
              calendar; local dates, converted to exact UTC timestamps on
              the wire */}
          <div className="flex items-center gap-1.5">
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={updateDateRange}
              ariaLabel={t("admin.dateRange")}
              placeholder={t("admin.dateRange")}
              locale={locale === "zh" ? "zh" : "en"}
            />
            {(dateFrom || dateTo) && (
              <IconButton
                size="sm"
                aria-label={t("admin.clearFilter")}
                onClick={clearDateFilter}
              >
                <X size={14} />
              </IconButton>
            )}
          </div>
          {/* Segmented view toggle — fixed h-8 to match the date picker and
              upload button; inner buttons fill the container's inner height
              (32px − border − p-0.5 ≈ 26px). */}
          <div
            role="group"
            aria-label={t("admin.viewMode")}
            className="flex h-8 items-center rounded-lg border border-border bg-background p-0.5"
          >
            <IconButton
              size="sm"
              aria-label={t("admin.gridView")}
              aria-pressed={viewMode === "grid"}
              className={cn("h-full w-7", viewMode === "grid" && "bg-muted text-foreground")}
              onClick={() => switchView("grid")}
            >
              <LayoutGrid size={14} />
            </IconButton>
            <IconButton
              size="sm"
              aria-label={t("admin.listView")}
              aria-pressed={viewMode === "list"}
              className={cn("h-full w-7", viewMode === "list" && "bg-muted text-foreground")}
              onClick={() => switchView("list")}
            >
              <List size={14} />
            </IconButton>
          </div>
          <Button
            disabled={isUploading}
            onClick={openFileInput}
          >
            {isUploading && uploadStats
              ? t("admin.uploadProgress")(uploadStats.done, uploadStats.total)
              : (t("admin.uploadImage"))}
          </Button>
        </div>

        {/* Mobile toolbar (<md) — search + date range collapse into a filter
            popover so the header fits the viewport; the view toggle and an
            icon-only upload stay one tap away. A popover (not a dropdown
            menu) because it hosts form controls, which roving-tabindex
            menus fight against. */}
        <div className="flex items-center gap-2 md:hidden">
          <div
            role="group"
            aria-label={t("admin.viewMode")}
            className="flex h-8 items-center rounded-lg border border-border bg-background p-0.5"
          >
            <IconButton
              size="sm"
              aria-label={t("admin.gridView")}
              aria-pressed={viewMode === "grid"}
              className={cn("h-full w-7", viewMode === "grid" && "bg-muted text-foreground")}
              onClick={() => switchView("grid")}
            >
              <LayoutGrid size={14} />
            </IconButton>
            <IconButton
              size="sm"
              aria-label={t("admin.listView")}
              aria-pressed={viewMode === "list"}
              className={cn("h-full w-7", viewMode === "list" && "bg-muted text-foreground")}
              onClick={() => switchView("list")}
            >
              <List size={14} />
            </IconButton>
          </div>
          {/* All mobile header controls share h-8 / size-sm so the
              segmented toggle, upload CTA, and filter trigger align. */}
          <IconButton
            size="sm"
            aria-label={t("admin.uploadImage")}
            disabled={isUploading}
            onClick={openFileInput}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isUploading ? <Spinner className="size-3.5" /> : <Upload size={14} />}
          </IconButton>
          <Popover>
            <PopoverTrigger
              render={
                <IconButton
                  size="sm"
                  aria-label={t("admin.filters")}
                  className="relative bg-muted transition-colors duration-200 hover:bg-muted/80 data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg]:transition-transform [&_svg]:duration-200 data-popup-open:[&_svg]:rotate-90"
                >
                  <SlidersHorizontal size={14} />
                  {/* Active-filter dot — the controls live behind this
                      popover, so the trigger must advertise engagement. */}
                  {(searchQuery || dateFrom || dateTo) && (
                    <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />
                  )}
                </IconButton>
              }
            />
            <PopoverContent align="end" sideOffset={6} className="w-72 p-3">
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t("admin.searchMedia")}
                    className="h-8 w-full pl-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <DateRangePicker
                    from={dateFrom}
                    to={dateTo}
                    onChange={updateDateRange}
                    ariaLabel={t("admin.dateRange")}
                    placeholder={t("admin.dateRange")}
                    locale={locale === "zh" ? "zh" : "en"}
                  />
                  {(dateFrom || dateTo) && (
                    <IconButton
                      size="sm"
                      aria-label={t("admin.clearFilter")}
                      onClick={clearDateFilter}
                    >
                      <X size={14} />
                    </IconButton>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </HeaderActions>

      {/* API failure banner — a failed list fetch used to be swallowed
          into a silently empty library; the banner surfaces it (with a
          dismiss, since a later refetch clears it anyway). */}
      {apiError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span className="flex-1">{t("admin.mediaApiError")}</span>
          <button
            type="button"
            aria-label={t("admin.dismiss")}
            onClick={() => setApiError(false)}
            className="rounded-md p-0.5 text-destructive/70 transition-colors hover:text-destructive"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Drop zone — only when the library is genuinely empty; a filter
          with zero matches gets the no-results card below instead.
          Suppressed while apiError shows: inviting an upload against a
          dead API is contradictory. */}
      {files.length === 0 && !loading && !apiError && !searchQuery && !dateFrom && !dateTo && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={openFileInput}
          className={cn(
            "rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
          )}
        >
          <Upload
            size={40}
            className="mx-auto text-muted-foreground mb-4"
          />
          <p className="font-medium">{t("admin.uploadImage")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("admin.dragDropToUpload")}
          </p>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      {loading ? (
        // Skeletons mirror the real card/row layout so the page doesn't
        // jump when the data lands.
        viewMode === "grid" ? (
          <MediaGridSkeleton />
        ) : (
          <MediaListSkeleton />
        )
      ) : files.length === 0 ? (
        // Genuine empty already shows the drop zone above — only render
        // the fill-and-center empty here for filtered/error empties so
        // the placeholder sits in the middle of the remaining viewport
        // (same pattern as the posts table filter empty).
        searchQuery || dateFrom || dateTo || apiError ? (
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card">
            <AdminBlockEmpty className="min-h-0 flex-1" />
          </div>
        ) : null
      ) : viewMode === "grid" ? (
        <MediaGrid
          files={files}
          isUploading={isUploading}
          onUploadClick={openFileInput}
          onPreview={setPreviewFile}
          onCopyUrl={copyToClipboard}
          onCopyMarkdown={copyMarkdown}
          onDelete={setDeleteTarget}
        />
      ) : (
        <MediaList
          files={files}
          isUploading={isUploading}
          onUploadClick={openFileInput}
          onPreview={setPreviewFile}
          onCopyUrl={copyToClipboard}
          onCopyMarkdown={copyMarkdown}
          onDelete={setDeleteTarget}
        />
      )}

      {/* Refetch indicator — page/filter changes keep the list mounted,
          just dim it while the new page loads (initial load uses the
          skeletons above). */}
      {refreshing && !loading && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-background/40">
          <Spinner size="md" fill />
        </div>
      )}
      </div>

      {/* Pagination — PaginationBar carries its own sticky bottom styling,
          shared with the posts list. */}
      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        itemLabel={t("admin.images")}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={changePageSize}
      />
    </div>

      {/* Outside the gap flex column so overlays cannot steal spacing */}
      <MediaLightbox
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onCopyUrl={copyToClipboard}
        onCopyMarkdown={copyMarkdown}
        onDelete={setDeleteTarget}
      />
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={deleting}
        title={t("admin.deleteImage")}
        description={t("admin.deleteImageConfirm")}
        confirmLabel={t("admin.deleteImage")}
        busyLabel={t("admin.deletingImage")}
      />
    </>
  )
}
