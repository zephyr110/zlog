import { cache } from "react"
import { notFound } from "next/navigation"
import { type Metadata } from "next"
import Link from "next/link"
import { getPublishedPosts } from "@zlog/database"
import { Container } from "@/components/ui/container"
import { PageHeader } from "@/components/layout/page-header"
import { FormattedDate } from "@/components/blog/formatted-date"
import { Trans } from "@/components/layout/trans"
import { defaultLocale, t } from "@/lib/i18n"
import { collectSeriesPosts, listSeries, seriesName, seriesTagOf } from "@/lib/series"
import { Calendar, Clock, Layers } from "lucide-react"

interface SeriesPageProps {
  params: Promise<{ name: string }>
}

/** generateMetadata 与页面体在同一请求内各要一份全量列表——React
 *  cache 按请求去重（get-site-config 同款做法），渲染不再多查一次。 */
const getSeriesSource = cache(getPublishedPosts)

export async function generateStaticParams() {
  // 桌面 standalone 构建（NEXT_DESKTOP=true）无数据库：不枚举静态路径，
  // 运行时按需渲染（与 posts/[slug]、tags/[tag] 同款处理）。
  if (process.env.NEXT_DESKTOP === "true") return []
  const series = listSeries(await getSeriesSource())
  // 导出构建要求动态路由至少产出一个路径——空数组会被判 "missing
  // generateStaticParams()" 直接终止构建（Next 16 实测：判定条件是
  // prerenderedRoutes.length > 0，而非函数是否存在）。尚无系列文章
  // 时给一个占位：该路径预渲染时成员为空 → 页面 notFound()，导出成
  // 404 内容页；日后有系列后被真实路径自然覆盖。
  if (series.length === 0) return [{ name: "_" }]
  return series.map((entry) => ({ name: entry.name.toLowerCase() }))
}

export async function generateMetadata({
  params,
}: SeriesPageProps): Promise<Metadata> {
  const { name } = await params
  const decoded = decodeURIComponent(name)
  const posts = collectSeriesPosts(await getSeriesSource(), decoded)
  if (posts.length === 0) {
    return { title: t(defaultLocale, "site.notFound") as string }
  }
  const tag = seriesTagOf(posts[0].tags)
  const displayName = tag ? seriesName(tag) : decoded
  return {
    title: displayName,
    description: t(defaultLocale, "post.seriesAllDesc") as string,
  }
}

/** 单个系列：全部成员按连载顺序（日期升序）编号列出。URL 里的名字
 *  是小写形式，展示名取首篇成员标签的原始大小写。 */
export default async function SeriesPage({ params }: SeriesPageProps) {
  const { name } = await params
  const decoded = decodeURIComponent(name)
  const posts = collectSeriesPosts(await getSeriesSource(), decoded)
  if (posts.length === 0) notFound()

  const tag = seriesTagOf(posts[0].tags)
  const displayName = tag ? seriesName(tag) : decoded

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeader
        breadcrumb={[
          { href: "/", label: <Trans k="site.home" /> },
          { href: "/series", label: <Trans k="post.seriesAllTitle" /> },
          {
            href: `/series/${encodeURIComponent(decoded)}`,
            label: displayName,
          },
        ]}
        icon={<Layers size={24} />}
        title={displayName}
        description={<Trans k="site.postsCount" args={[posts.length]} />}
      />

      <Container className="py-10 pb-16">
        <ol className="space-y-4">
          {posts.map((post, index) => (
            <li
              key={post.slug}
              className="animate-in fade-in slide-in-from-bottom-4"
              style={{
                animationDuration: "500ms",
                animationDelay: `${index * 80}ms`,
                animationFillMode: "both",
              }}
            >
              <Link
                href={`/posts/${encodeURIComponent(post.slug)}`}
                className="group flex gap-4 rounded-2xl border bg-card p-5 transition-all hover:border-primary/20 hover:shadow-md hover:shadow-foreground/[0.04]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold transition-colors group-hover:text-primary">
                    {post.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {post.description}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground/80">
                    <Calendar size={10} />
                    <FormattedDate date={post.date} month="short" />
                    <span>·</span>
                    <Clock size={10} />
                    <Trans k="post.minRead" args={[post.readingTime]} />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </Container>
    </div>
  )
}
