"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { computeReadingStats, type Post } from "@zlog/core"
import { MediaPickerDialog } from "@/components/admin/media-picker-dialog"
import {
  HeaderActions,
} from "@/components/admin/header-actions"
import { ExternalLink } from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  EditorToolbar,
  type ToolbarItem,
} from "@/components/admin/editor-toolbar"
import { MarkdownPreview } from "@/components/admin/markdown-preview"
import { PostMetaFields } from "@/components/admin/post-meta-fields"

interface PostEditorProps {
  initialPost?: Post
  isNew?: boolean
}

export function PostEditor({ initialPost, isNew = false }: PostEditorProps) {
  const { t } = useT()
  const router = useRouter()

  const [title, setTitle] = useState(initialPost?.title || "")
  const [slug, setSlug] = useState(initialPost?.slug || "")
  const [description, setDescription] = useState(initialPost?.description || "")
  const [content, setContent] = useState(initialPost?.content || "")
  const [tags, setTags] = useState<string[]>(initialPost?.tags || [])
  const [tagInput, setTagInput] = useState("")
  const [cover, setCover] = useState(initialPost?.cover || "")
  const [draft, setDraft] = useState(initialPost?.draft ?? true)
  const [saving, setSaving] = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const desktopContentRef = useRef<HTMLTextAreaElement>(null)
  const mobileContentRef = useRef<HTMLTextAreaElement>(null)

  // Baseline for "unsaved changes": the LAST successfully persisted state
  // (not the initial fetch) — otherwise auto-save would re-PUT the
  // identical body every 30s forever, bumping updated_at each time.
  const savedSnapshotRef = useRef<{
    title: string
    slug: string
    description: string
    content: string
    tags: string[]
    cover: string
    draft: boolean
  } | null>(
    initialPost
      ? {
          title: initialPost.title,
          slug: initialPost.slug,
          description: initialPost.description,
          content: initialPost.content,
          tags: initialPost.tags,
          cover: initialPost.cover || "",
          draft: initialPost.draft,
        }
      : null
  )

  // Track unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    const initial = savedSnapshotRef.current
    if (!initial && isNew) {
      return (
        title !== "" ||
        slug !== "" ||
        description !== "" ||
        content !== "" ||
        tags.length > 0 ||
        cover !== ""
      )
    }
    if (!initial) return false
    return (
      title !== initial.title ||
      slug !== initial.slug ||
      description !== initial.description ||
      content !== initial.content ||
      tags.join(",") !== initial.tags.join(",") ||
      cover !== (initial.cover || "") ||
      draft !== initial.draft
    )
  }, [title, slug, description, content, tags, cover, draft, isNew])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault()
        e.returnValue = ""
      }
    }

    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [hasUnsavedChanges])

  // Keep a ref to the latest savePost so the keyboard shortcut doesn't
  // re-register on every render or close over stale state.
  const savePostRef = useRef(savePost)
  useEffect(() => {
    savePostRef.current = savePost
  })

  // Ctrl/Cmd+S shortcut — always save as draft, don't publish
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        savePostRef.current(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Auto-save draft every 30s when there are unsaved changes.
  // New posts are excluded — auto-saving would create the post early
  // and navigate away from the editor mid-typing.
  // Latest state is read via refs so the interval stays stable
  // (hasUnsavedChanges changes on every keystroke — a dependency here
  // would reset the timer continuously and auto-save would never fire
  // while the user is typing).
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges)
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])
  const savingRef = useRef(saving)
  useEffect(() => {
    savingRef.current = saving
  }, [saving])
  const autoSavedRef = useRef(false)
  useEffect(() => {
    if (isNew) return
    const interval = setInterval(() => {
      if (hasUnsavedChangesRef.current() && !savingRef.current) {
        autoSavedRef.current = true
        savePostRef.current(false, true)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [isNew])

  // Word / char count — shared CJK-aware stats (same as API persist path)
  const { wordCount, readingTime: readTime } = computeReadingStats(content)
  const charCount = content.length

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newTitle = e.target.value
    setTitle(newTitle)
    if (isNew && !slug) {
      setSlug(
        newTitle
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 80)
      )
    }
  }

  function addTag() {
    const raw = tagInput.trim().toLowerCase()
    if (!raw) {
      setTagInput("")
      return
    }
    const newTags = raw
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter((t) => t && !tags.includes(t))
    if (newTags.length) {
      setTags([...tags, ...newTags])
    }
    setTagInput("")
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag()
    }
  }

  /** The currently visible content textarea (split view vs mobile tabs). */
  function getActiveTextarea(): HTMLTextAreaElement | null {
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
    return isDesktop ? desktopContentRef.current : mobileContentRef.current
  }

  /** Insert markdown at the current textarea cursor position. */
  function insertAtCursor(text: string) {
    const textarea = getActiveTextarea()
    const start = textarea?.selectionStart ?? content.length
    const end = textarea?.selectionEnd ?? content.length
    const next = content.slice(0, start) + text + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => {
      if (!textarea) return
      textarea.focus()
      const pos = start + text.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  function applyToolbar(item: ToolbarItem) {
    const textarea = getActiveTextarea()
    const start = textarea?.selectionStart ?? content.length
    const end = textarea?.selectionEnd ?? content.length
    const selected = content.slice(start, end)

    if (item.inline) {
      const inner = selected || (t("admin.linkText"))
      insertAtCursor(item.prefix + inner + (item.suffix ?? ""))
      return
    }

    insertAtCursor(item.prefix + selected + (item.suffix ?? ""))
  }

  function insertImage(url: string) {
    insertAtCursor(`![${t("admin.uploadedImageAlt")}](${url})`)
  }

  async function savePost(publish = false, silent = false) {
    setSaving(true)

    const postData = {
      title,
      slug,
      description,
      content,
      tags,
      cover,
      draft: publish ? false : draft,
    }

    try {
      const url = isNew
        ? "/api/posts"
        : `/api/posts?slug=${encodeURIComponent(initialPost?.slug || "")}`
      const method = isNew ? "POST" : "PUT"

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postData),
      })

      if (res.ok) {
        const data = await res.json()
        const savedDraft = data.post.draft ?? draft
        setDraft(savedDraft)
        // Re-baseline: what was just persisted is now "clean", so the
        // auto-save interval and the beforeunload prompt stop firing
        // until the user actually edits something.
        savedSnapshotRef.current = {
          title,
          slug,
          description,
          content,
          tags,
          cover: cover || "",
          draft: savedDraft,
        }
        if (publish) {
          toast.success(t("admin.publishSuccess"))
        } else if (!silent) {
          toast.success(
            savedDraft
              ? (t("admin.draftSaved"))
              : (t("admin.postUpdated"))
          )
        } else if (autoSavedRef.current) {
          autoSavedRef.current = false
          toast.success(t("admin.autoSaved"))
        }
        if (isNew) {
          router.push(
            `/admin/posts/edit?slug=${encodeURIComponent(data.post.slug)}`
          )
        }
        router.refresh()
      } else {
        const err = await res.json()
        if (!silent) {
          toast.error(err.error || (t("admin.failedToSavePost")))
        }
      }
    } catch {
      if (!silent) {
        toast.error(t("admin.networkErrorSave"))
      }
    } finally {
      setSaving(false)
      autoSavedRef.current = false
    }
  }

  const previewPanel = <MarkdownPreview content={content} />

  return (
    <div className="space-y-6">
      {/* Title lives in admin layout pageMeta; actions portal in. */}
      <HeaderActions>
        {!isNew && !draft && (
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={`/posts/${encodeURIComponent(slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("admin.viewOnline")}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <ExternalLink size={14} />
                </a>
              }
            />
            <TooltipContent>{t("admin.viewOnline")}</TooltipContent>
          </Tooltip>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => savePost(false)}
          disabled={saving}
        >
          {saving ? (
            t("admin.saving")
          ) : (
            <>
              <span className="sm:hidden">{t("admin.saveDraftShort")}</span>
              <span className="hidden sm:inline">{t("admin.saveDraft")}</span>
            </>
          )}
        </Button>
        <Button size="sm" onClick={() => savePost(true)} disabled={saving}>
          {saving ? t("admin.publishing") : t("admin.publish")}
        </Button>
      </HeaderActions>

      {/* Metadata — collapsible so the editor can focus on content */}
      <Card
        collapsible
        collapseLabel={t("admin.collapsePreview")}
        expandLabel={t("admin.expandPreview")}
      >
        <CardHeader>
          <CardTitle>{t("admin.postDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PostMetaFields
            title={title}
            onTitleChange={handleTitleChange}
            slug={slug}
            onSlugChange={setSlug}
            cover={cover}
            onCoverChange={setCover}
            onPickCover={() => setCoverPickerOpen(true)}
            description={description}
            onDescriptionChange={setDescription}
            tags={tags}
            tagInput={tagInput}
            onTagInputChange={setTagInput}
            onTagKeyDown={handleTagKeyDown}
            onAddTag={addTag}
            onRemoveTag={removeTag}
          />
        </CardContent>
      </Card>

      {/* Content Editor — split view on desktop, tabs on mobile */}
      <Card>
        <CardContent className="pt-6">
          <EditorToolbar
            onApplyToolbar={applyToolbar}
            onInsertImage={() => setImagePickerOpen(true)}
            previewCollapsed={previewCollapsed}
            onTogglePreview={() => setPreviewCollapsed(!previewCollapsed)}
          />

          {/* Split view (lg+) — preview left, editor right. Keep the preview
              mounted and shrink its track to 0fr so collapse/expand animates. */}
          <div
            className={cn(
              "hidden lg:grid transition-[grid-template-columns,gap] duration-300 ease-in-out",
              previewCollapsed
                ? "grid-cols-[0fr_minmax(0,1fr)] gap-0"
                : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4"
            )}
          >
            <div
              className={cn(
                "min-w-0 overflow-hidden transition-opacity duration-300 ease-in-out",
                previewCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
              )}
              aria-hidden={previewCollapsed}
              inert={previewCollapsed}
            >
              {previewPanel}
            </div>
            <Textarea
              ref={desktopContentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("admin.contentPlaceholder")}
              className="font-mono min-h-[400px] lg:min-h-[calc(100vh-24rem)] resize-y"
            />
          </div>

          {/* Tabs (mobile) */}
          <Tabs defaultValue="edit" className="lg:hidden">
            <TabsList className="mb-4">
              <TabsTrigger value="edit">{t("admin.editTab")}</TabsTrigger>
              <TabsTrigger value="preview">{t("admin.previewTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <Textarea
                ref={mobileContentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("admin.contentPlaceholder")}
                className="font-mono min-h-[400px]"
              />
            </TabsContent>
            <TabsContent value="preview">{previewPanel}</TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground mt-2">
            {t("admin.editHint")}
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{t("post.chars")(charCount)}</span>
        <span>{t("post.words")(wordCount)}</span>
        <span>{t("post.readTime")(readTime)}</span>
      </div>

      {/* Status */}
      <div className={cn("flex items-center gap-3 text-sm text-muted-foreground rounded-lg border bg-card p-3")}>
        <Badge
          variant={draft ? "secondary" : "default"}
          className={
            draft
              ? "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
          }
        >
          {draft
            ? (t("admin.draft"))
            : (t("admin.publishedStatus"))}
        </Badge>
        <span>
          {draft
            ? (t("admin.draftDesc"))
            : (t("admin.publishedDesc"))}
        </span>
      </div>

      <MediaPickerDialog
        open={coverPickerOpen}
        onOpenChange={setCoverPickerOpen}
        onSelect={setCover}
      />
      <MediaPickerDialog
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        onSelect={insertImage}
      />
    </div>
  )
}
