"use client"

import { useEffect, useState } from "react"
import { ImageIcon, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { MediaPickerDialog } from "@/components/admin/media-picker-dialog"
import { OpenUrlButton, externalHref } from "@/components/admin/open-url-button"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { type Project } from "@zlog/database"

const MAX_TAGS = 8
const MAX_TAG_LENGTH = 24

interface FormState {
  title: string
  description: string
  repoUrl: string
  demoUrl: string
  cover: string
  tags: string[]
  visible: boolean
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  repoUrl: "",
  demoUrl: "",
  cover: "",
  tags: [],
  visible: true,
}

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = 新建 */
  project: Project | null
  onSaved: () => void
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: ProjectFormDialogProps) {
  const { t } = useT()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [tagDraft, setTagDraft] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // 打开时按 project 重置（新建 → 空表单）
  useEffect(() => {
    if (!open) return
    setForm( // eslint-disable-line react-hooks/set-state-in-effect -- one-time reset when the dialog opens
      project
        ? {
            title: project.title,
            description: project.description,
            repoUrl: project.repoUrl,
            demoUrl: project.demoUrl,
            cover: project.cover,
            tags: project.tags,
            visible: project.visible,
          }
        : EMPTY_FORM
    )
    setTagDraft("")
  }, [open, project])

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addTag(raw: string) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH)
    setTagDraft("")
    if (!tag || form.tags.includes(tag) || form.tags.length >= MAX_TAGS) return
    patch("tags", [...form.tags, tag])
  }

  function removeTag(tag: string) {
    patch("tags", form.tags.filter((x) => x !== tag))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const body = JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        repoUrl: form.repoUrl.trim(),
        demoUrl: form.demoUrl.trim(),
        cover: form.cover.trim(),
        tags: form.tags,
        visible: form.visible,
      })
      const res = project
        ? await apiFetch(`/api/admin/projects/${project.id}`, { method: "PUT", body })
        : await apiFetch("/api/admin/projects", { method: "POST", body })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "save failed")
      }
      toast.success(
        t(project ? "admin.projectSaved" : "admin.projectCreated") as string
      )
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error(t("admin.networkError") as string)
    } finally {
      setSaving(false)
    }
  }

  const canSave = form.title.trim().length > 0 && !saving

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(32rem,100%)]">
          <DialogHeader>
            <DialogTitle>
              {t(project ? "admin.editProject" : "admin.newProject") as string}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 标题 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-title">{t("admin.projectTitle") as string}</Label>
              <Input
                id="project-title"
                value={form.title}
                maxLength={80}
                onChange={(e) => patch("title", e.target.value)}
                placeholder={t("admin.projectTitlePlaceholder") as string}
              />
            </div>

            {/* 简介 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-description">
                {t("admin.projectDescription") as string}
              </Label>
              <Textarea
                id="project-description"
                value={form.description}
                maxLength={200}
                rows={2}
                onChange={(e) => patch("description", e.target.value)}
                placeholder={t("admin.projectDescriptionPlaceholder") as string}
              />
              <p className="text-right text-xs text-muted-foreground">
                {form.description.length}/200
              </p>
            </div>

            {/* GitHub 仓库 + 演示 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-repo">{t("admin.projectRepoUrl") as string}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="project-repo"
                  value={form.repoUrl}
                  onChange={(e) => patch("repoUrl", e.target.value)}
                  placeholder="https://github.com/…"
                />
                <OpenUrlButton
                  href={externalHref(form.repoUrl)}
                  label={t("admin.openUrl") as string}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-demo">{t("admin.projectDemoUrl") as string}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="project-demo"
                  value={form.demoUrl}
                  onChange={(e) => patch("demoUrl", e.target.value)}
                  placeholder="https://…"
                />
                <OpenUrlButton
                  href={externalHref(form.demoUrl)}
                  label={t("admin.openUrl") as string}
                />
              </div>
            </div>

            {/* 封面 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-cover">{t("admin.projectCover") as string}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="project-cover"
                  value={form.cover}
                  onChange={(e) => patch("cover", e.target.value)}
                  placeholder={t("admin.projectCoverPlaceholder") as string}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => setPickerOpen(true)}
                >
                  <ImageIcon size={14} />
                  {t("admin.projectCoverPick") as string}
                </Button>
              </div>
              {form.cover && (
                <div className="relative mt-1.5 aspect-video w-full overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- jsdelivr 外链 */}
                  <img src={form.cover} alt="" className="h-full w-full object-cover" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="absolute right-1.5 top-1.5"
                    onClick={() => patch("cover", "")}
                  >
                    <X size={12} />
                    {t("admin.projectCoverRemove") as string}
                  </Button>
                </div>
              )}
            </div>

            {/* 技术栈标签 */}
            <div className="space-y-1.5">
              <Label htmlFor="project-tags">{t("admin.projectTags") as string}</Label>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={`${t("admin.projectTagRemove") as string} ${tag}`}
                        onClick={() => removeTag(tag)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Input
                id="project-tags"
                value={tagDraft}
                disabled={form.tags.length >= MAX_TAGS}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addTag(tagDraft)
                  }
                }}
                placeholder={
                  form.tags.length >= MAX_TAGS
                    ? (t("admin.projectTagsLimit") as string)
                    : (t("admin.projectTagsHint") as string)
                }
              />
            </div>

            {/* 上架开关 */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="project-visible" className="text-sm font-medium">
                {t("admin.projectVisible") as string}
              </Label>
              <Switch
                id="project-visible"
                checked={form.visible}
                onCheckedChange={(checked) => patch("visible", checked)}
                aria-label={t("admin.projectVisible") as string}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("admin.cancel") as string}
            </Button>
            <Button size="sm" disabled={!canSave} onClick={() => void handleSave()}>
              {saving && <Spinner className="size-3.5" />}
              {t("admin.save") as string}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(url) => patch("cover", url)}
      />
    </>
  )
}
