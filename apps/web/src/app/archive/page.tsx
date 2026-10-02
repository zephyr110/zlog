import { Suspense } from "react"
import { type Metadata } from "next"
import { Archive } from "lucide-react"
import { getPublishedPosts } from "@zlog/database"
import { Trans } from "@/components/layout/trans"
import { defaultLocale, t } from "@/lib/i18n"
import { PageHeader } from "@/components/layout/page-header"
import { Container } from "@/components/ui/container"
import { ArchiveFeed } from "./archive-feed"
import { ArchiveFeedSkeleton } from "./loading"
import { isSeriesTag } from "@/lib/series"

export const metadata: Metadata = {
  title: t(defaultLocale, "archive.title") as string,
  description: t(defaultLocale, "archive.description") as string,
}

export default async function ArchivePage() {
  const posts = await getPublishedPosts()
  // Tags derived from the published posts themselves — getAllTags() also
  // read draft rows, leaking draft-only categories into the filter pills.
  // 系列 tag 不是筛选维度（它是系列连载的元数据），不进筛选药丸。
  const allTags = [...new Set(posts.flatMap((p) => p.tags))].filter(
    (tag) => !isSeriesTag(tag)
  )

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeader
        breadcrumb={[
          { href: "/", label: <Trans k="site.home" /> },
          { href: "/archive", label: <Trans k="archive.title" /> },
        ]}
        icon={<Archive size={22} />}
        title={<Trans k="archive.title" />}
        description={<Trans k="archive.total" args={[posts.length]} />}
      />

      <Container className="py-8 md:py-12">
        {/* Suspense is required for the client-side useSearchParams in
            the static export build. */}
        <Suspense fallback={<ArchiveFeedSkeleton />}>
          <ArchiveFeed posts={posts} allTags={allTags} />
        </Suspense>
      </Container>
    </div>
  )
}
