"use client"

import { useMemo, useState } from "react"
import { zhCN, enUS } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { type DateRange } from "react-day-picker"

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
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
}) {
  const [open, setOpen] = useState(false)
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
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-xs transition-colors hover:bg-muted/50"
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
          edge if left-aligned. */}
      <PopoverContent align="end" sideOffset={4} className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
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
