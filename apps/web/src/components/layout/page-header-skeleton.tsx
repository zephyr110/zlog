import { Skeleton } from "@/components/ui/skeleton"
import { BannerArt, pageBannerMinClass } from "@/components/layout/banner-art"
import { cn } from "@/lib/utils"

/** Shared PageHeader loading chrome — breadcrumb, icon + title/desc. */
export function PageHeaderSkeleton({
  withStats = false,
}: {
  /** Extra muted meta row under the title (e.g. topics post count). */
  withStats?: boolean
}) {
  return (
    <section
      className={cn(
        "relative flex flex-col overflow-hidden border-b bg-background",
        pageBannerMinClass
      )}
    >
      <BannerArt />
      <div className="container relative mx-auto flex max-w-5xl flex-1 items-center gap-8 px-4 py-12 md:py-16 xl:gap-12 2xl:max-w-7xl">
        <div className="min-w-0 flex-1">
          <nav className="mb-6 flex items-center gap-2">
            <Skeleton className="h-3.5 w-16" />
            <span className="opacity-40">/</span>
            <Skeleton className="h-3.5 w-24" />
          </nav>
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-9 w-44 md:h-10 md:w-64" />
              <Skeleton className="h-4 w-56 md:w-80" />
            </div>
          </div>
          {withStats && (
            <div className="mt-4 flex items-center gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          )}
        </div>
        <div className="hidden w-56 shrink-0 lg:block xl:w-64 2xl:w-72">
          <Skeleton className="aspect-square w-full rounded-3xl" />
        </div>
      </div>
    </section>
  )
}
