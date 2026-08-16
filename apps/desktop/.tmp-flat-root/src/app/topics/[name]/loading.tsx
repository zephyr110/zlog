import { Skeleton } from "@/components/ui/skeleton"
import { PostCardSkeleton } from "@/components/ui/loading"
import { PageHeaderSkeleton } from "@/components/layout/page-header-skeleton"

/** Skeleton mirroring the topics page: PageHeader + topic pills +
 *  sub-tags + post card grid. */
export default function TopicsLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeaderSkeleton withStats />

      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6 2xl:max-w-7xl">
        <div className="flex flex-wrap items-center gap-2">
          {["w-14", "w-18", "w-16", "w-20", "w-18", "w-22", "w-16"].map(
            (w, i) => (
              <Skeleton key={i} className={`h-7 ${w} rounded-full`} />
            )
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-14 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 pb-16 2xl:max-w-7xl">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
