import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"
import {
  getPublishedPosts,
  getPublishedCount,
  getHomepageLatestPosts,
} from "@zlog/database"
import { HeroSection } from "@/components/blog/hero-section"
import { FeaturedPostCard } from "@/components/blog/featured-post-card"
import { PostCard } from "@/components/blog/post-card"
import { Trans } from "@/components/layout/trans"
import { EmptyState } from "@/components/ui/empty-state"

/** How many cards the home page shows: 1 featured + this many in the grid. */
const LATEST_GRID_COUNT = 6

export default async function HomePage() {
  // Featured stays newest-by-date; Latest is pin-aware. Both queries run
  // in parallel — the featured slug can't be known before getPublishedPosts
  // resolves, so fetch one extra row and dedupe in JS instead of a second
  // serialized round trip (the old code awaited a dependent query).
  const [featuredList, postCount, latestAll] = await Promise.all([
    getPublishedPosts(1),
    getPublishedCount(),
    getHomepageLatestPosts(LATEST_GRID_COUNT + 1),
  ])
  const featured = featuredList[0]
  const latest = featured
    ? latestAll
        .filter((p) => p.slug !== featured.slug)
        .slice(0, LATEST_GRID_COUNT)
    : latestAll.slice(0, LATEST_GRID_COUNT)

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <HeroSection postCount={postCount} />

      <section
        id="post-feed"
        className="container mx-auto max-w-5xl scroll-mt-16 px-4 py-8 md:py-12 2xl:max-w-7xl"
      >
        {!featured ? (
          <EmptyState
            size="lg"
            titleAs="h2"
            className="animate-in fade-in duration-500"
            icon={<FileText size={32} className="text-muted-foreground" />}
            title={<Trans k="site.noPosts" />}
            description={<Trans k="site.noPostsDesc" />}
          />
        ) : (
          <>
            {/* Newest-by-date editorial spotlight (pins do not affect this) */}
            <FeaturedPostCard post={featured} />

            {latest.length > 0 && (
              <>
                <div className="mb-6 mt-10 flex items-end justify-between gap-4 md:mt-14">
                  <h2 className="text-xl font-bold tracking-tight md:text-2xl">
                    <Trans k="site.latestPosts" />
                  </h2>
                  <Link
                    href="/archive"
                    className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Trans k="site.viewAll" />
                    <ArrowRight
                      size={15}
                      className="transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </Link>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 [&>div]:h-full">
                  {latest.map((post, index) => (
                    <div
                      key={post.slug}
                      className="h-full animate-in fade-in slide-in-from-bottom-4"
                      style={{
                        animationDuration: "500ms",
                        animationDelay: `${index * 80}ms`,
                        animationFillMode: "both",
                      }}
                    >
                      <PostCard post={post} showPinBadge />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}
