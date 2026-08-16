"use client"

import { Link } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/components/layout/trans"
import type { HTMLAttributes, ReactNode } from "react"

interface HeadingLinkProps extends HTMLAttributes<HTMLHeadingElement> {
  as: "h1" | "h2" | "h3"
  id?: string
  children: ReactNode
}

/** Recursively extract plain text from React nodes for slug generation. */
function extractText(node: ReactNode): string {
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractText).join("")
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children)
  }
  return ""
}

function slugify(children: ReactNode): string {
  return extractText(children)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

export function HeadingLink({ as: Tag, id, children, className, ...props }: HeadingLinkProps) {
  const { t } = useT()
  const anchor = id || slugify(children)
  const ariaLabel =
    typeof children === "string"
      ? t("a11y.linkTo")(children)
      : (t("a11y.linkToHeading"))

  const baseStyles = cn(
    "group relative flex items-center gap-2 font-bold tracking-tight scroll-mt-20",
    Tag === "h1" && "text-3xl mt-10 mb-6",
    Tag === "h2" && "text-2xl mt-12 mb-4",
    Tag === "h3" && "text-xl mt-8 mb-3",
    className
  )

  return (
    <Tag id={anchor} className={baseStyles} {...props}>
      {/* min-w-0 lets inline-code chips with overflow-wrap:break-word
          actually wrap instead of overflowing the heading (flex items
          default to min-width:auto, which defeats break-word). */}
      <span className="min-w-0">{children}</span>
      <a
        href={`#${anchor}`}
        className="inline-flex items-center justify-center -ml-1 size-6 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all duration-200 text-muted-foreground hover:text-primary"
        aria-label={ariaLabel}
      >
        <Link size={14} />
      </a>
    </Tag>
  )
}
