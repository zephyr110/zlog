import { type Metadata } from "next"
import { notFound } from "next/navigation"
import { FolderGit2 } from "lucide-react"
import { listVisibleProjects } from "@zlog/database"
import { getSiteConfig } from "@/lib/get-site-config"
import { PageHeader } from "@/components/layout/page-header"
import { ProjectCard } from "@/components/blog/project-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Trans } from "@/components/layout/trans"
import { defaultLocale, t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: t(defaultLocale, "projects.title"),
  description: t(defaultLocale, "projects.description"),
}

export default async function ProjectsPage() {
  const [site, projects] = await Promise.all([
    getSiteConfig(),
    listVisibleProjects(),
  ])
  // 总开关关闭：页面不产出（静态导出时该路径输出 404 内容），
  // 导航也无入口。
  if (!site.projectsEnabled) notFound()

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeader
        breadcrumb={[
          { href: "/", label: <Trans k="site.home" /> },
          { href: "/projects", label: <Trans k="projects.title" /> },
        ]}
        icon={<FolderGit2 size={22} />}
        title={<Trans k="projects.title" />}
        description={<Trans k="projects.description" />}
      />

      <div className="container mx-auto max-w-5xl px-4 py-12 md:py-16 2xl:max-w-7xl">
        {projects.length === 0 ? (
          <EmptyState
            size="lg"
            titleAs="h2"
            icon={<FolderGit2 className="size-8" />}
            title={<Trans k="projects.empty" />}
            description={<Trans k="projects.emptyHint" />}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
