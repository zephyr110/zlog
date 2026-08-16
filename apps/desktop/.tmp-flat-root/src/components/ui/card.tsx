"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CardCollapseContextValue = {
  collapsible: boolean
  open: boolean
  toggle: () => void
}

const CardCollapseContext = React.createContext<CardCollapseContextValue>({
  collapsible: false,
  open: true,
  toggle: () => {},
})

function Card({
  className,
  size = "default",
  collapsible = false,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  collapseLabel = "Collapse",
  expandLabel = "Expand",
  children,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  /** Show a top-right control that collapses CardContent / CardFooter. */
  collapsible?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Accessible labels for the collapse toggle — localize via the caller. */
  collapseLabel?: string
  expandLabel?: string
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : uncontrolledOpen

  const toggle = React.useCallback(() => {
    const next = !open
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }, [open, isControlled, onOpenChange])

  const ctx = React.useMemo(
    () => ({ collapsible, open, toggle }),
    [collapsible, open, toggle]
  )

  return (
    <CardCollapseContext.Provider value={ctx}>
      <div
        data-slot="card"
        data-size={size}
        data-collapsible={collapsible ? "true" : undefined}
        data-state={collapsible ? (open ? "open" : "collapsed") : undefined}
        className={cn(
          "group/card relative flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] transition-[gap] duration-300 ease-in-out has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 data-[state=collapsed]:gap-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
          className
        )}
        {...props}
      >
        {collapsible && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-expanded={open}
            aria-label={open ? collapseLabel : expandLabel}
            onClick={toggle}
            className="absolute top-(--card-spacing) right-(--card-spacing) z-10 text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "transition-transform duration-300 ease-in-out",
                open && "rotate-180"
              )}
            />
          </Button>
        )}
        {children}
      </div>
    </CardCollapseContext.Provider>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing) group-data-[collapsible=true]/card:pr-10",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end group-data-[collapsible=true]/card:me-8",
        className
      )}
      {...props}
    />
  )
}

function CollapsibleSection({
  slot,
  children,
}: {
  /** Preserve Card `has-data-[slot=…]` selectors while animating. */
  slot: string
  children: React.ReactNode
}) {
  const { collapsible, open } = React.useContext(CardCollapseContext)

  if (!collapsible) return children

  return (
    <div
      data-slot={slot}
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-in-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  const { collapsible } = React.useContext(CardCollapseContext)
  const inner = (
    <div
      data-slot={collapsible ? undefined : "card-content"}
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
  return <CollapsibleSection slot="card-content">{inner}</CollapsibleSection>
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  const { collapsible } = React.useContext(CardCollapseContext)
  const inner = (
    <div
      data-slot={collapsible ? undefined : "card-footer"}
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
  return <CollapsibleSection slot="card-footer">{inner}</CollapsibleSection>
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
