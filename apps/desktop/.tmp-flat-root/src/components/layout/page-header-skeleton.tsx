import { Skeleton } from "@/components/ui/skeleton"

/** Shared PageHeader loading chrome — breadcrumb, icon + title/desc. */
export function PageHeaderSkeleton({
  withStats = false,
}: {
  /** Extra muted meta row under the title (e.g. topics post count). */
  withStats?: boolean
}) {
  return (
    <section className="relative overflow-hidden border-b bg-muted/10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.06] to-transparent"
      />
      <div className="container relative mx-auto max-w-5xl px-4 py-16 md:py-20 2xl:max-w-7xl">
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
    </section>
  )
}
