"use client"

import Link from "next/link"
import { ArrowRight, ArrowUpToLine, Calendar, Clock } from "lucide-react"
import { TagBadge } from "@/components/blog/tag-badge"
import { gradientPairs } from "@/components/blog/post-card"
import { useT } from "@/components/layout/trans"
import { type PostSummary } from "@zlog/database"
import { parseUtcDate } from "@/lib/date"

/** Editorial "hero" card for the newest post on the home page — wide
 *  horizontal layout (stacked on mobile) with an oversized cover/gradient
 *  panel, giving the freshest article the visual weight it deserves. */
export function FeaturedPostCard({ post }: { post: PostSummary }) {
  const { t } = useT()
  const haveCover = !!post.cover
  const gradient = gradientPairs[post.title.length % gradientPairs.length]
  const shortDate = t("post.shortDate")(
    parseUtcDate(post.date)
  )
  const minReadLabel = t("post.minRead") as (n: number) => string

  return (
    <Link
      href={`/posts/${encodeURIComponent(post.slug)}`}
      className="group block"
    >
      <article className="grid overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 md:grid-cols-2">
        {/* Cover / gradient panel */}
        <div
          className={`relative h-56 overflow-hidden md:h-auto md:min-h-72 ${
            !haveCover ? `bg-gradient-to-br ${gradient}` : "bg-muted"
          }`}
        >
          {haveCover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.cover}
                alt={post.title}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <span className="select-none text-center text-3xl font-extrabold text-white/90 drop-shadow-lg md:text-4xl">
                {post.title}
              </span>
            </div>
          )}
          {/* "Latest" badge */}
          <span className="absolute left-4 top-4 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {t("site.latest")}
          </span>

          {/* Pin ribbon — mirrored to the right so it never collides with
              the "Latest" badge; same fold as PostCard's showPinBadge. The
              spotlight post is excluded from the Latest grid below, so
              this is where a pinned newest post shows its pin. */}
          {post.pinnedAt && (
            <span
              className="pointer-events-none absolute right-0 top-0 z-10 size-10 overflow-hidden rounded-tr-xl"
              aria-hidden
            >
              <span className="absolute left-0 top-0 size-0 border-t-[40px] border-l-[40px] border-t-zinc-600 border-l-transparent dark:border-t-zinc-100" />
              <ArrowUpToLine
                className="absolute right-1 top-1 size-3.5 text-white dark:text-zinc-900"
                strokeWidth={2.5}
              />
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col justify-center p-6 md:p-8">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar size={12} />
            <time dateTime={post.date} className="font-medium">
              {shortDate}
            </time>
            <span className="opacity-40">·</span>
            <Clock size={12} />
            <span>{minReadLabel(post.readingTime)}</span>
          </div>

          <h3 className="mb-3 text-xl font-bold leading-snug tracking-tight transition-colors group-hover:text-primary md:text-2xl">
            {post.title}
          </h3>

          <p className="mb-5 text-sm leading-relaxed text-muted-foreground line-clamp-3 md:text-base">
            {post.description}
          </p>

          {post.tags.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-1.5">
              {post.tags.slice(0, 3).map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
              {post.tags.length > 3 && (
                <span className="ml-0.5 self-center text-xs text-muted-foreground">
                  +{post.tags.length - 3}
                </span>
              )}
            </div>
          )}

          <span className="mt-auto inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary">
            {t("site.readMore")}
            <ArrowRight
              size={15}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </span>
        </div>
      </article>
    </Link>
  )
}
