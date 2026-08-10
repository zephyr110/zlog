"use client"

import { useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Copy, FileCode, Download, Trash2, X, Loader2 } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/components/layout/trans"

export interface MediaFile {
  name: string
  url: string
  /** SQLite datetime("now") — UTC "YYYY-MM-DD HH:MM:SS" */
  createdAt?: string
}

interface MediaLightboxProps {
  file: MediaFile | null
  onClose: () => void
  onCopyUrl: (url: string) => void
  onCopyMarkdown: (url: string) => void
  onDelete: (file: MediaFile) => void
}

/**
 * Full-screen lightbox for the media library.
 *
 * Renders via portal on top of everything (no Dialog chrome — no max-width
 * caps, no double close buttons). The image is sized by its long edge to
 * ~90% of the viewport; the file name sits top-left (opposite the close
 * control), and the action bar at the bottom holds copy URL / copy MD /
 * download / delete.
 *
 * Closes on ESC or clicking the backdrop.
 */
export function MediaLightbox({
  file,
  onClose,
  onCopyUrl,
  onCopyMarkdown,
  onDelete,
}: MediaLightboxProps) {
  const { t } = useT()
  const [imageLoaded, setImageLoaded] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Reset per-image state + lock body scroll while open.
  useEffect(() => {
    if (!file) return
    setImageLoaded(false) // eslint-disable-line react-hooks/set-state-in-effect -- one-time reset per file switch; the img remounts via key anyway
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [file])

  // ESC to close.
  useEffect(() => {
    if (!file) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [file, onClose])

  const handleDownload = useCallback(async () => {
    if (!file) return
    setDownloading(true)
    try {
      // Fetch as blob so we control the filename (jsdelivr sends CORS
      // headers); a plain <a download> on a cross-origin URL is ignored.
      const res = await fetch(file.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      toast.error(t("admin.downloadFailed"))
      // CORS/network fallback — open the image in a new tab instead.
      window.open(file.url, "_blank", "noopener")
    } finally {
      setDownloading(false)
    }
  }, [file, t])

  if (!file) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Filename — top-left; leave room for the close control */}
      <p
        className="absolute top-4 left-4 z-10 max-w-[min(70vw,28rem)] truncate text-sm font-medium text-white/90"
        onClick={(e) => e.stopPropagation()}
      >
        {file.name}
      </p>

      {/* Close — the only one; top-right */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 cursor-pointer"
      >
        <X size={18} />
      </button>

      {/* Image — sized by its long edge to ~90% of the viewport */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4 pt-16 pb-20">
        {!imageLoaded && (
          // Absolute overlay so the spinner is dead-center regardless of
          // the img's (zero) in-flow size while it loads.
          <div className="absolute inset-0">
            <Spinner size="md" fill className="text-white/50" />
          </div>
        )}
        {/* key remounts the img when switching files, so a stale image is
            never shown while the next one loads */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={file.url}
          src={file.url}
          alt={file.name}
          onLoad={() => setImageLoaded(true)}
          onClick={(e) => e.stopPropagation()}
          className={`max-w-[90vw] max-h-[90vh] object-contain rounded-sm shadow-2xl ${
            imageLoaded ? "opacity-100" : "opacity-0"
          } transition-opacity duration-150`}
        />
      </div>

      {/* Bottom action bar */}
      <div
        className="absolute bottom-0 inset-x-0 flex items-center justify-end gap-2 px-4 py-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onCopyUrl(file.url)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/25 cursor-pointer"
        >
          <Copy size={13} />
          {t("admin.copyURL")}
        </button>
        <button
          type="button"
          onClick={() => onCopyMarkdown(file.url)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/25 cursor-pointer"
        >
          <FileCode size={13} />
          {t("admin.copyMD")}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/25 disabled:opacity-50 cursor-pointer"
        >
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {downloading
            ? (t("admin.downloading"))
            : (t("admin.download"))}
        </button>
        <button
          type="button"
          onClick={() => onDelete(file)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-red-500/20 px-2.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/35 cursor-pointer"
        >
          <Trash2 size={13} />
          {t("admin.deleteImage")}
        </button>
      </div>
    </div>,
    document.body
  )
}
