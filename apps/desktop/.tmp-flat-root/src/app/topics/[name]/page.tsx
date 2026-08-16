import { notFound } from "next/navigation"
import { type Metadata } from "next"
import Link from "next/link"
import { getPostsByCategory, getAllTags } from "@zlog/database"
import { PostCard } from "@/components/blog/post-card"
import { Container } from "@/components/ui/container"
import { PageHeader } from "@/components/layout/page-header"
import { Trans } from "@/components/layout/trans"
import { defaultLocale, t } from "@/lib/i18n"
import { categoryMeta, categoryKeys, type CategoryKey } from "@/lib/categories"
import { EmptyState } from "@/components/ui/empty-state"

interface CategoryPageProps {
  params: Promise<{ name: string }>
}

const knownCategories = categoryKeys as unknown as string[]

export async function generateStaticParams() {
  return knownCategories.map((name) => ({ name }))
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { name } = await params
  const meta = categoryMeta[name as CategoryKey]
  if (!meta) return { title: t(defaultLocale, "site.notFound") as string }
  return { title: t(defaultLocale, meta.i18nKey) as string, description: meta.desc }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { name } = await params
  const meta = categoryMeta[name as CategoryKey]
  if (!meta) notFound()

  const [posts, allTags] = await Promise.all([
    getPostsByCategory(name),
    getAllTags(),
  ])

  const subTags = allTags
    .filter((t) => t.startsWith(name + "-"))
    .sort()
  const Icon = meta.icon

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeader
        breadcrumb={[
          { href: "/", label: <Trans k="site.home" /> },
          {
            href: `/topics/${encodeURIComponent(name)}`,
            label: <Trans k={meta.i18nKey} />,
          },
        ]}
        icon={<Icon size={24} />}
        title={<Trans k={meta.i18nKey} />}
        description={meta.desc}
      >
        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            <Trans k="site.postsCount" args={[posts.length]} />
          </span>
          {subTags.length > 0 && (
            <span>
              <Trans k="category.tagsCount" args={[subTags.length]} />
            </span>
          )}
        </div>
      </PageHeader>

      <Container size="sm" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {knownCategories.map((c) => {
            const cm = categoryMeta[c as CategoryKey]
            if (!cm) return null
            const isActive = c === name
            return (
              <Link
                key={c}
                href={`/topics/${encodeURIComponent(c)}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/10"
                    : "bg-card text-muted-foreground hover:text-foreground hover:border-primary/25 hover:bg-primary/[0.04]"
                }`}
              >
                <Trans k={cm.i18nKey} />
              </Link>
            )
          })}
        </div>

        {subTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/60 mr-1">
              <Trans k="category.tagsLabel" />
            </span>
            {subTags.map((st) => {
              const short = st.slice(name.length + 1)
              return (
                <Link
                  key={st}
                  href={`/tags/${encodeURIComponent(st)}`}
                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-mono"
                >
                  {short}
                </Link>
              )
            })}
          </div>
        )}
      </Container>

      <Container className="pb-16">
        {posts.length === 0 ? (
          <EmptyState
            size="lg"
            titleAs="h2"
            icon={<Icon size={28} className="text-muted-foreground/50" />}
            iconClassName="size-16 mb-4"
            titleClassName="text-xl"
            title={<Trans k="category.empty" />}
            description={
              <span className="text-sm max-w-sm inline-block">
                <Trans k="category.emptyDesc" />
              </span>
            }
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
