"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { useT } from "@/components/layout/trans"

/**
 * Header search box. Syncs from ?q= on mount and on browser back/forward;
 * only /archive consumes ?q=, so sync is skipped on other routes (an old
 * /?q=... bookmark is harmless to ignore).
 */
export function SearchInput() {
  const { t } = useT()
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState("")

  useEffect(() => {
    if (pathname !== "/archive") return
    const sync = () => {
      const params = new URLSearchParams(window.location.search)
      setValue(params.get("q") || "")
    }
    sync()
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [pathname])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = value.trim()
    // Search results live on the archive page — the home feed only shows
    // the latest handful of posts.
    router.push(q ? `/archive?q=${encodeURIComponent(q)}` : "/archive")
  }

  return (
    <form onSubmit={handleSubmit} className="hidden md:flex items-center mx-1.5">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("site.searchPosts")}
          className="w-36 h-8 pl-8 pr-2 text-sm rounded-lg border border-transparent bg-muted/50 text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 focus:bg-background focus:text-foreground focus:w-48 transition-all duration-200"
        />
      </div>
    </form>
  )
}
