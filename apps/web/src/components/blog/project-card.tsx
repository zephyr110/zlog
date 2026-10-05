import { ExternalLink } from "lucide-react"
import { GithubIcon } from "@/components/ui/brand-icons"
import { Trans } from "@/components/layout/trans"
import { ProjectCover } from "@/components/blog/project-cover"
import { type Project } from "@zlog/database"

/** 前台项目卡片：封面（无图/加载失败 → 渐变占位）→ 标题 → 简介两行 →
 *  标签 → 分隔线 → 外链行。整卡不可点，GitHub / 演示是两个平级外链。 */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:border-primary/20 hover:shadow-md">
      <div className="relative aspect-video w-full overflow-hidden">
        <ProjectCover src={project.cover} alt={project.title} />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="truncate font-semibold leading-snug">{project.title}</h3>
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {project.description}
          </p>
        )}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {(project.repoUrl || project.demoUrl) && (
          <div className="mt-auto flex items-center gap-4 border-t pt-3 text-sm">
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <GithubIcon size={15} />
                <Trans k="projects.repo" />
              </a>
            )}
            {project.demoUrl && (
              <a
                href={project.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink size={15} />
                <Trans k="projects.demo" />
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
