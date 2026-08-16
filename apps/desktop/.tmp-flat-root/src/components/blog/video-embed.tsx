"use client"

import { useState } from "react"
import { Play } from "lucide-react"
import {
  type VideoEmbed as VideoEmbedDesc,
  videoEmbedSrc,
} from "@/lib/video-embed"

type VideoEmbedProps = VideoEmbedDesc & {
  title?: string
}

export function VideoEmbed({ provider, id, title }: VideoEmbedProps) {
  const [active, setActive] = useState(false)
  // Autoplay only after the facade click — one gesture starts playback.
  const src = videoEmbedSrc({ provider, id }, { autoplay: true })
  const label =
    title?.trim() ||
    (provider === "bilibili" ? "Bilibili video" : "YouTube video")

  return (
    <div className="my-6 w-full overflow-hidden rounded-xl border border-border/60 shadow-lg">
      <div className="relative aspect-video w-full bg-muted">
        {active ? (
          <iframe
            src={src}
            title={label}
            className="absolute inset-0 size-full border-0"
            allowFullScreen
            // "autoplay" allowed only because the iframe mounts after a click.
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <button
            type="button"
            onClick={() => setActive(true)}
            className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 bg-muted text-foreground transition-colors hover:bg-muted/80"
            aria-label={`Play ${label}`}
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-md">
              <Play className="size-6 fill-current pl-0.5" aria-hidden />
            </span>
            <span className="max-w-[85%] truncate px-4 text-sm font-medium text-muted-foreground">
              {label}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
