"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { apiFetch } from "@/lib/api-client"
import { useT } from "@/components/layout/trans"
import { useSiteConfig } from "@/components/layout/site-config-provider"
import { siteLogoSrc } from "@/lib/site-config"
import { SiteLogo } from "@/components/layout/site-logo"
import { toast } from "sonner"
import { ExternalLink, ImageIcon, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  UPLOAD_ACCEPT,
  uploadImageFile,
  validateImageFile,
} from "@/lib/upload"

/** Only allow opening http(s) URLs typed in the form — empty/invalid stay inert. */
function externalHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.href
  } catch {
    return null
  }
}

function OpenUrlButton({ href, label }: { href: string | null; label: string }) {
  // Match Input height (h-8) so the trailing action sits on the same row.
  const className = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    href ? "hover:bg-muted hover:text-foreground" : "opacity-50"
  )

  if (!href) {
    return (
      <span className={className} aria-hidden="true">
        <ExternalLink size={14} />
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={className}
    >
      <ExternalLink size={14} />
    </a>
  )
}

type FormState = {
  name: string
  title: string
  description: string
  authorName: string
  logoUrl: string
  logoInvertInDark: boolean
  githubUrl: string
  twitterUrl: string
  commentEnabled: boolean
}

export function SiteInfoForm({
  idPrefix = "site",
  className,
}: {
  idPrefix?: string
  className?: string
}) {
  const { t } = useT()
  const site = useSiteConfig()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>({
    name: "",
    title: "",
    description: "",
    authorName: "",
    logoUrl: "",
    logoInvertInDark: false,
    githubUrl: "",
    twitterUrl: "",
    commentEnabled: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Fields the user actually touched — the save PUT sends only these, so
  // two SiteInfoForm instances (settings page + sidebar dialog) editing
  // different fields can't silently overwrite each other's changes.
  const touchedRef = useRef<Set<keyof FormState>>(new Set())
  // A logo upload/remove persists immediately (no Save click needed). When
  // true, the last logo action already landed — a later Save click then
  // confirms success instead of the confusing "nothing to save" message.
  const autoPersistedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/site-settings")
        if (!res.ok) throw new Error("failed")
        const data = await res.json()
        if (cancelled) return
        const s = data.settings
        setForm({
          name: s.name ?? "",
          title: s.title ?? "",
          description: s.description ?? "",
          authorName: s.authorName ?? "",
          logoUrl: s.logoUrl ?? "",
          logoInvertInDark: s.logoInvertInDark ?? false,
          githubUrl: s.githubUrl ?? "",
          twitterUrl: s.twitterUrl ?? "",
          commentEnabled: s.commentEnabled ?? true,
        })
      } catch {
        if (!cancelled) {
          // Don't silently fall back — the save below would overwrite the
          // real DB row with possibly-stale values.
          toast.error(t("admin.siteInfoLoadFailed"))
          setForm({
            name: site.name,
            title: site.title,
            description: site.description,
            authorName: site.author.name,
            logoUrl: site.logoUrl,
            logoInvertInDark: site.logoInvertInDark ?? false,
            githubUrl: site.social.github,
            twitterUrl: site.social.twitter,
            commentEnabled: site.commentEnabled ?? true,
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // Initial hydrate only — site context is a fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    touchedRef.current.add(key)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleUpload(file: File) {
    const check = validateImageFile(file)
    if (check !== "ok") {
      toast.error(t("admin.uploadFailed"))
      return
    }
    setUploading(true)
    try {
      const result = await uploadImageFile(file)
      if (!result.ok) {
        toast.error(
          result.reason === "network"
            ? t("admin.networkError")
            : result.message || t("admin.uploadFailed")
        )
        return
      }
      const url = result.url
      patch("logoUrl", url)
      // 上传即保存: the file is already persisted in the media library by
      // /api/upload, so the logoUrl must be persisted right away too —
      // otherwise closing the dialog without pressing Save orphans the
      // file AND leaves the setting untouched.
      const persisted = await persistLogo(url)
      if (persisted) toast.success(t("admin.uploadSuccess"))
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setUploading(false)
    }
  }

  /** Persist logoUrl to site settings immediately (no Save click needed).
   *  Returns false on failure so callers can skip the success toast. */
  async function persistLogo(url: string): Promise<boolean> {
    try {
      const res = await apiFetch("/api/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: url }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || (t("admin.siteInfoSaveFailed")))
        return false
      }
      // Refresh the context so every consumer (header, sidebar, other
      // form instances) sees the new logo immediately.
      const s = data.settings
      site.setSiteConfig((prev) => ({
        ...prev,
        logoUrl: s.logoUrl,
        logoInvertInDark: s.logoInvertInDark ?? prev.logoInvertInDark,
      }))
      // Already persisted — drop from touched so a later Save doesn't
      // resubmit it; remember the action so a Save click confirms it.
      touchedRef.current.delete("logoUrl")
      autoPersistedRef.current = true
      return true
    } catch {
      toast.error(t("admin.networkError"))
      return false
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (touchedRef.current.size === 0) {
      if (autoPersistedRef.current) {
        // The logo change was already persisted on upload/remove — treat
        // this Save as the confirmation it is, not as a no-op.
        autoPersistedRef.current = false
        toast.success(t("admin.siteInfoSaved"))
      } else {
        toast.info(t("admin.siteInfoNoChanges"))
      }
      return
    }
    setSaving(true)
    try {
      // Partial update: only the touched fields are sent, so a save from
      // one form never overwrites fields another form (or dialog session)
      // changed in between.
      const patchBody = Object.fromEntries(
        [...touchedRef.current].map((key) => [key, form[key]])
      )
      const res = await apiFetch("/api/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || (t("admin.siteInfoSaveFailed")))
        return
      }
      // The server returns the merged full record — use it to refresh the
      // context so every consumer (header, sidebar, other form instances)
      // sees the latest values.
      const s = data.settings
      site.setSiteConfig((prev) => ({
        ...prev,
        name: s.name,
        title: s.title,
        description: s.description,
        author: { ...prev.author, name: s.authorName },
        logoUrl: s.logoUrl,
        logoInvertInDark: s.logoInvertInDark ?? prev.logoInvertInDark,
        social: {
          github: s.githubUrl,
          twitter: s.twitterUrl,
        },
        commentEnabled: s.commentEnabled ?? prev.commentEnabled,
      }))
      touchedRef.current.clear()
      autoPersistedRef.current = false
      toast.success(t("admin.siteInfoSaved"))
    } catch {
      toast.error(t("admin.networkError"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner size="md" />
      </div>
    )
  }

  const previewSrc = siteLogoSrc({ logoUrl: form.logoUrl })

  return (
    <form onSubmit={handleSave} className={cn("space-y-5", className)}>
      {/* Logo */}
      <div className="space-y-2">
        <Label>{t("admin.siteLogo")}</Label>
        <div className="flex items-center gap-4">
          {/* Full-bleed rounded tile, same recipe as the chip — and opaque,
              so a dark-mode inverted transparent PNG rasterizes onto it,
              not onto the dialog background. */}
          <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            <SiteLogo
              src={previewSrc}
              invertInDark={form.logoInvertInDark}
              className="size-full rounded-lg object-cover"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) void handleUpload(file)
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Spinner size="sm" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {uploading
                  ? (t("admin.uploading"))
                  : (t("admin.uploadLogo"))}
              </Button>
              {form.logoUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={() => {
                    patch("logoUrl", "")
                    // Remove also persists immediately — consistent with
                    // upload; confirm it like the upload does.
                    void persistLogo("").then((persisted) => {
                      if (persisted)
                        toast.success(t("admin.siteInfoSaved"))
                    })
                  }}
                >
                  <X className="size-3.5" />
                  {t("admin.removeLogo")}
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ImageIcon className="size-3.5" />
                  {t("admin.defaultLogo")}
                </span>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={form.logoInvertInDark}
                onChange={(e) => patch("logoInvertInDark", e.target.checked)}
                className="size-3.5 accent-primary"
              />
              <span>
                {t("admin.logoInvertDark")}
                <span className="ml-1 text-xs opacity-70">
                  ({t("admin.logoInvertDarkHint")})
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Comments master switch — kill-switch when spam hits. */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={form.commentEnabled}
          onChange={(e) => patch("commentEnabled", e.target.checked)}
          className="size-3.5 accent-primary"
        />
        <span>{t("admin.allowComments")}</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>
            {t("admin.siteName")}
          </Label>
          <Input
            id={`${idPrefix}-name`}
            value={form.name}
            onChange={(e) => patch("name", e.target.value)}
            required
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-title`}>
            {t("admin.siteTitle")}
          </Label>
          <Input
            id={`${idPrefix}-title`}
            value={form.title}
            onChange={(e) => patch("title", e.target.value)}
            required
            maxLength={100}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-desc`}>
          {t("admin.siteDesc")}
        </Label>
        <Textarea
          id={`${idPrefix}-desc`}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          rows={3}
          maxLength={500}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-author`}>
          {t("admin.author")}
        </Label>
        <Input
          id={`${idPrefix}-author`}
          value={form.authorName}
          onChange={(e) => patch("authorName", e.target.value)}
          maxLength={100}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-github`}>
            {t("admin.github")}
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`${idPrefix}-github`}
              type="url"
              value={form.githubUrl}
              onChange={(e) => patch("githubUrl", e.target.value)}
              maxLength={300}
              placeholder="https://github.com/..."
              className="min-w-0 flex-1"
            />
            <OpenUrlButton
              href={externalHref(form.githubUrl)}
              label={`${t("admin.openUrl") as string} — ${t("admin.github") as string}`}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-twitter`}>
            {t("admin.twitter")}
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`${idPrefix}-twitter`}
              type="url"
              value={form.twitterUrl}
              onChange={(e) => patch("twitterUrl", e.target.value)}
              maxLength={300}
              placeholder="https://x.com/..."
              className="min-w-0 flex-1"
            />
            <OpenUrlButton
              href={externalHref(form.twitterUrl)}
              label={`${t("admin.openUrl") as string} — ${t("admin.twitter") as string}`}
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={saving || uploading}>
        {saving ? (t("admin.saving")) : (t("admin.saveSiteInfo"))}
      </Button>
    </form>
  )
}
