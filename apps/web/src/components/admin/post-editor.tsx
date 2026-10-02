"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { apiFetch } from "@/lib/api-client"
import { fromPublishAtUtc, isScheduled, toPublishAtUtc } from "@/lib/schedule"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { computeReadingStats, type Post } from "@zlog/core"
import { MediaPickerDialog } from "@/components/admin/media-picker-dialog"
import { uploadImageFile, validateImageFile } from "@/lib/upload"
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

/** localStorage key for the in-progress NEW post draft. New posts are
 *  excluded from the 30s server auto-save (it would create the post
 *  early), so a closed tab used to lose the whole article — this key
 *  keeps the content itself. Cleared on successful create. */
const NEW_POST_DRAFT_KEY = "zlog:new-post-draft"

interface NewPostDraft {
  title: string
  slug: string
  description: string
  content: string
  tags: string[]
  cover: string
  savedAt: number
}

/** Content textarea with image paste / drag-drop upload. Both entry
 *  points funnel `File[]` to the parent, which uploads via /api/upload
 *  and inserts the markdown at the cursor. */
function ContentTextarea({
  textareaRef,
  value,
  onChange,
  onImageFiles,
  placeholder,
  className,
  dragHint,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onImageFiles: (files: File[]) => void
  placeholder?: string
  className?: string
  dragHint: string
}) {
  const [dragActive, setDragActive] = useState(false)

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.items ?? [])
            .filter(
              (item) => item.kind === "file" && item.type.startsWith("image/")
            )
            .map((item) => item.getAsFile())
            .filter((f): f is File => f !== null)
          if (!files.length) return
          // Swallow the paste: the image is uploaded and inserted as
          // markdown instead of pasting a broken blob/HTML fragment.
          e.preventDefault()
          onImageFiles(files)
        }}
        onDragOver={(e) => {
          // Only claim file drags — text drags keep the default behavior.
          if (!Array.from(e.dataTransfer.types).includes("Files")) return
          e.preventDefault()
          e.dataTransfer.dropEffect = "copy"
          if (!dragActive) setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          setDragActive(false)
          const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
            f.type.startsWith("image/")
          )
          if (!files.length) return
          // Must preventDefault: the browser default for a dropped file
          // is to navigate away and lose the editor state.
          e.preventDefault()
          onImageFiles(files)
        }}
      />
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-primary/5 ring-2 ring-primary">
          <span className="rounded-md border bg-background/95 px-3 py-1 text-xs shadow-sm">
            {dragHint}
          </span>
        </div>
      )}
    </div>
  )
}

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
  // Local "YYYY-MM-DDTHH:mm" as the datetime-local input speaks it; the
  // UTC <-> local conversion lives in lib/schedule.
  const [publishAt, setPublishAt] = useState(
    fromPublishAtUtc(initialPost?.publishAt)
  )
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
    publishAt: string
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
          publishAt: fromPublishAtUtc(initialPost.publishAt),
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
      draft !== initial.draft ||
      publishAt !== initial.publishAt
    )
  }, [title, slug, description, content, tags, cover, draft, publishAt, isNew])

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

  // New-post anti-loss: mirror the in-progress draft to localStorage
  // (debounced, in the effect below) and offer to restore it on the next
  // visit. This effect is declared BEFORE the persist effect so the
  // restore's setState lands first — otherwise the persist effect's
  // first empty-state timer could clear the stored draft before it is
  // ever read.
  const draftRestoreCheckedRef = useRef(false)
  useEffect(() => {
    if (!isNew || draftRestoreCheckedRef.current) return
    draftRestoreCheckedRef.current = true
    let draft: Partial<NewPostDraft> | null = null
    try {
      const raw = localStorage.getItem(NEW_POST_DRAFT_KEY)
      draft = raw ? (JSON.parse(raw) as Partial<NewPostDraft>) : null
    } catch {
      draft = null
    }
    if (!draft || typeof draft !== "object") return
    const tags = Array.isArray(draft.tags)
      ? draft.tags.filter((x): x is string => typeof x === "string")
      : []
    const hasContent =
      [draft.title, draft.slug, draft.description, draft.content, draft.cover].some(
        (v) => typeof v === "string" && v.trim() !== ""
      ) || tags.length > 0
    if (!hasContent) {
      try {
        localStorage.removeItem(NEW_POST_DRAFT_KEY)
      } catch {
        // ignore
      }
      return
    }
    setTitle(draft.title ?? "") // eslint-disable-line react-hooks/set-state-in-effect -- one-time restore from localStorage
    setSlug(draft.slug ?? "")
    setDescription(draft.description ?? "")
    setContent(draft.content ?? "")
    setTags(tags)
    setCover(draft.cover ?? "")
    toast(t("admin.draftRestored"), {
      action: {
        label: t("admin.draftDiscard"),
        onClick: () => {
          try {
            localStorage.removeItem(NEW_POST_DRAFT_KEY)
          } catch {
            // ignore
          }
          setTitle("")
          setSlug("")
          setDescription("")
          setContent("")
          setTags([])
          setCover("")
        },
      },
    })
    // The discard action is inlined above so this effect needs no extra
    // dependency — and stays a one-time restore keyed on isNew only.
  }, [isNew, t])

  // Persist the new-post draft: trailing debounce (800ms after a pause)
  // PLUS a max-wait — a pure debounce never fires while the user types
  // continuously, so a crash mid-burst would lose everything written
  // since the burst began. The max-wait caps that window at 5s.
  // Seeded with mount time: a 0 would make the max-wait fire on the very
  // first effect run (empty state → removeItem) and wipe a stored draft
  // before the restore effect above ever reads it.
  const lastDraftWriteRef = useRef(Date.now())
  useEffect(() => {
    if (!isNew) return
    const write = () => {
      lastDraftWriteRef.current = Date.now()
      const hasContent =
        [title, slug, description, content, cover].some(
          (v) => v.trim() !== ""
        ) || tags.length > 0
      try {
        if (!hasContent) {
          localStorage.removeItem(NEW_POST_DRAFT_KEY)
          return
        }
        const draft: NewPostDraft = {
          title,
          slug,
          description,
          content,
          tags,
          cover,
          savedAt: Date.now(),
        }
        localStorage.setItem(NEW_POST_DRAFT_KEY, JSON.stringify(draft))
      } catch {
        // Quota / private mode: the beforeunload prompt still protects
        // the session — never break the editor over a storage failure.
      }
    }
    const MAX_WAIT_MS = 5_000
    if (Date.now() - lastDraftWriteRef.current >= MAX_WAIT_MS) write()
    const id = setTimeout(write, 800)
    return () => clearTimeout(id)
  }, [isNew, title, slug, description, content, tags, cover])

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

  /** Insert markdown at the current textarea cursor position. Reads the
   *  LIVE DOM value instead of the closure's `content`: image uploads are
   *  async and can run for a while — stitching from a stale snapshot
   *  would drop whatever the user typed in the meantime. */
  function insertAtCursor(text: string) {
    const textarea = getActiveTextarea()
    const current = textarea ? textarea.value : content
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    const next = current.slice(0, start) + text + current.slice(end)
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

  /** Upload pasted/dropped images sequentially, then insert all markdown
   *  in one shot (avoids cursor juggling between async inserts). */
  async function uploadImagesAtCursor(files: File[]) {
    const toastId = toast.loading(t("admin.imageUploading"))
    const urls: string[] = []
    let failure: string | null = null
    for (const file of files) {
      const check = validateImageFile(file)
      if (check === "size") {
        failure = t("admin.fileTooLarge")
        continue
      }
      if (check === "type") {
        failure = t("admin.uploadFailed")
        continue
      }
      const result = await uploadImageFile(file)
      if (result.ok) {
        urls.push(result.url)
      } else {
        failure =
          result.reason === "network"
            ? t("admin.networkErrorSave")
            : result.message || t("admin.uploadFailed")
      }
    }
    if (urls.length) {
      insertAtCursor(
        urls
          .map((url) => `![${t("admin.uploadedImageAlt")}](${url})`)
          .join("\n")
      )
      toast.success(t("admin.imageInserted"), { id: toastId })
      // Partial failure: the success toast already replaced the loading
      // one — surface the failure as its own toast so both stay visible.
      if (failure) toast.error(failure)
    } else {
      toast.error(failure ?? t("admin.uploadFailed"), { id: toastId })
    }
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
      // A future value here + draft:false = scheduled publishing; the
      // server re-validates the stored format.
      publishAt: toPublishAtUtc(publishAt),
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
        const savedPublishAt = fromPublishAtUtc(data.post.publishAt)
        setDraft(savedDraft)
        setPublishAt(savedPublishAt)
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
          publishAt: savedPublishAt,
        }
        if (publish) {
          toast.success(
            isScheduled(data.post.publishAt)
              ? t("admin.scheduleSuccess")
              : t("admin.publishSuccess")
          )
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
          try {
            localStorage.removeItem(NEW_POST_DRAFT_KEY)
          } catch {
            // ignore
          }
          router.push(
            `/admin/posts/edit?slug=${encodeURIComponent(data.post.slug)}`
          )
        }
        router.refresh()
      } else {
        const err = await res.json()
        // Auto-save failures must NOT be silent: the user believes the
        // draft is safe while nothing was persisted.
        toast.error(
          autoSavedRef.current
            ? t("admin.autoSaveFailed")
            : (err.error || (t("admin.failedToSavePost")))
        )
      }
    } catch {
      toast.error(
        autoSavedRef.current
          ? t("admin.autoSaveFailed")
          : t("admin.networkErrorSave")
      )
    } finally {
      setSaving(false)
      autoSavedRef.current = false
    }
  }

  const previewPanel = <MarkdownPreview content={content} />

  // Draft wins; otherwise a future publish time means "scheduled" — the
  // post is saved as published but hidden from every public surface.
  const scheduled = !draft && isScheduled(toPublishAtUtc(publishAt))

  return (
    <div className="space-y-6">
      {/* Title lives in admin layout pageMeta; actions portal in. */}
      <HeaderActions>
        {!isNew && !draft && !scheduled && (
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
            <ContentTextarea
              textareaRef={desktopContentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onImageFiles={uploadImagesAtCursor}
              placeholder={t("admin.contentPlaceholder")}
              className="font-mono min-h-[400px] lg:min-h-[calc(100vh-24rem)] resize-y"
              dragHint={t("admin.dropImageHint")}
            />
          </div>

          {/* Tabs (mobile) */}
          <Tabs defaultValue="edit" className="lg:hidden">
            <TabsList className="mb-4">
              <TabsTrigger value="edit">{t("admin.editTab")}</TabsTrigger>
              <TabsTrigger value="preview">{t("admin.previewTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <ContentTextarea
                textareaRef={mobileContentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onImageFiles={uploadImagesAtCursor}
                placeholder={t("admin.contentPlaceholder")}
                className="font-mono min-h-[400px]"
                dragHint={t("admin.dropImageHint")}
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

      {/* Status + schedule */}
      <div className={cn("flex flex-wrap items-center gap-3 text-sm text-muted-foreground rounded-lg border bg-card p-3")}>
        <Badge
          variant={draft ? "secondary" : "default"}
          className={
            draft
              ? "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
              : scheduled
                ? "bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400"
                : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
          }
        >
          {draft
            ? (t("admin.draft"))
            : scheduled
              ? (t("admin.statusScheduled"))
              : (t("admin.publishedStatus"))}
        </Badge>
        <span>
          {draft
            ? (t("admin.draftDesc"))
            : scheduled
              ? (t("admin.statusScheduledDesc"))
              : (t("admin.publishedDesc"))}
        </span>
        <label
          htmlFor="publish-at"
          className="ml-auto flex items-center gap-2"
        >
          <span className="text-xs">{t("admin.scheduleLabel")}</span>
          <Input
            id="publish-at"
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            className="h-8 w-auto text-xs"
          />
        </label>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        {t("admin.scheduleHint")}
      </p>

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
