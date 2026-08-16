import { Skeleton } from "@/components/ui/skeleton"
import { PageHeaderSkeleton } from "@/components/layout/page-header-skeleton"

/** Skeleton mirroring the about page: PageHeader + about / tech / contact. */
export default function AboutLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeaderSkeleton />

      <div className="container mx-auto max-w-5xl space-y-16 px-4 py-16 md:py-20 2xl:max-w-7xl">
        <section className="space-y-4">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-full max-w-2xl" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-3/4 max-w-lg" />
        </section>

        <Skeleton className="h-px w-full" />

        <section className="space-y-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-xl border bg-card p-4"
              >
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <Skeleton className="h-px w-full" />

        <section className="space-y-4">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-full max-w-md" />
          <div className="flex gap-3">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </section>
      </div>
    </div>
  )
}
