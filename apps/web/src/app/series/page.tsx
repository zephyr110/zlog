import { type Metadata } from "next"
import Link from "next/link"
import { getPublishedPosts } from "@zlog/database"
import { Container } from "@/components/ui/container"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Trans } from "@/components/layout/trans"
import { defaultLocale, t } from "@/lib/i18n"
import { listSeries } from "@/lib/series"
import { Layers } from "lucide-react"

export const metadata: Metadata = {
  title: t(defaultLocale, "post.seriesAllTitle") as string,
  description: t(defaultLocale, "post.seriesAllDesc") as string,
}

/** 系列总览：作者给文章打 `series-名称` 标签即成系列（前缀命名空间
 *  约定，与 category-/frontend- 同类）。 */
export default async function SeriesIndexPage() {
  const series = listSeries(await getPublishedPosts())

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeader
        breadcrumb={[
          { href: "/", label: <Trans k="site.home" /> },
          { href: "/series", label: <Trans k="post.seriesAllTitle" /> },
        ]}
        icon={<Layers size={24} />}
        title={<Trans k="post.seriesAllTitle" />}
        description={<Trans k="post.seriesAllDesc" />}
      />

      <Container className="py-10 pb-16">
        {series.length === 0 ? (
          <EmptyState
            size="lg"
            titleAs="h2"
            icon={<Layers size={40} />}
            title={<Trans k="post.seriesEmpty" />}
            description={<Trans k="post.seriesEmptyDesc" />}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {series.map((entry, index) => (
              <Link
                key={entry.name.toLowerCase()}
                href={`/series/${encodeURIComponent(entry.name.toLowerCase())}`}
                className="group animate-in fade-in slide-in-from-bottom-4 rounded-2xl border bg-card p-5 transition-all hover:border-primary/20 hover:shadow-md hover:shadow-foreground/[0.04]"
                style={{
                  animationDuration: "500ms",
                  animationDelay: `${index * 80}ms`,
                  animationFillMode: "both",
                }}
              >
                <h2 className="flex items-center gap-2 font-semibold transition-colors group-hover:text-primary">
                  <Layers size={16} className="shrink-0 text-primary" />
                  <span className="truncate">{entry.name}</span>
                </h2>
                {/* 首篇（连载按日期升序）的描述当系列简介 */}
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {entry.posts[0]?.description}
                </p>
                <p className="mt-3 text-xs text-muted-foreground/80">
                  <Trans k="site.postsCount" args={[entry.posts.length]} />
                </p>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </div>
  )
}
