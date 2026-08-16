import { notFound } from "next/navigation"
import { type Metadata } from "next"
import Link from "next/link"
import { getPostsByTag, getAllTags } from "@zlog/database"
import { PostCard } from "@/components/blog/post-card"
import { Trans } from "@/components/layout/trans"
import { PageHeader } from "@/components/layout/page-header"
import { Container } from "@/components/ui/container"
import { defaultLocale, t } from "@/lib/i18n"
import { EmptyState } from "@/components/ui/empty-state"

interface TagPageProps {
  params: Promise<{ tag: string }>
}

export async function generateStaticParams() {
  // 桌面 standalone 构建（NEXT_DESKTOP=true）无数据库：不枚举静态路径，
  // 运行时按需渲染（force-dynamic 不跳过 generateStaticParams，Task 12 CI 实测）
  if (process.env.NEXT_DESKTOP === "true") return []
  const tags = await getAllTags()
  return tags.map((tag) => ({ tag }))
}

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { tag } = await params
  const decodedTag = decodeURIComponent(tag)
  const titleFn = t(defaultLocale, "site.postsTagged") as (tag: string) => string
  const descFn = t(defaultLocale, "site.postsTaggedDesc") as (tag: string) => string
  return {
    title: titleFn(decodedTag),
    description: descFn(decodedTag),
  }
}

export default async function TagPage({ params }: TagPageProps) {
  const { tag } = await params
  const decodedTag = decodeURIComponent(tag)
  const allTags = await getAllTags()

  if (!allTags.some((t) => t.toLowerCase() === decodedTag.toLowerCase())) {
    notFound()
  }

  const posts = await getPostsByTag(decodedTag)

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeader
        breadcrumb={[
          { href: "/", label: <Trans k="site.home" /> },
          { href: "/", label: <Trans k="site.topics" /> },
          { href: `/tags/${encodeURIComponent(decodedTag.toLowerCase())}`, label: `#${decodedTag}` },
        ]}
        title={
          <>
            <span className="text-primary">#</span>
            {decodedTag}
          </>
        }
        description={<Trans k="site.postsCount" args={[posts.length]} />}
      />

      {/* Tags bar */}
      <Container size="sm">
        <div className="flex flex-wrap items-center gap-2">
          {allTags.map((t) => {
            const isActive = t.toLowerCase() === decodedTag.toLowerCase()
            return (
              <Link
                key={t}
                href={`/tags/${encodeURIComponent(t.toLowerCase())}`}
                className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5"
                }`}
              >
                {t}
              </Link>
            )
          })}
        </div>
      </Container>

      {/* Posts */}
      <Container className="pb-16">
        {posts.length === 0 ? (
          <EmptyState
            size="lg"
            titleAs="h2"
            title={<Trans k="site.noMatchPosts" />}
            description={<Trans k="site.noMatchPostsDesc" args={[decodedTag]} />}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <div
                key={post.slug}
                className="animate-in fade-in slide-in-from-bottom-4"
                style={{
                  animationDuration: "500ms",
                  animationDelay: `${index * 80}ms`,
                  animationFillMode: "both",
                }}
              >
                <PostCard post={post} />
              </div>
            ))}
          </div>
        )}
      </Container>
    </div>
  )
}
