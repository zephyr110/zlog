"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { buttonVariants } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { ImageIcon, Upload } from "lucide-react"
import type { MediaFile } from "@/components/admin/media-lightbox"
import {
  UPLOAD_ACCEPT,
  uploadImageFile,
  validateImageFile,
} from "@/lib/upload"

interface MediaPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (url: string) => void
}

/**
 * Insert-image dialog with two modes: browse the media library, or upload
 * a local image directly (compressed + dual-written by /api/upload, then
 * inserted at the cursor automatically — same flow as picking a library
 * image).
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: MediaPickerDialogProps) {
  const { t } = useT()
  const [tab, setTab] = useState<"library" | "upload">("library")
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [pendingFile, setPendingFile] = useState<{
    name: string
    previewUrl: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Tracks whether the dialog is still open when the upload finishes — if
  // the user closed it mid-upload, don't force-insert, just toast success.
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    // Fresh dialog → library tab, no stale preview.
    setTab("library") // eslint-disable-line react-hooks/set-state-in-effect -- one-time reset when the dialog opens
    setPendingFile(null)
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await apiFetch("/api/upload")
        if (res.ok && !cancelled) {
          const data = await res.json()
          setFiles(data.images || [])
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open])

  const uploadLocal = useCallback(
    async (file: File) => {
      const check = validateImageFile(file)
      if (check === "type") {
        toast.error(t("admin.uploadFailed"))
        return
      }
      if (check === "size") {
        toast.error(t("admin.fileTooLarge"))
        return
      }
      setUploading(true)
      try {
        // Same pipeline as the media page: compress + dual-write to
        // Turso/GitHub — the server does the heavy lifting.
        const result = await uploadImageFile(file)

        if (result.ok) {
          toast.success(t("admin.uploadSuccess"))
          if (openRef.current) {
            onSelect(result.url)
            onOpenChange(false)
          }
        } else if (result.reason === "network") {
          toast.error(t("admin.networkError"))
        } else {
          toast.error(result.message || t("admin.uploadFailed"))
        }
      } finally {
        setUploading(false)
        setPendingFile((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl)
          return null
        })
        const input = fileInputRef.current
        if (input) input.value = ""
      }
    },
    [t, onSelect, onOpenChange]
  )

  const handlePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      // Preview before upload; revoke the object URL when done.
      setPendingFile({
        name: file.name,
        previewUrl: URL.createObjectURL(file),
      })
      uploadLocal(file)
    },
    [uploadLocal]
  )

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
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      const file = e.dataTransfer.files?.[0]
      if (file) {
        setPendingFile({
          name: file.name,
          previewUrl: URL.createObjectURL(file),
        })
        uploadLocal(file)
      }
    },
    [uploadLocal]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(calc(100dvh-2rem),85vh)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("admin.media")}</DialogTitle>
          <DialogDescription>
            {t("admin.mediaPickDesc")}
          </DialogDescription>
        </DialogHeader>

        {/* Mode switch — library / local upload */}
        <div
          role="tablist"
          aria-label={t("admin.media")}
          className="flex w-fit items-center rounded-lg border border-border bg-background p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "library"}
            onClick={() => setTab("library")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              tab === "library"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("admin.mediaLibrary")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "upload"}
            onClick={() => setTab("upload")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              tab === "upload"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("admin.uploadLocal")}
          </button>
        </div>

        {tab === "upload" ? (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={handlePick}
              className="hidden"
            />

            {uploading || pendingFile ? (
              /* Pending/uploading — preview + status */
              <div className="rounded-xl border p-6 text-center">
                {pendingFile && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={pendingFile.previewUrl}
                    alt=""
                    className="mx-auto mb-3 max-h-48 rounded-lg object-contain bg-muted/50"
                  />
                )}
                <p className="mx-auto max-w-full truncate text-sm font-medium">
                  {pendingFile?.name}
                </p>
                {uploading && (
                  <div className="mt-1.5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Spinner size="sm" />
                    <span>{t("admin.uploading")}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Drop zone */
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                )}
              >
                <Upload
                  size={32}
                  className="mx-auto mb-3 text-muted-foreground"
                />
                <p className="font-medium">
                  {t("admin.dragDropToUpload")}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("admin.uploadHint")}
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              JPG / PNG / GIF / WebP / SVG · {t("admin.fileTooLarge")}
            </p>
          </div>
        ) : loading ? (
          <Spinner size="md" fill className="min-h-64" />
        ) : files.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <ImageIcon size={32} className="text-muted-foreground" />
            <p className="text-sm font-medium">{t("admin.noImages")}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {t("admin.noImagesDesc")}
            </p>
            {/* Hard navigation on purpose: leaving the editor mid-edit
                fires its beforeunload unsaved-changes guard, which a
                client-side router.push would bypass. */}
            <a
              href="/admin/media"
              onClick={() => onOpenChange(false)}
              className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              {t("admin.goToMedia")}
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {files.map((file) => (
              <Tooltip key={file.url}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(file.url)
                        onOpenChange(false)
                      }}
                      className="group relative aspect-video w-full rounded-lg border overflow-hidden bg-muted hover:border-primary/40 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = "none"
                  }}
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1 text-left">
                  <span className="block text-[11px] text-white truncate">
                    {file.name}
                  </span>
                </span>
                  </button>
                  }
                />
                <TooltipContent>{file.name}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            {t("admin.mediaPickHint")}
          </p>
          {/* Hard navigation on purpose: fires the editor's beforeunload
              unsaved-changes guard when navigating away with edits. */}
          <a
            href="/admin/media"
            onClick={() => onOpenChange(false)}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5"
            )}
          >
            <Upload size={14} />
            {t("admin.uploadImage")}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
