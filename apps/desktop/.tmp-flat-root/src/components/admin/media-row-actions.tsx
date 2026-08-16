"use client"

import { Copy, FileCode, Trash2 } from "lucide-react"
import { useT } from "@/components/layout/trans"
import type { MediaFile } from "@/components/admin/media-lightbox"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { IconButton } from "@/components/ui/icon-button"

/** Compact icon action row (copy URL / copy MD / delete), shared by the
 *  grid cards and the list rows. */
export function MediaRowActions({
  file,
  onCopyUrl,
  onCopyMarkdown,
  onDelete,
}: {
  file: MediaFile
  onCopyUrl: (url: string) => void
  onCopyMarkdown: (url: string) => void
  onDelete: (file: MediaFile) => void
}) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton
              size="sm"
              aria-label={t("admin.copyURL")}
              onClick={() => onCopyUrl(file.url)}
            >
              <Copy size={14} />
            </IconButton>
          }
        />
        <TooltipContent>{t("admin.copyURL")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton
              size="sm"
              aria-label={t("admin.copyMD")}
              onClick={() => onCopyMarkdown(file.url)}
            >
              <FileCode size={14} />
            </IconButton>
          }
        />
        <TooltipContent>{t("admin.copyMD")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton
              size="sm"
              aria-label={t("admin.deleteImage")}
              className="ml-auto hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(file)}
            >
              <Trash2 size={14} />
            </IconButton>
          }
        />
        <TooltipContent>{t("admin.deleteImage")}</TooltipContent>
      </Tooltip>
    </div>
  )
}
