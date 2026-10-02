"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { formatUtcTimestamp } from "@/lib/date"
import { MarkdownPreview } from "@/components/admin/markdown-preview"

type RevisionSummary = {
  id: number
  slug: string
  title: string
  draft: boolean
  wordCount: number
  createdAt: string
}

type RevisionDetail = RevisionSummary & { content: string }

interface PostHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current persisted slug (not the editor's possibly-unsaved input). */
  slug: string
  /** Restore the given revision. Supplied by the editor so it can first
   *  persist unsaved local edits; returns false on failure (the caller
   *  has already surfaced a toast). */
  onRestore: (id: number) => Promise<boolean>
}

/** 文章历史版本（编辑器 HeaderActions 的「历史」入口）。列表 → 预览/恢复。
 *  恢复不需要确认弹窗：恢复前的状态同样进快照，"恢复错了"再恢复一次
 *  即可回来（Google Docs 式的来回切换），toast 里也会说明这一点。 */
export function PostHistoryDialog({
  open,
  onOpenChange,
  slug,
  onRestore,
}: PostHistoryDialogProps) {
  const { t } = useT()
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [preview, setPreview] = useState<RevisionDetail | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [restoringId, setRestoringId] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // setState 全在 async 函数体内（set-state-in-effect 规则，同
    // post-traffic-panel 的 load()）：打开/换文章都重新拉一遍。
    async function load() {
      setRevisions(null)
      setFailed(false)
      setPreview(null)
      try {
        const res = await apiFetch(
          `/api/posts/revisions?slug=${encodeURIComponent(slug)}`
        )
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) setRevisions(data.revisions ?? [])
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, slug])

  async function openPreview(id: number) {
    setPreviewing(true)
    try {
      const res = await apiFetch(`/api/posts/revisions/${id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPreview(data.revision)
    } catch {
      toast.error(t("admin.historyLoadFailed"))
    } finally {
      setPreviewing(false)
    }
  }

  async function restore(id: number) {
    setRestoringId(id)
    const ok = await onRestore(id)
    setRestoringId(null)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(40rem,100%)]">
        <DialogHeader>
          <DialogTitle>{t("admin.historyTitle")}</DialogTitle>
          <DialogDescription>{t("admin.historyDesc")}</DialogDescription>
        </DialogHeader>

        {preview ? (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreview(null)}
              >
                <ArrowLeft size={14} />
                {t("admin.historyBack")}
              </Button>
              <span className="truncate text-xs text-muted-foreground">
                {formatUtcTimestamp(preview.createdAt)}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => void restore(preview.id)}
                disabled={restoringId !== null}
              >
                {restoringId === preview.id
                  ? t("admin.historyRestoring")
                  : t("admin.historyRestore")}
              </Button>
            </div>
            {/* 独立滚动区，长文预览不撑爆对话框（容器自带 max-h）。 */}
            <div className="min-w-0 max-h-[55dvh] overflow-y-auto rounded-md border border-border p-3">
              <MarkdownPreview content={preview.content} />
            </div>
          </div>
        ) : revisions === null ? (
          <div className="flex justify-center py-8">
            {failed ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.historyLoadFailed")}
              </p>
            ) : (
              <Spinner />
            )}
          </div>
        ) : revisions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("admin.historyEmpty")}
          </p>
        ) : (
          <ul className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto">
            {revisions.map((rev) => (
              <li
                key={rev.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {rev.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatUtcTimestamp(rev.createdAt)}
                    {" · "}
                    {t("admin.historyWords")(rev.wordCount)}
                  </div>
                </div>
                {rev.draft && (
                  <Badge variant="secondary">{t("admin.draft")}</Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void openPreview(rev.id)}
                  disabled={previewing || restoringId !== null}
                >
                  {t("admin.historyPreview")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void restore(rev.id)}
                  disabled={restoringId !== null}
                >
                  {restoringId === rev.id
                    ? t("admin.historyRestoring")
                    : t("admin.historyRestore")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
