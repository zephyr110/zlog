"use client"

import {
  Bold,
  Italic,
  Heading2,
  Link as LinkIcon,
  Image as ImageIcon,
  Code,
  List,
  ListOrdered,
  Quote,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { IconButton } from "@/components/ui/icon-button"
import { useT } from "@/components/layout/trans"
import type { TranslationPath } from "@/lib/i18n"

export interface ToolbarItem {
  key: string
  i18nKey: TranslationPath
  icon: LucideIcon
  /** Prefix inserted before selection */
  prefix: string
  /** Suffix inserted after selection */
  suffix?: string
  /** Wrap selection inline (for links) */
  inline?: boolean
}

const TOOLBAR: ToolbarItem[] = [
  { key: "bold", i18nKey: "admin.bold", icon: Bold, prefix: "**", suffix: "**" },
  { key: "italic", i18nKey: "admin.italic", icon: Italic, prefix: "*", suffix: "*" },
  { key: "heading", i18nKey: "admin.heading", icon: Heading2, prefix: "## " },
  { key: "quote", i18nKey: "admin.quote", icon: Quote, prefix: "> " },
  { key: "ul", i18nKey: "admin.unorderedList", icon: List, prefix: "- " },
  { key: "ol", i18nKey: "admin.orderedList", icon: ListOrdered, prefix: "1. " },
  { key: "code", i18nKey: "admin.codeBlock", icon: Code, prefix: "```\n", suffix: "\n```" },
  { key: "link", i18nKey: "admin.link", icon: LinkIcon, prefix: "[", suffix: "](https://)", inline: true },
]

interface EditorToolbarProps {
  onApplyToolbar: (item: ToolbarItem) => void
  onInsertImage: () => void
  previewCollapsed: boolean
  onTogglePreview: () => void
}

export function EditorToolbar({
  onApplyToolbar,
  onInsertImage,
  previewCollapsed,
  onTogglePreview,
}: EditorToolbarProps) {
  const { t } = useT()

  return (
    <div className="flex items-center gap-0.5 mb-3 flex-wrap">
      {TOOLBAR.map((item) => {
        const Icon = item.icon
        return (
          <Tooltip key={item.key}>
            <TooltipTrigger
              render={
                <IconButton
                  size="sm"
                  aria-label={t(item.i18nKey) as string}
                  onClick={() => onApplyToolbar(item)}
                >
                  <Icon size={15} />
                </IconButton>
              }
            />
            <TooltipContent>
              {t(item.i18nKey) as string}
            </TooltipContent>
          </Tooltip>
        )
      })}
      <span className="w-px h-5 bg-border mx-1" />
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton
              size="sm"
              aria-label={t("admin.insertImage")}
              onClick={onInsertImage}
            >
              <ImageIcon size={15} />
            </IconButton>
          }
        />
        <TooltipContent>
          {t("admin.insertImage")}
        </TooltipContent>
      </Tooltip>
      {/* lg+ 分栏才用 eye；移动端已有 Edit/Preview 滑块，再放会重复且点了无效 */}
      <div className="hidden lg:flex items-center gap-0.5">
        <span className="w-px h-5 bg-border mx-1" />
        <Tooltip>
          <TooltipTrigger
            render={
              <IconButton
                size="sm"
                aria-label={
                  previewCollapsed
                    ? (t("admin.expandPreview"))
                    : (t("admin.collapsePreview"))
                }
                onClick={onTogglePreview}
                className={
                  previewCollapsed
                    ? "text-primary bg-primary/10 hover:bg-primary/15"
                    : undefined
                }
              >
                {previewCollapsed ? (
                  <Eye size={15} />
                ) : (
                  <EyeOff size={15} />
                )}
              </IconButton>
            }
          />
          <TooltipContent>
            {previewCollapsed
              ? (t("admin.expandPreview"))
              : (t("admin.collapsePreview"))}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
