import { Skeleton } from "@/components/ui/skeleton"
import { PostFeedSkeleton } from "@/components/ui/loading"

export default function HomeLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero skeleton — avoid "0 articles" flash */}
      <section className="relative overflow-hidden border-b bg-background">
        <div className="container mx-auto px-4 py-12 md:py-16 lg:py-20 max-w-5xl 2xl:max-w-7xl relative">
          <div className="max-w-2xl space-y-6">
            <Skeleton className="h-6 w-28 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-12 md:h-14 w-3/4" />
              <Skeleton className="h-12 md:h-14 w-1/2" />
            </div>
            <Skeleton className="h-5 w-2/3" />
            <div className="flex gap-3 pt-3">
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-24 rounded-full" />
            </div>
          </div>
        </div>
      </section>
      <PostFeedSkeleton count={6} />
    </div>
  )
}
