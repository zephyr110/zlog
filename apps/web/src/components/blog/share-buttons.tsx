"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Link, Share2 } from "lucide-react"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { IconButton } from "@/components/ui/icon-button"
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard"

// 对话框（含 canvas 管线与二维码库）点击才加载，不进文章页首包
const ShareCardDialog = dynamic(
  () => import("./share-card-dialog").then((m) => m.ShareCardDialog),
  { ssr: false }
)

export function CopyLinkButton({ url }: { url: string }) {
  const { t } = useT()
  const { copy } = useCopyToClipboard()

  async function handleCopy() {
    const ok = await copy(window.location.origin + url)
    if (ok) {
      toast.success(t("post.linkCopied"))
    } else {
      toast.error(t("post.copyFailed"))
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <IconButton
            size="sm"
            bordered
            aria-label={t("post.copyLink")}
            onClick={handleCopy}
          >
            <Link size={14} />
          </IconButton>
        }
      />
      <TooltipContent>{t("post.copyLink")}</TooltipContent>
    </Tooltip>
  )
}

export function ShareCardButton({
  url,
  slug,
  title,
  date,
  siteName,
}: {
  /** 规范绝对地址（用于二维码，桌面壳内 window.location.origin 不可扫） */
  url: string
  slug: string
  title: string
  date: string
  siteName: string
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton
              size="sm"
              bordered
              aria-label={t("post.shareCard")}
              onClick={() => setOpen(true)}
            >
              <Share2 size={14} />
            </IconButton>
          }
        />
        <TooltipContent>{t("post.shareCard")}</TooltipContent>
      </Tooltip>
      {open && (
        <ShareCardDialog
          open
          onOpenChange={(next) => setOpen(next)}
          url={url}
          slug={slug}
          title={title}
          date={date}
          siteName={siteName}
        />
      )}
    </>
  )
}
