"use client"

import {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
} from "react"
import { useT } from "@/components/layout/trans"
import { useLocale } from "@/components/layout/i18n-provider"
import { useCanHover } from "@/hooks/use-media-query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatLocalDate } from "@/lib/date"

interface ContributionCalendarProps {
  posts: { date: string }[]
}

const CELL_GAP = 3
/** Floor cell size so a phone never crushes the year into unreadable
 *  3–4px dots. Below this the grid grows past the card and scrolls. */
const CELL_MIN = 11
// Intensity levels use the shadcn chart-2 token (same family as the
// posts-over-time series) so cells and tooltip indicators share one palette.
const LEVEL_COLORS = [
  "color-mix(in oklch, var(--muted) 70%, transparent)",
  "color-mix(in oklch, var(--chart-2) 28%, var(--muted))",
  "color-mix(in oklch, var(--chart-2) 48%, var(--muted))",
  "color-mix(in oklch, var(--chart-2) 72%, transparent)",
  "var(--chart-2)",
]

function getLevel(count: number): number {
  if (count === 0) return 0
  if (count <= 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

interface TooltipState {
  date: string
  count: number
  /** Center-x of the hovered cell, relative to the grid container. */
  x: number
  /** Top of the tooltip (cell top − gap), relative to the container. */
  y: number
  /** Horizontal alignment — flips near the edges so the card's
      overflow-hidden never clips the bubble. */
  align: "left" | "center" | "right"
  /** Vertical side — top-row cells flip below so the scrollport
      (overflow-x-auto ⇒ overflow-y: auto) can't clip the bubble. */
  side: "top" | "bottom"
}

/** Bubble height + gap; cells in rows closer to the container top than
 *  this flip the tooltip below the cell instead. */
const TOOLTIP_FLIP_ABOVE_MIN = 72

/** Calendar window: either the rolling past year or a specific year. */
function buildWeeks(
  countsByDay: Map<string, number>,
  selectedYear: number | null
): { date: Date; key: string; count: number }[][] {
  let start: Date
  if (selectedYear) {
    // Calendar year: Jan 1 … Dec 31. The Sunday-aligned window can start
    // up to 6 days in the previous December and Math.ceil(totalDays / 7)
    // columns would spill past Dec 31 into January — stop at the year
    // boundary so the NEXT year's post counts never bleed into this
    // year's heatmap (the last column simply holds fewer than 7 cells).
    start = new Date(selectedYear, 0, 1)
    start.setDate(start.getDate() - start.getDay()) // align to Sunday
    const end = new Date(selectedYear, 11, 31)
    const weeks: { date: Date; key: string; count: number }[][] = []
    const cursor = new Date(start)
    for (let w = 0; w < 53; w++) {
      const column: { date: Date; key: string; count: number }[] = []
      for (let d = 0; d < 7; d++) {
        if (cursor.getTime() > end.getTime()) break
        const key = formatLocalDate(cursor)
        column.push({ date: new Date(cursor), key, count: countsByDay.get(key) || 0 })
        cursor.setDate(cursor.getDate() + 1)
      }
      if (column.length === 0) break
      weeks.push(column)
    }
    return weeks
  }

  // Rolling 365-day window aligned to a Sunday start, GitHub-style.
  const end = new Date()
  start = new Date(end)
  start.setDate(start.getDate() - 364)
  start.setDate(start.getDate() - start.getDay())

  const weeks: { date: Date; key: string; count: number }[][] = []
  const cursor = new Date(start)
  for (let w = 0; w < 53; w++) {
    const column: { date: Date; key: string; count: number }[] = []
    for (let d = 0; d < 7; d++) {
      const key = formatLocalDate(cursor)
      column.push({ date: new Date(cursor), key, count: countsByDay.get(key) || 0 })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(column)
  }
  return weeks
}

export function ContributionCalendar({ posts }: ContributionCalendarProps) {
  const { t } = useT()
  const { locale } = useLocale()
  const [mounted, setMounted] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null) // null = past year
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fine pointer + hover → desktop tooltips; touch devices use tap.
  const canHover = useCanHover()

  useEffect(() => {
    setMounted(true) // eslint-disable-line react-hooks/set-state-in-effect
  }, [])

  // Count published posts per day (YYYY-MM-DD)
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const post of posts) {
      const key = post.date.slice(0, 10)
      map.set(key, (map.get(key) || 0) + 1)
    }
    return map
  }, [posts])

  // Years available in the data, newest first
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    for (const post of posts) {
      const y = Number(post.date.slice(0, 4))
      if (Number.isFinite(y)) years.add(y)
    }
    return [...years].sort((a, b) => b - a)
  }, [posts])

  const weeks = useMemo(
    () => buildWeeks(countsByDay, selectedYear),
    [countsByDay, selectedYear]
  )

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
        month: "short",
      }),
    [locale]
  )
  const monthFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [locale]
  )

  // Month labels above the columns (shown at month boundaries). Columns
  // are only ~CELL_MIN wide, so short names ("Dec"/"1月") already span
  // multiple columns — skip/replace when two boundaries land closer than
  // MIN_LABEL_GAP so labels never paint on top of each other.
  const MIN_LABEL_GAP = 4
  const monthLabels = useMemo(() => {
    const labels: { index: number; text: string }[] = []
    let lastMonth = -1
    weeks.forEach((column, colIdx) => {
      const first = column[0].date
      if (first.getMonth() === lastMonth) return
      lastMonth = first.getMonth()
      const text = fmt.format(first)
      const prev = labels[labels.length - 1]
      if (prev && colIdx - prev.index < MIN_LABEL_GAP) {
        // Prefer the later boundary (e.g. drop a 1-week "Dec" lead-in
        // that would collide with "Jan").
        labels[labels.length - 1] = { index: colIdx, text }
      } else {
        labels.push({ index: colIdx, text })
      }
    })
    return labels
  }, [weeks, fmt])

  // Grid floor width — below this the card scrolls instead of crushing
  // cells. Above it the flex columns still grow to fill the card.
  const gridMinWidth = weeks.length * (CELL_MIN + CELL_GAP) - CELL_GAP

  // Edge fades advertise that the year continues off-screen — without
  // a visible scrollbar (hidden for chrome cleanliness) users otherwise
  // read a clipped graph as a layout bug.
  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(max - el.scrollLeft > 2)
  }, [])

  // Recent-year view: pin the scrollport to "now" (GitHub-style). A
  // specific calendar year starts at January.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !mounted) return
    el.scrollLeft = selectedYear == null ? el.scrollWidth : 0
    updateScrollEdges()
  }, [mounted, selectedYear, weeks.length, updateScrollEdges])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !mounted) return
    updateScrollEdges()
    el.addEventListener("scroll", updateScrollEdges, { passive: true })
    const ro = new ResizeObserver(updateScrollEdges)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollEdges)
      ro.disconnect()
    }
  }, [mounted, weeks.length, updateScrollEdges])

  const showTooltipFor = useCallback(
    (el: HTMLElement, date: string, count: number) => {
      const rect = el.getBoundingClientRect()
      const containerRect = containerRef.current?.getBoundingClientRect()
      const scrollRect = scrollRef.current?.getBoundingClientRect()
      const originX = containerRect ? containerRect.left : 0
      const originY = containerRect ? containerRect.top : 0
      // Both rects move together when the parent scrolls, so the
      // difference is already content-local — do NOT add scrollLeft.
      const x = rect.left - originX + rect.width / 2
      // Alignment uses the visible scrollport so edge flips match what
      // the user actually sees, not the off-screen content box.
      const visibleX =
        rect.left - (scrollRect?.left ?? 0) + rect.width / 2
      const width = scrollRect?.width ?? 0
      const align =
        visibleX < width * 0.18
          ? "left"
          : visibleX > width * 0.82
            ? "right"
            : "center"
      // Top rows: the bubble (−translate-y-full above the cell) would sit
      // above the scrollport's top edge and get clipped — flip below.
      const cellTop = rect.top - originY
      const flipBelow = cellTop < TOOLTIP_FLIP_ABOVE_MIN
      setTooltip({
        date,
        count,
        x,
        y: flipBelow ? rect.bottom - originY + 8 : cellTop - 8,
        align,
        side: flipBelow ? "bottom" : "top",
      })
    },
    []
  )

  // Tap-outside dismisses the mobile tooltip.
  useEffect(() => {
    if (!tooltip || canHover) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (containerRef.current?.contains(target)) return
      setTooltip(null)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [tooltip, canHover])

  // Year filter — shared by the mounted card and the SSR placeholder so
  // the header chrome doesn't jump when the heatmap hydrates.
  const yearFilter = (
    <Select
      value={selectedYear ? String(selectedYear) : "recent"}
      onValueChange={(v) =>
        setSelectedYear(v === "recent" ? null : Number(v))
      }
    >
      <SelectTrigger size="sm" className="w-36">
        {/* Explicit children: Base UI's SelectValue only renders the
            matched item label when items/itemToStringLabel are given —
            otherwise it falls back to the raw value string ("recent"
            instead of the "Past year"/"最近一年" translation). */}
        <SelectValue>
          {selectedYear
            ? String(selectedYear)
            : (t("admin.calendarRecent"))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="recent">
          {t("admin.calendarRecent")}
        </SelectItem>
        {availableYears.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  // SSR-safe: skip rendering the calendar until mounted to avoid
  // hydration mismatches from new Date(). Title + year filter still
  // paint so the card header doesn't flash empty.
  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("admin.postsCalendar")}
          </CardTitle>
          <CardAction>{yearFilter}</CardAction>
        </CardHeader>
        <CardContent>
          {/* Match dashboard page skeleton totals (month-label row +
              heatmap): phones ~90px grid, md+ ~118px, so hydrate doesn't
              collapse under the page-level placeholder. */}
          <div className="flex flex-col gap-1.5">
            <div className="h-3.5 animate-pulse rounded-sm bg-muted/70" />
            <div className="h-[90px] animate-pulse rounded-md bg-muted md:h-[118px]" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("admin.postsCalendar")}
        </CardTitle>
        <CardAction>{yearFilter}</CardAction>
      </CardHeader>
      <CardContent>
      {/* Scrollport — phones get a swipeable year; wide cards still fill.
          Edge fades replace the hidden scrollbar as a scroll affordance. */}
      <div className="relative">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-card to-transparent transition-opacity",
            canScrollLeft ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-card to-transparent transition-opacity",
            canScrollRight ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          ref={scrollRef}
          className="overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
        <div
          className="relative"
          ref={containerRef}
          style={{ minWidth: gridMinWidth }}
        >
          {/* Month labels — absolutely placed at week columns so a short
              name isn't clipped to an 11px flex cell (which caused Dec/Jan
              to stack into "Dedan"). Collision avoidance lives in
              monthLabels above. */}
          <div className="relative mb-1.5 h-3.5">
            {monthLabels.map((label) => (
              <span
                key={`${label.index}-${label.text}`}
                className="absolute top-0 text-[11px] font-medium leading-none text-muted-foreground whitespace-nowrap"
                style={{
                  // Match flex columns with CELL_GAP: each column shares
                  // (100% − gaps) evenly, then offset by preceding gaps.
                  left: `calc(${label.index} / ${weeks.length} * (100% - ${(weeks.length - 1) * CELL_GAP}px) + ${label.index * CELL_GAP}px)`,
                }}
              >
                {label.text}
              </span>
            ))}
          </div>

          {/* Grid — columns stretch to fill; minWidth above keeps them
              ≥ CELL_MIN so month labels stay legible. */}
          <div className="flex" style={{ gap: CELL_GAP }}>
            {weeks.map((column, colIdx) => (
              <div
                key={colIdx}
                className="flex min-w-0 flex-1 flex-col"
                style={{ gap: CELL_GAP }}
              >
                {column.map((cell) => {
                  const level = getLevel(cell.count)
                  const isFuture = cell.date.getTime() > Date.now()
                  const interactive = !isFuture && cell.count > 0
                  return (
                    <div
                      key={cell.key}
                      role={interactive ? "button" : undefined}
                      tabIndex={interactive ? 0 : undefined}
                      aria-label={
                        interactive
                          ? `${monthFmt.format(new Date(`${cell.key}T00:00:00`))}: ${cell.count}`
                          : undefined
                      }
                      onMouseEnter={
                        canHover && interactive
                          ? (e) =>
                              showTooltipFor(
                                e.currentTarget,
                                cell.key,
                                cell.count
                              )
                          : undefined
                      }
                      onMouseLeave={
                        canHover ? () => setTooltip(null) : undefined
                      }
                      onBlur={() => setTooltip(null)}
                      onClick={
                        !canHover
                          ? (e) => {
                              if (!interactive) {
                                setTooltip(null)
                                return
                              }
                              // Toggle — second tap on the same cell
                              // dismisses without needing outside tap.
                              if (tooltip?.date === cell.key) {
                                setTooltip(null)
                                return
                              }
                              showTooltipFor(
                                e.currentTarget,
                                cell.key,
                                cell.count
                              )
                            }
                          : undefined
                      }
                      onKeyDown={
                        interactive
                          ? (e) => {
                              if (e.key === "Escape") {
                                setTooltip(null)
                                return
                              }
                              if (e.key !== "Enter" && e.key !== " ") return
                              e.preventDefault()
                              if (tooltip?.date === cell.key) {
                                setTooltip(null)
                                return
                              }
                              showTooltipFor(
                                e.currentTarget,
                                cell.key,
                                cell.count
                              )
                            }
                          : undefined
                      }
                      className={cn(
                        "aspect-square w-full rounded-[3px] transition-all",
                        isFuture
                          ? "opacity-30"
                          : interactive
                            ? "cursor-pointer hover:ring-2 hover:ring-primary/40 hover:ring-offset-1 hover:ring-offset-card"
                            : undefined
                      )}
                      style={{ backgroundColor: LEVEL_COLORS[level] }}
                    />
                  )
                })}
              </div>
            ))}
          </div>

          {/* Tooltip — same shell + indicator as ChartTooltipContent
              (dot: size-2.5, rounded-[2px], border/bg via --color-*). */}
          {tooltip && (
            <div
              className={cn(
                "pointer-events-none absolute z-20",
                tooltip.side === "top"
                  ? "-translate-y-full"
                  : "translate-y-0",
                tooltip.align === "center" && "-translate-x-1/2",
                tooltip.align === "left" && "-translate-x-1",
                tooltip.align === "right" && "translate-x-[calc(-100%+4px)]"
              )}
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <div className="grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">
                  {monthFmt.format(new Date(`${tooltip.date}T00:00:00`))}
                </div>
                <div className="flex w-full items-center gap-2">
                  <div
                    className="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
                    style={
                      {
                        "--color-bg": LEVEL_COLORS[getLevel(tooltip.count)],
                        "--color-border": LEVEL_COLORS[getLevel(tooltip.count)],
                      } as CSSProperties
                    }
                  />
                  <span className="text-muted-foreground">
                    {t("admin.posts")}
                  </span>
                  <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                    {tooltip.count}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground/70">
        <span>{t("admin.contributionLess")}</span>
        {LEVEL_COLORS.map((color, i) => (
          <span
            key={i}
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: color }}
          />
        ))}
        <span>{t("admin.contributionMore")}</span>
      </div>
      </CardContent>
    </Card>
  )
}
