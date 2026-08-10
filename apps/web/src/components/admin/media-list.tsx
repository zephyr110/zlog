"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { MediaRowActions } from "@/components/admin/media-row-actions"
import type { MediaFile } from "@/components/admin/media-lightbox"
import { useT } from "@/components/layout/trans"
import { Upload } from "lucide-react"
import { formatUtcDateTime } from "@/lib/date"

export function MediaListSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
        >
          <Skeleton className="size-10 shrink-0 rounded-md" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden sm:block h-3.5 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  )
}

export function MediaList({
  files,
  isUploading,
  onUploadClick,
  onPreview,
  onCopyUrl,
  onCopyMarkdown,
  onDelete,
}: {
  files: MediaFile[]
  isUploading: boolean
  onUploadClick: () => void
  onPreview: (file: MediaFile) => void
  onCopyUrl: (url: string) => void
  onCopyMarkdown: (url: string) => void
  onDelete: (file: MediaFile) => void
}) {
  const { t } = useT()

  // List view — compact rows with small thumbnails. h-14 matches
  // py-2 + size-10 thumb so the upload row is equal width & height.
  return (
    <div className="flex flex-col gap-1.5">
      {/* Upload row — first position, same footprint as media rows */}
      <button
        type="button"
        disabled={isUploading}
        onClick={onUploadClick}
        className="flex h-14 w-full items-center gap-3 rounded-lg border border-dashed border-muted-foreground/25 bg-card px-3 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30 hover:text-foreground disabled:opacity-60 cursor-pointer"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 bg-muted/30">
          <Upload size={15} />
        </span>
        <span className="text-sm font-medium">
          {t("admin.uploadImage")}
        </span>
      </button>
      {files.map((file) => (
        <div
          key={file.url}
          className="group flex h-14 w-full items-center gap-3 rounded-lg border bg-card px-3 transition-colors hover:border-primary/20"
        >
          <button
            type="button"
            aria-label={t("admin.viewFullImage")}
            onClick={() => onPreview(file)}
            className="shrink-0 cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.url}
              alt={file.name || (t("admin.uploadedImageAlt"))}
              className="size-10 rounded-md object-cover bg-muted"
              loading="lazy"
            />
          </button>
          <button
            type="button"
            onClick={() => onPreview(file)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium cursor-pointer hover:underline"
          >
            {file.name}
          </button>
          <span className="hidden sm:block w-24 shrink-0 text-xs text-muted-foreground text-right">
            {file.createdAt ? formatUtcDateTime(file.createdAt) : ""}
          </span>
          <MediaRowActions
            file={file}
            onCopyUrl={onCopyUrl}
            onCopyMarkdown={onCopyMarkdown}
            onDelete={onDelete}
          />
        </div>
      ))}
    </div>
  )
}
