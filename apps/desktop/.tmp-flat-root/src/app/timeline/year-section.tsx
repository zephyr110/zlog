"use client"

import { useState } from "react"
import Link from "next/link"
import { useT } from "@/components/layout/trans"

interface Props {
  year: number
  posts: { date: string; slug: string; title: string }[]
  defaultOpen?: boolean
}

export function YearSection({ year, posts, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const { t } = useT()
  const postsCount = t("timeline.postsCount") as (n: number) => string
  const month = t("timeline.month") as (m: string) => string

  return (
    <div className="group">
      {/* Header — clickable */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 md:gap-3 w-full text-left cursor-pointer mb-4"
      >
        {/* Year dot — centered on the timeline rail */}
        <span className="relative flex w-10 md:w-12 shrink-0 items-center justify-center self-stretch">
          <span
            className={`absolute size-7 rounded-full transition-all duration-300 ${
              open
                ? "bg-primary/10 scale-100"
                : "bg-primary/5 scale-75 group-hover:scale-100 group-hover:bg-primary/10"
            }`}
          />
          <span
            className={`absolute size-3.5 rounded-full border-2 bg-background transition-all duration-300 ${
              open
                ? "border-primary scale-110"
                : "border-primary/40 group-hover:border-primary/70"
            }`}
          />
          <span
            className={`relative size-1.5 rounded-full bg-primary transition-transform duration-300 ${
              open ? "scale-125" : ""
            }`}
          />
        </span>

        <h2 className="text-2xl md:text-3xl font-bold tracking-tight tabular-nums bg-gradient-to-br from-foreground to-foreground/55 bg-clip-text text-transparent">
          {year}
        </h2>
        <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
          {postsCount(posts.length)}
        </span>
        <span className="ml-2 text-xs text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block tabular-nums">
          {posts[0]?.date && (
            <>
              {month(posts[posts.length - 1]?.date?.split("-")[1])} —{" "}
              {month(posts[0]?.date?.split("-")[1])}
            </>
          )}
        </span>
        {/* Chevron */}
        <span
          className={`ml-auto flex size-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
            open
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-border/60 text-muted-foreground/60 group-hover:border-border group-hover:text-muted-foreground"
          }`}
        >
          <svg
            className={`size-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {/* Content — animated collapse/expand via grid */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {/* pr-2 keeps hover translate-x room inside the overflow-hidden
              collapse container; negative right margin would clip the arrow. */}
          <div className="ml-10 md:ml-12 pl-3 md:pl-4 pr-2">
            <div className="space-y-0.5 pb-2">
              {posts.map((post, idx) => (
                <Link
                  key={post.slug}
                  href={`/posts/${encodeURIComponent(post.slug)}`}
                  style={{
                    animationDelay: `${Math.min(idx, 8) * 40}ms`,
                    animationFillMode: "both",
                  }}
                  className="group/link relative flex items-center gap-3 px-3 py-2.5 -ml-3 rounded-lg transition-all duration-200 hover:bg-muted/50 hover:translate-x-1 animate-in fade-in slide-in-from-left-2"
                >
                  {/* Connector tick from the timeline rail */}
                  <span className="absolute -left-3 md:-left-4 top-1/2 w-3 md:w-4 h-px bg-border/70 transition-colors duration-200 group-hover/link:bg-primary/40" />
                  <time className="shrink-0 w-[3.25rem] text-xs text-muted-foreground/55 font-mono tabular-nums group-hover/link:text-muted-foreground transition-colors">
                    {post.date.slice(5)}
                  </time>
                  <span className="text-sm font-medium truncate group-hover/link:text-primary transition-colors">
                    {post.title}
                  </span>
                  <svg
                    className="ml-auto size-3.5 shrink-0 text-primary opacity-0 -translate-x-1 transition-all duration-200 group-hover/link:opacity-100 group-hover/link:translate-x-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
