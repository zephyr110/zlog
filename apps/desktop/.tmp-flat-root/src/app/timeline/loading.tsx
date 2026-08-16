import { Skeleton } from "@/components/ui/skeleton"

export default function TimelineLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <section className="border-b bg-gradient-to-b from-muted/40 via-muted/20 to-background">
        <div className="container mx-auto px-4 py-16 md:py-20 max-w-5xl 2xl:max-w-7xl">
          <Skeleton className="h-4 w-32 mb-6" />
          <Skeleton className="h-10 w-40 mb-3" />
          <Skeleton className="h-4 w-28" />
        </div>
      </section>

      {/* Timeline */}
      <div className="container mx-auto px-4 py-16 md:py-20 max-w-5xl 2xl:max-w-7xl">
        <div className="relative">
          <div className="absolute left-5 md:left-6 top-2 bottom-2 -translate-x-1/2 w-[2px] rounded-full">
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-transparent via-border/40 to-transparent" />
          </div>
          <div className="space-y-14">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="flex items-center gap-2 md:gap-3 mb-4">
                  <div className="flex w-10 md:w-12 shrink-0 justify-center">
                    <div className="size-3.5 rounded-full bg-muted ring-4 ring-background" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="ml-auto size-7 rounded-full" />
                </div>
                <div className="ml-10 md:ml-12 pl-3 md:pl-4 space-y-0.5">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="relative flex items-center gap-3 px-3 py-2.5">
                      <div className="absolute -left-3 md:-left-4 top-1/2 w-3 md:w-4 h-px bg-border/50" />
                      <div className="size-1.5 rounded-full bg-muted shrink-0" />
                      <Skeleton className="h-3 w-[3.25rem]" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
