"use client"

import { useCallback, useEffect, useState } from "react"
import { FolderGit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { HeaderActions } from "@/components/admin/header-actions"
import { ProjectRow } from "@/components/admin/project-row"
import { ProjectFormDialog } from "@/components/admin/project-form-dialog"
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { toast } from "sonner"
import { type Project } from "@zlog/database"

export default function AdminProjectsPage() {
  const { t } = useT()
  const site = useSiteConfig()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/projects")
      if (!res.ok) throw new Error("load failed")
      const data = await res.json()
      setProjects(data.projects ?? [])
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void load() // eslint-disable-line react-hooks/set-state-in-effect -- async fetch, same pattern as admin/media
  }, [load])

  /** 总开关：乐观更新 + 失败回滚。 */
  async function handleToggleEnabled(next: boolean) {
    const prev = site.projectsEnabled
    setTogglingEnabled(true)
    site.setSiteConfig((p) => ({ ...p, projectsEnabled: next }))
    try {
      const res = await apiFetch("/api/site-settings", {
        method: "PUT",
        body: JSON.stringify({ projectsEnabled: next }),
      })
      if (!res.ok) throw new Error("save failed")
      toast.success(t("admin.projectSaved") as string)
    } catch {
      site.setSiteConfig((p) => ({ ...p, projectsEnabled: prev }))
      toast.error(t("admin.networkError") as string)
    } finally {
      setTogglingEnabled(false)
    }
  }

  async function handleMove(project: Project, direction: "up" | "down") {
    setBusyId(project.id)
    try {
      const res = await apiFetch(`/api/admin/projects/${project.id}/move`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      })
      if (!res.ok) throw new Error("move failed")
      await load()
    } catch {
      toast.error(t("admin.networkError") as string)
    } finally {
      // 只清本行的 busy:期间其他行在途时,不能把它的控件提前放开(双提交)
      setBusyId((cur) => (cur === project.id ? null : cur))
    }
  }

  /** 可见性切换：乐观更新 + 失败回滚。 */
  async function handleToggleVisible(project: Project, visible: boolean) {
    const prevVisible = project.visible
    setBusyId(project.id)
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === project.id ? { ...p, visible } : p)) : prev
    )
    try {
      const res = await apiFetch(`/api/admin/projects/${project.id}`, {
        method: "PUT",
        body: JSON.stringify({ visible }),
      })
      if (!res.ok) throw new Error("save failed")
    } catch {
      setProjects((prev) =>
        prev
          ? prev.map((p) => (p.id === project.id ? { ...p, visible: prevVisible } : p))
          : prev
      )
      toast.error(t("admin.networkError") as string)
    } finally {
      // 只清本行的 busy:期间其他行在途时,不能把它的控件提前放开(双提交)
      setBusyId((cur) => (cur === project.id ? null : cur))
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await apiFetch(`/api/admin/projects/${deleting.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("delete failed")
      toast.success(t("admin.projectDeleted") as string)
      setDeleting(null)
      await load()
    } catch {
      toast.error(t("admin.networkError") as string)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <HeaderActions>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <FolderGit2 size={14} />
          {t("admin.newProject") as string}
        </Button>
      </HeaderActions>

      {/* 总开关卡片 */}
      <Card>
        <CardContent className="flex items-start justify-between gap-6 pt-6">
          <div className="space-y-1">
            <Label htmlFor="projects-enabled" className="text-sm font-medium">
              {t("admin.projectsEnabled") as string}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("admin.projectsEnabledHint") as string}
            </p>
          </div>
          <Switch
            id="projects-enabled"
            checked={site.projectsEnabled}
            disabled={togglingEnabled}
            onCheckedChange={handleToggleEnabled}
            aria-label={t("admin.projectsEnabled") as string}
          />
        </CardContent>
      </Card>

      {/* 列表 */}
      {error ? (
        <EmptyState
          icon={<FolderGit2 className="size-8" />}
          title={t("admin.loadFailed") as string}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t("admin.retry") as string}
            </Button>
          }
        />
      ) : projects === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 className="size-8" />}
          title={t("admin.projectEmpty") as string}
          description={t("admin.projectEmptyHint") as string}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              {t("admin.newProject") as string}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {projects.map((project, index) => (
            <ProjectRow
              key={project.id}
              project={project}
              isFirst={index === 0}
              isLast={index === projects.length - 1}
              busy={busyId === project.id}
              onMove={(direction) => void handleMove(project, direction)}
              onToggleVisible={(visible) => void handleToggleVisible(project, visible)}
              onEdit={() => {
                setEditing(project)
                setFormOpen(true)
              }}
              onDelete={() => setDeleting(project)}
            />
          ))}
        </div>
      )}

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editing}
        onSaved={() => void load()}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        onConfirm={handleDelete}
        busy={deleteBusy}
        title={t("admin.deleteProjectTitle") as string}
        description={
          deleting
            ? (t("admin.deleteProjectDesc") as (title: string) => string)(deleting.title)
            : ""
        }
      />
    </div>
  )
}
