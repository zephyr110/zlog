"use client"

import { useMemo, useState } from "react"
import { zhCN, enUS } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { type DateRange } from "react-day-picker"

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { formatLocalDate } from "@/lib/date"

/**
 * shadcn-style range picker: one trigger showing "from – to" opens a
 * two-month range calendar. Values are plain "YYYY-MM-DD" local-date
 * strings — the same contract as DatePicker, so the media page's UTC
 * conversion stays untouched. The popover stays open after selection so
 * the range can be adjusted; it closes on outside interaction.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  ariaLabel,
  placeholder,
  locale,
  disabledBefore,
  disabledAfter,
  triggerClassName,
}: {
  /** Local "YYYY-MM-DD", "" when unset. */
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  ariaLabel: string
  /** Shown when no range is selected. */
  placeholder: string
  locale: "zh" | "en"
  /** "YYYY-MM-DD" — days strictly before this are greyed out (data
   *  doesn't exist earlier). */
  disabledBefore?: string
  /** "YYYY-MM-DD" — days strictly after this are greyed out (future). */
  disabledAfter?: string
  /** Extra classes for the trigger button — e.g. full-width + centered
   *  on mobile when the picker sits on its own toolbar row. */
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  // 双月日历（约 500px 宽）在窄屏会横向溢出。断点对齐 app 的 md 惯例
  // (max-width: 767px，见 admin-sidebar/layout)：media 页移动筛选
  // popover（288px 容器）在 <768px 视口出现，该区间内必须单月；
  // ≥768px 桌面布局才放得下双月。
  const isMobile = useMediaQuery("(max-width: 767px)")
  // Stable identity across re-renders — rebuilding the DateRange per
  // render forces react-day-picker to recompute every day cell whenever
  // the parent re-renders (drag state, upload progress, view toggles).
  const selected: DateRange | undefined = useMemo(
    () =>
      from || to
        ? {
            from: from ? new Date(`${from}T00:00:00`) : undefined,
            to: to ? new Date(`${to}T00:00:00`) : undefined,
          }
        : undefined,
    [from, to]
  )
  // Stable matcher identity — same reason as `selected`.
  const disabled = useMemo(() => {
    const matchers = []
    if (disabledBefore) matchers.push({ before: new Date(`${disabledBefore}T00:00:00`) })
    if (disabledAfter) matchers.push({ after: new Date(`${disabledAfter}T00:00:00`) })
    return matchers
  }, [disabledBefore, disabledAfter])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-xs transition-colors hover:bg-muted/50",
              triggerClassName
            )}
          >
            <CalendarIcon
              size={12}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span
              className={cn(
                "truncate",
                from || to ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {from || to ? `${from || "…"} – ${to || "…"}` : placeholder}
            </span>
          </button>
        }
      />
      {/* align="end": the trigger lives in the header's right-side action
          slot — a two-month popover would overflow the viewport's right
          edge if left-aligned. max-w 兜底窄屏/缩放缩放边界。 */}
      <PopoverContent
        align="end"
        sideOffset={4}
        className="max-w-[calc(100vw-1rem)] w-auto p-0"
      >
        {/* key 随月数变化：react-day-picker 不支持 numberOfMonths 原地
            动态切换（resize 跨断点时导航月份会跳变），重挂载最稳。 */}
        <Calendar
          key={`months:${isMobile ? 1 : 2}`}
          mode="range"
          numberOfMonths={isMobile ? 1 : 2}
          selected={selected}
          disabled={disabled}
          onSelect={(range) => {
            onChange({
              from: range?.from ? formatLocalDate(range.from) : "",
              to: range?.to ? formatLocalDate(range.to) : "",
            })
          }}
          defaultMonth={selected?.from}
          locale={locale === "zh" ? zhCN : enUS}
        />
      </PopoverContent>
    </Popover>
  )
}
