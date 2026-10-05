"use client"

import { useState } from "react"
import { FolderGit2 } from "lucide-react"

export function ProjectCover({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1c2333] via-[#2b3a67] to-[#131822]">
        <FolderGit2 className="size-10 text-white/60" aria-hidden />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- jsdelivr 外链（静态导出无图片优化器）
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
    />
  )
}
