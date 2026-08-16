import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface TagBadgeProps {
  tag: string
  href?: string
  className?: string
}

export function TagBadge({ tag, href, className }: TagBadgeProps) {
  const badge = (
    <Badge variant="secondary" className={cn("font-normal", className)}>
      {tag}
    </Badge>
  )

  if (href) {
    return <Link href={href}>{badge}</Link>
  }

  return badge
}
