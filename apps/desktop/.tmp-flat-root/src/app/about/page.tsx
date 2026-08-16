import { type Metadata } from "next"
import { Separator } from "@/components/ui/separator"
import { getSiteConfig } from "@/lib/get-site-config"
import { Trans } from "@/components/layout/trans"
import { defaultLocale, t } from "@/lib/i18n"
import { PageHeader } from "@/components/layout/page-header"
import { Sparkles, Palette, FileCode, Cloud, Rocket, Database, UserRound } from "lucide-react"
import { GithubIcon, XIcon } from "@/components/ui/brand-icons"
import type { TranslationPath } from "@/lib/i18n"

export const metadata: Metadata = {
  title: t(defaultLocale, "about.title"),
  description: t(defaultLocale, "about.description"),
}

const techStack: {
  name: string
  descKey: TranslationPath
  icon: typeof Rocket
}[] = [
  {
    name: "Next.js 16",
    descKey: "about.rendered",
    icon: Rocket,
  },
  {
    name: "shadcn/ui",
    descKey: "about.components",
    icon: Sparkles,
  },
  {
    name: "Tailwind CSS",
    descKey: "about.styling",
    icon: Palette,
  },
  {
    name: "MDX",
    descKey: "about.content",
    icon: FileCode,
  },
  {
    name: "Turso",
    descKey: "about.database",
    icon: Database,
  },
  {
    name: "Vercel",
    descKey: "about.hosting",
    icon: Cloud,
  },
]

export default async function AboutPage() {
  const site = await getSiteConfig()
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <PageHeader
        breadcrumb={[
          { href: "/", label: <Trans k="site.home" /> },
          { href: "/about", label: <Trans k="about.title" /> },
        ]}
        icon={<UserRound size={22} />}
        title={<Trans k="about.title" />}
        description={<Trans k="about.description" />}
      />

      <div className="container mx-auto px-4 py-16 md:py-20 max-w-5xl 2xl:max-w-7xl space-y-16">
        {/* About Me */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-2xl font-bold mb-4">
            <Trans k="about.aboutMe" />
          </h2>
          <div className="prose dark:prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
            <p>
              <Trans k="about.aboutMeContent" />
            </p>
            <p>
              <Trans k="about.aboutMeContent2" />
            </p>
          </div>
        </section>

        <Separator />

        {/* Tech Stack */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-2xl font-bold mb-2">
            <Trans k="about.techStack" />
          </h2>
          <p className="text-muted-foreground mb-8">
            <Trans k="about.techStackDesc" />
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {techStack.map((tech) => {
              const Icon = tech.icon
              return (
                <div
                  key={tech.name}
                  className="group flex items-start gap-4 p-4 rounded-xl border bg-card hover:border-primary/20 hover:shadow-sm transition-all"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{tech.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <Trans k={tech.descKey} />
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <Separator />

        {/* Contact */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-2xl font-bold mb-4">
            <Trans k="about.contact" />
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            <Trans k="about.contactDesc" />
          </p>
          {(site.social.github || site.social.twitter) && (
            <div className="flex gap-3">
              {site.social.github ? (
                <a
                  href={site.social.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted hover:border-primary/20 transition-all text-sm font-medium"
                >
                  <GithubIcon size={16} />
                  <Trans k="about.github" />
                </a>
              ) : null}
              {site.social.twitter ? (
                <a
                  href={site.social.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted hover:border-primary/20 transition-all text-sm font-medium"
                >
                  <XIcon size={16} />
                  <Trans k="about.twitter" />
                </a>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
