import { Skeleton } from "@/components/ui/skeleton"

// Deterministic widths keep the skeleton stable across re-renders
// (Math.random in render breaks React purity rules).
const lineWidths = [92, 78, 85, 66, 90, 74, 88, 70, 82, 95, 64, 80]

// The GitHub Pages mirror (static export) has no API routes — the live
// comment section renders a "not available" notice there, so the
// skeleton mirrors that instead of a form that can never materialize.
const STATIC_MIRROR = !!process.env.NEXT_PUBLIC_SITE_URL?.includes("github.io")

/** Skeleton mirroring the post page: hero header (breadcrumb, title,
 *  description, author meta + tags + share), prose content, the tag
 *  card footer, the comments block, and the related-posts grid — same
 *  containers, heights, and column counts as the live page so the swap
 *  to real content causes no layout shift. */
export default function PostLoading() {
  return (
    <div className="min-h-screen">
      {/* Hero header */}
      <header className="relative overflow-hidden border-b bg-gradient-to-b from-muted/40 via-muted/20 to-background">
        <div className="container relative mx-auto max-w-5xl px-4 py-16 md:py-20 2xl:max-w-7xl">
          {/* Breadcrumb */}
          <nav className="mb-8 flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <span className="opacity-40">/</span>
            <Skeleton className="h-4 w-48" />
          </nav>
          {/* Title — two lines at h1 size */}
          <div className="mb-6 space-y-3">
            <Skeleton className="h-9 w-3/4 md:h-11 lg:h-12" />
            <Skeleton className="h-9 w-1/2 md:h-11 lg:h-12" />
          </div>
          {/* Description */}
          <Skeleton className="mb-8 h-5 w-2/3 md:h-6" />
          {/* Author + meta + tags + share — same wrap row as live */}
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full ring-2 ring-border" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>
            <span className="hidden opacity-20 md:block">|</span>
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-6 w-14 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            {/* Copy-link icon button */}
            <Skeleton className="ml-auto size-9 rounded-lg" />
          </div>
        </div>
      </header>

      {/* Content — prose-lg sized lines, then a heading + image block */}
      <div className="container mx-auto max-w-5xl px-4 py-12 md:py-16 2xl:max-w-7xl">
        <div className="space-y-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-5" style={{ width: `${lineWidths[i]}%` }} />
          ))}
          <Skeleton className="h-8 w-1/3 pt-2" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
        </div>

        {/* Tag card footer */}
        <div className="my-12 rounded-2xl border bg-card p-5 md:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-10" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:pt-6">
              <Skeleton className="size-9 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Comments — same card + list + form shapes as the live section.
          On the static mirror the live section renders only the
          "not available" notice — mirror that instead of flashing a
          form that can never materialize. */}
      <section className="container mx-auto max-w-5xl px-4 py-12 2xl:max-w-7xl">
        <div className="rounded-2xl border bg-card p-6 md:p-8">
          <div className="mb-8 flex items-center gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="h-6 w-32" />
          </div>
          {STATIC_MIRROR ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : (
            <>
              <div className="space-y-3">
                {[
                  { name: "w-24", content: "w-3/4" },
                  { name: "w-20", content: "w-2/3" },
                ].map((w, i) => (
                  <div key={i} className="rounded-xl border bg-muted/20 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Skeleton className="size-6 rounded-full" />
                      <Skeleton className={`h-4 ${w.name}`} />
                    </div>
                    <Skeleton className={`h-3.5 ${w.content}`} />
                  </div>
                ))}
              </div>
              {/* Form */}
              <div className="mt-8 space-y-3">
                <div className="flex gap-3">
                  <Skeleton className="h-9 w-40 rounded-md" />
                  <Skeleton className="h-9 w-56 rounded-md" />
                </div>
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="ml-auto h-9 w-28 rounded-md" />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Related posts — same 3-up card grid as live */}
      <section className="border-t bg-gradient-to-b from-muted/20 to-background">
        <div className="container mx-auto max-w-5xl px-4 py-14 2xl:max-w-7xl">
          <Skeleton className="mb-8 h-8 w-32" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col rounded-2xl border bg-card p-5">
                <Skeleton className="mb-2 h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="mt-auto flex items-center gap-1.5 pt-4">
                  <Skeleton className="h-3 w-16" />
                  <span className="opacity-40">·</span>
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Back to archive */}
      <div className="py-8 text-center">
        <Skeleton className="mx-auto h-4 w-40" />
      </div>
    </div>
  )
}
