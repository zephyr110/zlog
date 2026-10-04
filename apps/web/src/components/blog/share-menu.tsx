"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Image as ImageIcon, Link, Share2 } from "lucide-react"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { IconButton } from "@/components/ui/icon-button"
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard"

// 对话框（含 canvas 管线与二维码库）点击才加载，不进文章页首包
const ShareCardDialog = dynamic(
  () => import("./share-card-dialog").then((m) => m.ShareCardDialog),
  { ssr: false }
)

/**
 * 分享入口：单个「分享」按钮 → 菜单（复制链接 / 生成分享卡）。
 * 链接与海报是同一意图的两种载体（URL 文本 vs 海报图），收进一个
 * 菜单，避免两个并列图标在标题区造成「都是分享」的语义重叠。
 */
export function ShareMenu({
  url,
  path,
  slug,
  title,
  date,
}: {
  /** 规范绝对地址（分享卡二维码内容；桌面壳内 window.location.origin 不可扫） */
  url: string
  /** 站内相对路径：复制链接用当前 origin 拼接 */
  path: string
  slug: string
  title: string
  date: string
}) {
  const { t } = useT()
  const { copy } = useCopyToClipboard()
  const [cardOpen, setCardOpen] = useState(false)

  async function handleCopy() {
    const ok = await copy(window.location.origin + path)
    if (ok) {
      toast.success(t("post.linkCopied"))
    } else {
      toast.error(t("post.copyFailed"))
    }
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <IconButton size="sm" bordered aria-label={t("post.share")}>
                    <Share2 size={14} />
                  </IconButton>
                }
              />
            }
          />
          <TooltipContent>{t("post.share")}</TooltipContent>
        </Tooltip>
        {/* 覆盖菜单默认的 anchor 宽度（否则跟图标按钮一样窄） */}
        <DropdownMenuContent className="w-auto min-w-36">
          <DropdownMenuItem onClick={handleCopy}>
            <Link size={14} />
            {t("post.copyLink")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCardOpen(true)}>
            <ImageIcon size={14} />
            {t("post.shareCard")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {cardOpen && (
        <ShareCardDialog
          open
          onOpenChange={(next) => setCardOpen(next)}
          url={url}
          slug={slug}
          title={title}
          date={date}
        />
      )}
    </>
  )
}
