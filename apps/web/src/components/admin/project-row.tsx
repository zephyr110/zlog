"use client"

import { ArrowDown, ArrowUp, FolderGit2, SquarePen, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { IconButton } from "@/components/ui/icon-button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useT } from "@/components/layout/trans"
import { type Project } from "@zlog/database"

interface ProjectRowProps {
  project: Project
  isFirst: boolean
  isLast: boolean
  busy: boolean
  onMove: (direction: "up" | "down") => void
  onToggleVisible: (visible: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

export function ProjectRow({
  project,
  isFirst,
  isLast,
  busy,
  onMove,
  onToggleVisible,
  onEdit,
  onDelete,
}: ProjectRowProps) {
  const { t } = useT()
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border bg-card p-3 transition-opacity",
        !project.visible && "opacity-60"
      )}
    >
      {/* 封面缩略图（无封面 → 渐变占位） */}
      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md">
        {project.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- media-picker 产出 jsdelivr 外链，无需优化器
          <img
            src={project.cover}
            alt=""
            className={cn("h-full w-full object-cover", !project.visible && "grayscale")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1c2333] via-[#2b3a67] to-[#131822]">
            <FolderGit2 className="size-6 text-white/70" aria-hidden />
          </div>
        )}
      </div>

      {/* 标题 + 简介 + 标签 */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium">{project.title}</p>
        {project.description && (
          <p className="truncate text-sm text-muted-foreground">{project.description}</p>
        )}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* 操作区：上架开关 → 上移/下移 → 编辑 → 删除 */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Switch
          checked={project.visible}
          disabled={busy}
          onCheckedChange={(checked) => onToggleVisible(checked)}
          aria-label={`${t("admin.projectVisible") as string}: ${project.title}`}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <IconButton
                size="sm"
                aria-label={t("admin.moveUp") as string}
                disabled={busy || isFirst}
                onClick={() => onMove("up")}
              >
                <ArrowUp size={14} />
              </IconButton>
            }
          />
          <TooltipContent>{t("admin.moveUp") as string}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <IconButton
                size="sm"
                aria-label={t("admin.moveDown") as string}
                disabled={busy || isLast}
                onClick={() => onMove("down")}
              >
                <ArrowDown size={14} />
              </IconButton>
            }
          />
          <TooltipContent>{t("admin.moveDown") as string}</TooltipContent>
        </Tooltip>
        <IconButton size="sm" aria-label={t("admin.editProject") as string} onClick={onEdit}>
          <SquarePen size={14} />
        </IconButton>
        <IconButton
          size="sm"
          aria-label={t("admin.delete") as string}
          onClick={onDelete}
          className="hover:text-destructive"
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  )
}
