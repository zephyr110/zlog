"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { ImagePlus } from "lucide-react"
import { useT } from "@/components/layout/trans"

interface PostMetaFieldsProps {
  title: string
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  slug: string
  onSlugChange: (value: string) => void
  cover: string
  onCoverChange: (value: string) => void
  onPickCover: () => void
  description: string
  onDescriptionChange: (value: string) => void
  tags: string[]
  tagInput: string
  onTagInputChange: (value: string) => void
  onTagKeyDown: (e: React.KeyboardEvent) => void
  onAddTag: () => void
  onRemoveTag: (tag: string) => void
}

export function PostMetaFields({
  title,
  onTitleChange,
  slug,
  onSlugChange,
  cover,
  onCoverChange,
  onPickCover,
  description,
  onDescriptionChange,
  tags,
  tagInput,
  onTagInputChange,
  onTagKeyDown,
  onAddTag,
  onRemoveTag,
}: PostMetaFieldsProps) {
  const { t } = useT()

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="title">{t("admin.title")}</Label>
        <Input
          id="title"
          value={title}
          onChange={onTitleChange}
          placeholder={t("admin.title")}
          className="text-lg"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="slug">{t("admin.slug")}</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            placeholder={t("admin.slugPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cover">{t("admin.coverImage")}</Label>
          <div className="flex gap-2">
            <Input
              id="cover"
              value={cover}
              onChange={(e) => onCoverChange(e.target.value)}
              placeholder={t("admin.coverPlaceholder")}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label={t("admin.pickCoverImage")}
                    onClick={onPickCover}
                  >
                    <ImagePlus size={16} />
                  </Button>
                }
              />
              <TooltipContent>
                {t("admin.pickCoverImage")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {cover && (
        <div className="relative rounded-lg border overflow-hidden max-h-48 bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            className="w-full h-48 object-cover"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = "none"
            }}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description">{t("admin.description")}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t("admin.description")}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("admin.tags")}</Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => onTagInputChange(e.target.value)}
            onKeyDown={onTagKeyDown}
            placeholder={t("admin.addTag")}
            className="flex-1"
          />
          <Button variant="outline" onClick={onAddTag} type="button">
            {t("admin.addTagButton")}
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer group/tag hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={() => onRemoveTag(tag)}
              >
                {tag}
                <span className="ml-1 text-muted-foreground group-hover/tag:text-destructive">
                  ×
                </span>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
