import { Skeleton } from "@/components/ui/skeleton"
import { PageHeaderSkeleton } from "@/components/layout/page-header-skeleton"

/** Skeleton mirroring ArchiveFeed: toolbar row, year-nav pill, then a
 *  year heading + dense list rows. Exported so archive/page.tsx can use
 *  it as the Suspense fallback too. */
export function ArchiveFeedSkeleton() {
  return (
    <div>
      {/* Toolbar skeleton — search + topic pills, same row/height as live.
          The live search box defaults to the collapsed 32px icon, so the
          skeleton matches that footprint (a wide bar would snap to the
          icon on every load). */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
      </div>
      {/* Year-nav bar skeleton — pills on the left, collapse-all button
          anchored right on desktop (mirrors YearNavBar's lg:w-full +
          lg:ml-auto layout); w-fit keeps the floating pill on mobile. */}
      <div className="mb-8 flex w-fit max-w-full items-center gap-2 lg:w-full">
        <Skeleton className="h-9 w-44 shrink-0 rounded-full" />
        <Skeleton className="h-7 w-24 shrink-0 rounded-full lg:ml-auto" />
      </div>
      {/* Year heading — accent bar + year + count + chevron */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-7 w-1 rounded-full" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="ml-auto size-7 shrink-0 rounded-full" />
      </div>
      {/* Dense list rows — with tag badges on the right (md+, as live) */}
      <div className="divide-y divide-border/50 border-y border-border/50">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton
              className="h-4"
              style={{ width: `${72 - ((i * 13) % 40)}%` }}
            />
            <Skeleton className="ml-auto hidden h-5 w-16 rounded-full md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ArchiveLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeaderSkeleton />
      <div className="container mx-auto max-w-5xl px-4 py-8 md:py-12 2xl:max-w-7xl">
        <ArchiveFeedSkeleton />
      </div>
    </div>
  )
}
