import { notFound } from "next/navigation"
import { type Metadata } from "next"
import Link from "next/link"
import { getPostBySlug, getPublishedPosts } from "@zlog/database"
import { getSiteConfig } from "@/lib/get-site-config"
import { defaultLocale, t } from "@/lib/i18n"
import { MDXRenderer } from "@/components/blog/mdx-renderer"
import { TagBadge } from "@/components/blog/tag-badge"
import { ReadingProgress } from "@/components/blog/reading-progress"
import { FormattedDate } from "@/components/blog/formatted-date"
import { Container } from "@/components/ui/container"
import {
  CopyLinkButton,
  ShareCardButton,
} from "@/components/blog/share-buttons"
import { CommentSection } from "@/components/blog/comment-section"
import { HeroGlow } from "@/components/layout/hero-glow"
import { Trans } from "@/components/layout/trans"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Calendar, ChevronLeft, ChevronRight, Clock, Layers } from "lucide-react"
import { rankRelatedPosts } from "@/lib/related"
import { buildSeriesNav, publicTags, sameSeries } from "@/lib/series"
import { POST_PROSE_CLASSES } from "@/lib/prose"

interface PostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  // 桌面 standalone 构建（NEXT_DESKTOP=true）无数据库：不枚举静态路径，
  // 运行时按需渲染（force-dynamic 不跳过 generateStaticParams，Task 12 CI 实测）
  if (process.env.NEXT_DESKTOP === "true") return []
  const posts = await getPublishedPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params
  const [post, site] = await Promise.all([
    getPostBySlug(slug),
    getSiteConfig(),
  ])
  if (!post) return { title: t(defaultLocale, "site.notFound") as string }

  const ogImageUrl = (path: string) =>
    path.startsWith("http") ? path : `${site.siteUrl}${path}`

  // A real cover beats a generated card; posts without one get a
  // per-post card (title, date, reading time, tags) from /api/og — which
  // only exists on the server build. The static export (GitHub Pages
  // mirror) has no route handlers, so there it falls back to the
  // site-wide OG image instead of linking a 404.
  const postImage = post.cover
    ? ogImageUrl(post.cover)
    : process.env.NEXT_EXPORT === "true"
      ? `${site.siteUrl}${site.ogImage}`
      : `${site.siteUrl}/api/og/${post.slug}`

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updated,
      tags: post.tags,
      images: [
        {
          url: postImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [postImage],
    },
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params
  const [post, site] = await Promise.all([
    getPostBySlug(slug),
    getSiteConfig(),
  ])

  if (!post || post.draft) notFound()

  // 分享卡二维码用规范地址：桌面壳/本地预览下扫出来也指向线上文章
  const shareUrl = `${site.siteUrl}/posts/${encodeURIComponent(post.slug)}`

  // 相关推荐与系列导航共用同一份已发布列表；相关推荐排除同系列
  // （系列成员有自己的上下篇导航，不占推荐位）。
  const allPosts = await getPublishedPosts()
  const seriesNav = buildSeriesNav(allPosts, slug)
  const relatedPosts = rankRelatedPosts(
    post,
    allPosts.filter((candidate) => !sameSeries(candidate.tags, post.tags)),
    3
  )

  return (
    <>
      <ReadingProgress />

      <article className="min-h-screen">
        {/* Hero Header */}
        <header className="relative overflow-hidden border-b bg-gradient-to-b from-muted/40 via-muted/20 to-background">
          {/* Login-style top glow only when there is no cover — covers
              already fill the hero, so a second wash would muddy them. */}
          {!post.cover && (
            <HeroGlow className="h-52 md:h-64 opacity-[0.14] dark:opacity-20" />
          )}
          {post.cover && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.cover}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* Legibility scrim — the cover shows at full opacity; a
                  background-colored gradient (strongest behind the title
                  block, fading upward) keeps the breadcrumb/title readable
                  on busy art in both themes without hiding the image. */}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/25" />
            </>
          )}

          <Container size="lg" className="relative">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8 animate-in fade-in slide-in-from-top-2 duration-500">
              <Link
                href="/"
                className="hover:text-foreground transition-colors"
              >
                <Trans k="site.home" />
              </Link>
              <span className="opacity-40">/</span>
              <span className="text-foreground/70 truncate max-w-[200px]">
                {post.title}
              </span>
            </nav>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.15] animate-in fade-in slide-in-from-bottom-4 duration-500">
              {post.title}
            </h1>

            {/* Description */}
            {post.description && (
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {post.description}
              </p>
            )}

            {/* Author & Meta */}
            <div className="flex flex-wrap items-center gap-4 md:gap-6 text-sm text-muted-foreground animate-in fade-in duration-700">
              <div className="flex items-center gap-3">
                <Avatar className="size-10 ring-2 ring-border">
                  {/* Same gradient tile as the admin sidebar's avatar. */}
                  <AvatarFallback className="bg-gradient-to-br from-primary/30 via-primary/20 to-primary/5 text-primary font-semibold text-sm">
                    {(site.author.name || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">
                    {site.author.name}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Calendar size={12} />
                    <FormattedDate date={post.date} />
                    <span className="opacity-40">·</span>
                    <Clock size={12} />
                    <span>
                      <Trans k="post.minRead" args={[post.readingTime]} />
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags（系列 tag 是元数据，单独走系列入口，不混在标签行） */}
              {publicTags(post.tags).length > 0 && (
                <>
                  <span className="hidden md:block opacity-20">|</span>
                  <div className="flex flex-wrap gap-1.5">
                    {publicTags(post.tags).map((tag) => (
                      <TagBadge
                        key={tag}
                        tag={tag}
                        href={`/tags/${encodeURIComponent(tag.toLowerCase())}`}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Share */}
              <div className="ml-auto flex items-center gap-1">
                <ShareCardButton
                  url={shareUrl}
                  slug={post.slug}
                  title={post.title}
                  date={post.date}
                  siteName={site.name}
                />
                <CopyLinkButton url={`/posts/${encodeURIComponent(post.slug)}`} />
              </div>
            </div>
          </Container>
        </header>

        {/* Content */}
        <Container size="md">
          {seriesNav && (
            <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-card/60 px-4 py-3">
              <Link
                href={`/series/${encodeURIComponent(seriesNav.name.toLowerCase())}`}
                className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Layers size={14} className="shrink-0" />
                <span className="shrink-0">
                  <Trans k="post.seriesLabel" />
                </span>
                <span className="truncate font-semibold text-foreground">
                  {seriesNav.name}
                </span>
              </Link>
              <span className="text-xs text-muted-foreground">
                <Trans
                  k="post.seriesPosition"
                  args={[seriesNav.position, seriesNav.total]}
                />
              </span>
              <div className="ml-auto flex items-center gap-2">
                {seriesNav.prev && (
                  <Link
                    href={`/posts/${encodeURIComponent(seriesNav.prev.slug)}`}
                    title={seriesNav.prev.title}
                    className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                  >
                    <ChevronLeft size={12} />
                    <Trans k="post.seriesPrev" />
                  </Link>
                )}
                {seriesNav.next && (
                  <Link
                    href={`/posts/${encodeURIComponent(seriesNav.next.slug)}`}
                    title={seriesNav.next.title}
                    className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                  >
                    <Trans k="post.seriesNext" />
                    <ChevronRight size={12} />
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className={POST_PROSE_CLASSES}>
            <MDXRenderer post={post} />
          </div>

          {/* Post Footer */}
          <div className="my-12 rounded-2xl border bg-card p-5 md:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-3">
                {publicTags(post.tags).length > 0 && (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                      <Trans k="post.tagsLabel" />
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {publicTags(post.tags).map((tag) => (
                        <TagBadge
                          key={tag}
                          tag={tag}
                          href={`/tags/${encodeURIComponent(tag.toLowerCase())}`}
                          className="bg-muted/50 text-foreground hover:bg-muted"
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 sm:pt-6">
                <ShareCardButton
                  url={shareUrl}
                  slug={post.slug}
                  title={post.title}
                  date={post.date}
                  siteName={site.name}
                />
                <CopyLinkButton
                  url={`/posts/${encodeURIComponent(post.slug)}`}
                />
              </div>
            </div>
          </div>
        </Container>

        {/* Comments */}
        <CommentSection slug={post.slug} />

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="border-t bg-gradient-to-b from-muted/20 to-background">
            <Container className="py-14">
              <h2 className="text-2xl font-bold mb-8">
                <Trans k="post.relatedPosts" />
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {relatedPosts.map((rp) => (
                  <Link
                    key={rp.slug}
                    href={`/posts/${encodeURIComponent(rp.slug)}`}
                    className="group flex flex-col rounded-2xl border bg-card p-5 hover:border-primary/20 hover:shadow-md hover:shadow-foreground/[0.04] transition-all"
                  >
                    <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {rp.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {rp.description}
                    </p>
                    <p className="mt-auto text-xs text-muted-foreground/80 flex items-center gap-1.5">
                      <Calendar size={10} />
                      <FormattedDate date={rp.date} month="short" />
                      <span>·</span>
                      <Clock size={10} />
                      <Trans k="post.minRead" args={[rp.readingTime]} />
                    </p>
                  </Link>
                ))}
              </div>
            </Container>
          </section>
        )}

        {/* Back to the full article index */}
        <div className="text-center py-8">
          <Link
            href="/archive"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trans k="site.backToPosts" />
          </Link>
        </div>
      </article>
    </>
  )
}
