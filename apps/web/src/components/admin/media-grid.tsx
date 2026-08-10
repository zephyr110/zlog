"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MediaRowActions } from "@/components/admin/media-row-actions"
import type { MediaFile } from "@/components/admin/media-lightbox"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { useT } from "@/components/layout/trans"
import { Upload, Trash2 } from "lucide-react"
import { formatUtcDateTime } from "@/lib/date"

export function MediaGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex aspect-[4/3] flex-col overflow-hidden rounded-xl border bg-card"
        >
          <Skeleton className="min-h-0 flex-1 rounded-none" />
          <div className="shrink-0 space-y-1 border-t p-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function MediaGrid({
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

  // Whole tile is 4:3 (flat) — image + meta share the box so upload
  // and media cards stay the same size. auto-fill ~200px min.
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-5">
      {/* Upload tile — same 4:3 footprint as media cards */}
      <button
        type="button"
        disabled={isUploading}
        onClick={onUploadClick}
        className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30 hover:text-foreground disabled:opacity-60 cursor-pointer"
      >
        <Upload
          size={22}
          className="transition-transform duration-300 group-hover:scale-110"
        />
        <span className="text-xs font-medium">
          {t("admin.uploadImage")}
        </span>
      </button>
      {files.map((file) => (
        <Card
          key={file.url}
          size="sm"
          className="group aspect-[4/3] gap-0 py-0 hover:ring-foreground/20 transition-colors"
        >
          <div
            role="button"
            tabIndex={0}
            aria-label={t("admin.viewFullImage")}
            onClick={() => onPreview(file)}
            onKeyDown={(e) => {
              // Ignore keydowns from nested interactive elements
              // (e.g. the delete button) so they don't also open preview.
              if (e.target !== e.currentTarget) return
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onPreview(file)
              }
            }}
            className="relative min-h-0 flex-1 cursor-zoom-in bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.url}
              alt={file.name || (t("admin.uploadedImageAlt"))}
              className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = "none"
              }}
            />
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
            <button
              type="button"
              aria-label={t("admin.deleteImage")}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(file)
              }}
              className="absolute top-2 right-2 inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-red-500/80 group-hover:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <CardContent className="shrink-0 space-y-1 border-t p-2">
            <Tooltip>
              <TooltipTrigger
                render={<p className="truncate text-xs font-medium">{file.name}</p>}
              />
              <TooltipContent>{file.name}</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-1">
              <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {file.createdAt ? formatUtcDateTime(file.createdAt) : " "}
              </p>
              <MediaRowActions
                file={file}
                onCopyUrl={onCopyUrl}
                onCopyMarkdown={onCopyMarkdown}
                onDelete={onDelete}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
