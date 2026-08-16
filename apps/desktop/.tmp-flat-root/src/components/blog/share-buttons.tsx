"use client"

import { Link } from "lucide-react"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { IconButton } from "@/components/ui/icon-button"
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard"

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
