"use client"

import { useMemo, useState } from "react"
import { zhCN, enUS } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatLocalDate, parseLocalDateTime } from "@/lib/date"

// Zero-padded 24h options — the strings slot straight into the "HH:mm"
// half of the wire value, no formatting step.
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))

/**
 * shadcn-style date + time picker: a trigger showing "YYYY-MM-DD HH:mm"
 * opens a single-month calendar with a time row (two 24h selects) and a
 * clear action. The value keeps the native <input type="datetime-local">
 * contract — local "YYYY-MM-DDTHH:mm" — so lib/schedule.ts and the save
 * path stay untouched; "" still means "no schedule, publish immediately"
 * and the clear button restores it. Like DateRangePicker the popover
 * stays open after picking a day so the time can be adjusted, and closes
 * on outside interaction.
 */
export function DateTimePicker({
  value,
  onChange,
  ariaLabel,
  placeholder,
  locale,
  clearLabel,
  hourLabel,
  minuteLabel,
}: {
  /** Local "YYYY-MM-DDTHH:mm", "" when unset. */
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  /** Shown when no time is set. */
  placeholder: string
  locale: "zh" | "en"
  /** Label of the clear action — rendered only while a time is set. */
  clearLabel: string
  /** aria-labels for the hour / minute selects. */
  hourLabel: string
  minuteLabel: string
}) {
  const [open, setOpen] = useState(false)
  // Time shown while the value is still empty. Re-seeded from the wall
  // clock on every open so the first day click lands on a "now"-ish time
  // instead of a magic 00:00; it only becomes part of the value together
  // with a picked day (a lone time tweak just moves the draft).
  const [draftTime, setDraftTime] = useState({ hh: "00", mm: "00" })

  // Stable identity across re-renders — otherwise react-day-picker
  // recomputes every day cell whenever the parent re-renders.
  const selected = useMemo(() => parseLocalDateTime(value), [value])
  const hours = value ? value.slice(11, 13) : draftTime.hh
  const minutes = value ? value.slice(14, 16) : draftTime.mm

  function handleOpenChange(next: boolean) {
    if (next && !value) {
      const now = new Date()
      setDraftTime({
        hh: String(now.getHours()).padStart(2, "0"),
        mm: String(now.getMinutes()).padStart(2, "0"),
      })
    }
    setOpen(next)
  }

  // The value is date + time together, so every change emits both.
  function emit(day: Date, hh: string, mm: string) {
    onChange(`${formatLocalDate(day)}T${hh}:${mm}`)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
                value ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {value ? value.replace("T", " ") : placeholder}
            </span>
          </button>
        }
      />
      <PopoverContent align="end" sideOffset={4} className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            // Re-clicking the selected day emits undefined — keep the day
            // (clearing is the explicit clear button's job).
            if (day) emit(day, hours, minutes)
          }}
          defaultMonth={selected}
          locale={locale === "zh" ? zhCN : enUS}
        />
        <div className="flex items-center gap-1.5 border-t px-3 py-2">
          <Select
            value={hours}
            onValueChange={(hh) => {
              // Base UI types the value as nullable (clearable selects) —
              // this one always has a selection, so null can only be noise.
              if (hh === null) return
              if (selected) emit(selected, hh, minutes)
              else setDraftTime((prev) => ({ ...prev, hh }))
            }}
          >
            <SelectTrigger size="sm" aria-label={hourLabel} className="w-18">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={h}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            :
          </span>
          <Select
            value={minutes}
            onValueChange={(mm) => {
              if (mm === null) return
              if (selected) emit(selected, hours, mm)
              else setDraftTime((prev) => ({ ...prev, mm }))
            }}
          >
            <SelectTrigger size="sm" aria-label={minuteLabel} className="w-18">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => {
                onChange("")
                // Close in a separate commit from the value reset: when both
                // land together, the popup content is rewritten while Base UI
                // starts the exit animation, and the animation gets aborted
                // mid-flight often enough that the close never completes
                // (popover + backdrop stay mounted for good). One deferred
                // task gives the exit animation a stable commit to run in.
                setTimeout(() => setOpen(false), 0)
              }}
            >
              {clearLabel}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
