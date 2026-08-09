"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardAction, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { PostStats } from "@/components/admin/post-stats"
import { TrafficAnalytics } from "@/components/admin/traffic-analytics"
import { ContributionCalendar } from "@/components/admin/contribution-calendar"
import { FormattedDate } from "@/components/blog/formatted-date"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/components/layout/trans"
import { toast } from "sonner"
import { fetchAdminPosts } from "@/lib/admin-posts"
import { useCommentUnread } from "@/components/admin/comment-unread"
import { cn } from "@/lib/utils"
import { FileText, PenLine, Clock, Tag, MessageSquare } from "lucide-react"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { type PostSummary } from "@zlog/database"

export default function AdminDashboardPage() {
  const { t } = useT()
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const { unread: unreadComments } = useCommentUnread()

  useEffect(() => {
    async function fetchPosts() {
      const result = await fetchAdminPosts()
      if (result.ok) {
        setPosts(result.posts)
      } else {
        toast.error(t("admin.loadFailed"))
      }
      setLoading(false)
    }
    fetchPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once fetch; adding `t` (new identity per render) would refetch on every render
  }, [])

  const published = posts.filter((p) => !p.draft)
  const drafts = posts.filter((p) => p.draft)
  const allTags = new Set(posts.flatMap((p) => p.tags))

  const stats = [
    {
      label: t("admin.totalPosts"),
      value: posts.length,
      icon: FileText,
      tile: "bg-muted text-foreground",
      href: "/admin/posts",
    },
    {
      label: t("admin.published"),
      value: published.length,
      icon: PenLine,
      tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      href: "/admin/posts?status=published",
    },
    {
      label: t("admin.drafts"),
      value: drafts.length,
      icon: Clock,
      tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      href: "/admin/posts?status=drafts",
    },
    {
      label: t("admin.tags"),
      value: allTags.size,
      icon: Tag,
      tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      label: t("admin.unreadComments"),
      value: unreadComments,
      icon: MessageSquare,
      tile: "bg-primary/10 text-primary",
      href: "/admin/comments",
    },
  ]

  if (loading) {
    // Mirrors the loaded layout 1:1 — Statistics, Insights charts, Traffic
    // (above recent posts), then recent posts.
    return (
      <div className="flex flex-col gap-8 md:gap-10">
        <section className="flex flex-col gap-5 md:gap-6">
          <Skeleton className="h-7 w-32" />

          {/* Stat cards — same 5-up grid as the loaded view */}
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-4 rounded-xl bg-card py-4 ring-1 ring-foreground/10"
              >
                <div className="flex items-start justify-between px-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="size-8 rounded-lg" />
                </div>
                <div className="px-4">
                  <Skeleton className="h-9 w-10" />
                </div>
              </div>
            ))}
          </div>

          {/* Contribution calendar card */}
          <div className="flex flex-col gap-4 rounded-xl bg-card py-4 ring-1 ring-foreground/10">
            <div className="px-4">
              <Skeleton className="h-5 w-28" />
            </div>
            <div className="flex flex-col gap-3 px-4">
              <div className="flex justify-end">
                <Skeleton className="h-8 w-36 rounded-md" />
              </div>
              <Skeleton className="h-[118px] w-full" />
              <div className="flex items-center justify-end gap-1.5">
                <Skeleton className="h-2.5 w-8" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="size-2.5 rounded-[3px]" />
                ))}
                <Skeleton className="h-2.5 w-8" />
              </div>
            </div>
          </div>
        </section>

        {/* Charts — section title + same 2-up grid, 240px plot area as
            the loaded view */}
        <section className="flex flex-col gap-5 md:gap-6">
          <Skeleton className="h-7 w-28" />
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl bg-card py-4 ring-1 ring-foreground/10"
              >
                <div className="flex items-center justify-between px-4">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-7 w-28 rounded-md" />
                </div>
                <div className="px-4">
                  <Skeleton className="h-[240px] w-full" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Traffic — mirrors TrafficAnalytics chrome (header + 2 totals + 4 panels) */}
        <section className="flex flex-col gap-5 md:gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-8 w-44 rounded-lg" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-4 rounded-xl bg-card py-4 ring-1 ring-foreground/10"
              >
                <div className="flex items-start justify-between px-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="size-8 rounded-lg" />
                </div>
                <div className="px-4">
                  <Skeleton className="h-9 w-16" />
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-xl bg-card py-4 ring-1 ring-foreground/10"
              >
                <div className="px-4">
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex flex-col gap-3 px-4 pb-2">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-6 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent posts — section header + list */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10"
              >
                <div className="flex min-w-0 flex-col gap-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-8 w-14 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      {/* Statistics — stat cards + contribution calendar */}
      <section className="flex flex-col gap-5 md:gap-6">
        <h2 className="text-xl font-semibold tracking-tight">
          {t("admin.statistics")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
          {stats.map((stat) => {
            const Icon = stat.icon
            const inner = (
              <>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <CardAction>
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        stat.tile
                      )}
                    >
                      <Icon size={16} />
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tracking-tight tabular-nums">
                    {stat.value}
                  </p>
                </CardContent>
              </>
            )
            return stat.href ? (
              <Link
                key={stat.label}
                href={stat.href}
                className="block rounded-xl transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-all hover:border-primary/20 hover:shadow-md hover:shadow-foreground/[0.04]">
                  {inner}
                </Card>
              </Link>
            ) : (
              <Card
                key={stat.label}
                className="transition-all hover:border-primary/10 hover:shadow-md hover:shadow-foreground/[0.04]"
              >
                {inner}
              </Card>
            )
          })}
        </div>

        {/* Contribution calendar — full width */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.postsCalendar")}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <ContributionCalendar posts={posts} />
          </CardContent>
        </Card>
      </section>

      {/* Charts */}
      <section className="flex flex-col gap-5 md:gap-6">
        <h2 className="text-xl font-semibold tracking-tight">
          {t("admin.insights")}
        </h2>
        <PostStats posts={posts} />
      </section>

      <TrafficAnalytics />

      {/* Recent Posts */}
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">
            {t("admin.recentPosts")}
          </h2>
          <Link
            href="/admin/posts"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t("admin.viewAll")}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        {posts.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-foreground/10">
            <AdminBlockEmpty className="min-h-48" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.slice(0, 3).map((post) => (
              <Card
                key={post.slug}
                className="transition-colors hover:border-primary/10"
              >
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/posts/edit?slug=${encodeURIComponent(
                        post.slug
                      )}`}
                      className="block truncate font-medium transition-colors hover:text-primary"
                    >
                      {post.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <FormattedDate date={post.date} month="short" /> ·{" "}
                      {t("post.minRead")(post.readingTime)}
                      {post.draft && (
                        <span className="ml-2 font-medium text-amber-600">
                          {t("admin.draft")}
                        </span>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/admin/posts/edit?slug=${encodeURIComponent(
                      post.slug
                    )}`}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-muted"
                  >
                    {t("admin.edit")}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
