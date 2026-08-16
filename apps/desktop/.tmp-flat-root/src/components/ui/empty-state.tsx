import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: ReactNode
  /** Plain string or rich nodes (e.g. <Trans />). */
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  /** `lg` uses py-24 to match public feed empty blocks; default py-20 (admin). */
  size?: "md" | "lg"
  /** Override padding / layout — e.g. py-0 inside a flex-1 wrapper. */
  className?: string
  /** Heading level — public feeds use h2, admin cards use h3. */
  titleAs?: "h2" | "h3"
  /** Extra classes on the icon circle (e.g. size-16 mb-4). */
  iconClassName?: string
  titleClassName?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
  titleAs: TitleTag = "h3",
  iconClassName,
  titleClassName,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "lg" ? "py-24" : "py-20",
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            "mb-6 flex size-20 items-center justify-center rounded-full bg-muted",
            iconClassName
          )}
        >
          {icon}
        </div>
      )}
      <TitleTag
        className={cn(
          "mb-2 font-semibold",
          TitleTag === "h2" ? "text-2xl" : "text-lg",
          titleClassName
        )}
      >
        {title}
      </TitleTag>
      {description && (
        <p className="mb-4 max-w-md text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  )
}
