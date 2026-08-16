"use client"

import { Inbox } from "lucide-react"
import { useT } from "@/components/layout/trans"
import { cn } from "@/lib/utils"

type AdminBlockEmptyProps = {
  /** Extra classes on the outer flex box (e.g. min-h for chart cards). */
  className?: string
}

/**
 * Compact empty placeholder for admin cards/blocks — Inbox + “暂无数据”,
 * centered both axes. Errors should use their own messaging instead.
 */
export function AdminBlockEmpty({ className }: AdminBlockEmptyProps) {
  const { t } = useT()
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-8 text-muted-foreground",
        className
      )}
    >
      <Inbox className="size-8 shrink-0 opacity-50" aria-hidden />
      <p className="text-sm">{t("admin.noData")}</p>
    </div>
  )
}
