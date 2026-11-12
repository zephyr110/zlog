import Link from "next/link"
import type { ReactNode } from "react"
import { Container } from "@/components/ui/container"
import {
  BannerArt,
  pageBannerDecorClass,
  pageBannerMinClass,
} from "@/components/layout/banner-art"
import { cn } from "@/lib/utils"

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
  /** Decorative artwork on the banner's right side (lg+). */
  decor?: ReactNode
  children?: ReactNode
}

/** Shared page hero: breadcrumb + icon/title row, login-style top glow. */
export function PageHeader({
  title,
  breadcrumb,
  description,
  icon,
  actions,
  decor,
  children,
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        "relative flex flex-col overflow-hidden border-b bg-background",
        pageBannerMinClass
      )}
    >
      <BannerArt />
      <Container className="relative flex flex-1 items-center gap-8 py-12 md:py-16 xl:gap-12">
        <div className="min-w-0 flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700">
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

        {decor && (
          <div className={pageBannerDecorClass}>
            <div className="motion-safe:animate-in fade-in zoom-in-95 duration-700">
              {decor}
            </div>
          </div>
        )}
      </Container>
    </section>
  )
}
