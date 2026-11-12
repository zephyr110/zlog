"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { useT } from "@/components/layout/trans"
import { cn } from "@/lib/utils"

/**
 * Header search. Collapsed to a magnifier icon by default and expands in
 * place on click, Tab, or the global "/" shortcut. Syncs from ?q= on mount
 * and on browser back/forward; only /archive consumes ?q=, so sync is
 * skipped on other routes (an old /?q=... bookmark is harmless to ignore).
 */
export function SearchInput() {
  const { t } = useT()
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState("")
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  function expand() {
    setOpen(true)
    // The input is always mounted (value survives collapse); focus after
    // the state flip so the width transition starts from the open state.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = value.trim()
    // Search results live on the archive page — the home feed only shows
    // the latest handful of posts.
    router.push(q ? `/archive?q=${encodeURIComponent(q)}` : "/archive")
    inputRef.current?.blur()
  }

  function clear() {
    setValue("")
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className="relative ml-1 flex items-center">
      <div
        className={cn(
          "relative flex h-9 items-center overflow-hidden rounded-lg transition-[width,background-color] duration-300 ease-out focus-within:ring-1 focus-within:ring-primary/40 motion-reduce:transition-none",
          open ? "w-36 bg-muted/60 sm:w-44 lg:w-52" : "w-9 bg-transparent hover:bg-muted/50"
        )}
      >
        <button
          type="button"
          onClick={() => (open ? inputRef.current?.focus() : expand())}
          // Keep focus in the input when the button is clicked while open.
          onMouseDown={(e) => {
            if (open) e.preventDefault()
          }}
          aria-label={t("site.searchPosts")}
          aria-expanded={open}
          aria-keyshortcuts="/"
          title={`${t("site.searchPosts")} (/)`}
          className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center text-muted-foreground outline-none transition-colors hover:text-primary"
        >
          <Search size={16} />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            // While an IME composes, Escape cancels the candidate window.
            if (e.key === "Escape" && !e.nativeEvent.isComposing) {
              setValue("")
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder={t("site.searchPosts")}
          aria-label={t("site.searchPosts")}
          aria-keyshortcuts="/"
          data-search-input="header"
          className={cn(
            "peer h-full min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-opacity duration-150",
            value ? "pr-7" : "pr-2",
            open ? "opacity-100" : "opacity-0"
          )}
        />

        {open && value && (
          <button
            type="button"
            onClick={clear}
            onMouseDown={(e) => e.preventDefault()}
            aria-label={t("site.clearFilter")}
            className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </form>
  )
}
