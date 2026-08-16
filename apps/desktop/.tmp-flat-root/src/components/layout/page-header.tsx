import Link from "next/link"
import type { ReactNode } from "react"
import { Container } from "@/components/ui/container"
import { HeroGlow } from "@/components/layout/hero-glow"

interface BreadcrumbItem {
  href: string
  label: ReactNode
}

interface PageHeaderProps {
  title: ReactNode
  /** Breadcrumb trail; the last item is rendered as the current page. */
  breadcrumb?: BreadcrumbItem[]
  description?: ReactNode
  /** Icon rendered in a tinted tile beside the title (category-style). */
  icon?: ReactNode
  /** Extra content on the right side of the title row (actions, counts). */
  actions?: ReactNode
  children?: ReactNode
}

/** Shared page hero: breadcrumb + icon/title row, login-style top glow. */
export function PageHeader({
  title,
  breadcrumb,
  description,
  icon,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <section className="relative overflow-hidden border-b bg-muted/10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.06] to-transparent"
      />
      <HeroGlow />
      <Container size="lg" className="relative">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="mb-6 flex items-center gap-2 text-sm text-muted-foreground"
            >
              {breadcrumb.map((item, i) => (
                <span key={`${item.href}-${i}`} className="flex items-center gap-2">
                  {i > 0 && <span className="opacity-40">/</span>}
                  {i === breadcrumb.length - 1 ? (
                    <span className="font-medium text-foreground">
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          )}

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              {icon && (
                <div
                  aria-hidden
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                >
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  {title}
                </h1>
                {description && (
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {actions}
          </div>

          {children}
        </div>
      </Container>
    </section>
  )
}
