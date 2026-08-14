import { Skeleton } from "@/components/ui/skeleton"

export function PostCardSkeleton() {
  return (
    <div className="h-full flex flex-col rounded-xl border bg-card overflow-hidden">
      {/* Cover placeholder with reading-time badge */}
      <div className="relative h-48 shrink-0 bg-muted animate-pulse">
        <div className="absolute bottom-3 right-3">
          <Skeleton className="h-5 w-14 rounded-md bg-background/20" />
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 p-5 flex flex-col space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-1.5 pt-1 mt-auto">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function PostFeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl 2xl:max-w-7xl">
      {/* Featured card skeleton — wide panel + content column */}
      <div className="grid overflow-hidden rounded-2xl border bg-card md:grid-cols-2">
        <Skeleton className="h-56 rounded-none md:h-72" />
        <div className="flex flex-col justify-center gap-3 p-6 md:p-8">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-1.5 pt-1">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-4 w-20" />
        </div>
      </div>
      {/* Section header — title + view-all link */}
      <div className="mb-6 mt-10 flex items-end justify-between md:mt-14">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
      {/* Card grid */}
      <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 [&>div]:h-full">
        {Array.from({ length: count }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

/** Admin posts table skeleton — mirrors title / status / pin / date /
 *  tags / actions columns and the sticky header chrome. */
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
      {/* Header row — title ~32%, status/date wider, tags take the rest */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Skeleton className="h-3.5 w-[32%] min-w-0 shrink-0" />
        <Skeleton className="h-3.5 w-36 shrink-0" />
        <Skeleton className="h-3.5 w-12 shrink-0" />
        <Skeleton className="h-3.5 w-36 shrink-0" />
        <Skeleton className="h-3.5 min-w-0 flex-1" />
        <Skeleton className="h-3.5 w-24 shrink-0" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-[32%] min-w-0 shrink-0" />
            <Skeleton className="h-5 w-24 shrink-0 rounded-full" />
            <Skeleton className="size-3.5 shrink-0 rounded-sm" />
            <Skeleton className="h-4 w-28 shrink-0" />
            <div className="flex min-w-0 flex-1 gap-1">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-5 w-14 rounded-md" />
              <Skeleton className="h-5 w-12 rounded-md" />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Admin comment inbox card — mirrors CardHeader / CardContent:
 *  avatar + name/time with corner actions, optional thread line, body
 *  + source meta. Actions are icon-only below sm (two size-8 chips)
 *  and labeled buttons from sm up. */
export function CommentInboxCardSkeleton({
  withThread = false,
}: {
  withThread?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card py-3 ring-1 ring-foreground/10">
      {/* Author header + corner actions */}
      <div className="flex items-center gap-3 px-3">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32 max-w-[40%]" />
            <Skeleton className="size-1.5 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3 w-40 max-w-[55%]" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Skeleton className="size-8 rounded-md sm:h-8 sm:w-24" />
          <Skeleton className="size-8 rounded-md sm:h-8 sm:w-16" />
        </div>
      </div>

      {/* Body — thread, content, source */}
      <div className="flex flex-col gap-2.5 px-3">
        {withThread && (
          <div className="flex items-center gap-1.5 border-l-2 border-foreground/10 pl-2.5">
            <Skeleton className="size-3 shrink-0 rounded-sm" />
            <Skeleton className="h-3 w-28" />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/50 pt-2.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-36 max-sm:hidden" />
        </div>
      </div>
    </div>
  )
}

/** Admin posts list — mobile card stack below md, table from md up.
 *  Shared by the page's loading state and the Suspense fallback. */
export function PostsListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-9 min-w-40 max-w-sm flex-1 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="mt-1 h-4 w-3/4 rounded-md" />
              <Skeleton className="-mr-2 -mt-1 size-8 shrink-0 rounded-lg" />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-20 rounded-md" />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              <Skeleton className="h-5 w-14 rounded-md" />
              <Skeleton className="h-5 w-12 rounded-md" />
              <Skeleton className="h-5 w-10 rounded-md" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <TableSkeleton rows={rows} />
      </div>
    </div>
  )
}
