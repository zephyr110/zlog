/**
 * Scheduled-publishing helpers. `publish_at` is stored as UTC
 * "YYYY-MM-DD HH:MM:SS" — the same format as datetime('now') and
 * pinned_at, so SQL string comparison is exact — while the admin edits
 * it through the shadcn date-time picker (components/ui/date-time-picker),
 * which speaks local time at minute precision. Everything between those
 * two worlds lives here.
 */

import { formatLocalDateTime, parseLocalDateTime } from "@/lib/date"

/** Local "YYYY-MM-DDTHH:mm" (the picker's wire value) → stored UTC,
 *  or null for "publish immediately" / unparseable input. */
export function toPublishAtUtc(localValue: string): string | null {
  // Without a zone the value is parsed as LOCAL time, which is exactly
  // what the author picked in their browser.
  const date = parseLocalDateTime(localValue)
  if (!date) return null
  return toUtcStamp(date)
}

/** Stored UTC → the local "YYYY-MM-DDTHH:mm" the picker expects.
 *  Parsed as UTC (seconds are dropped — the picker has minute precision). */
export function fromPublishAtUtc(stored: string | null | undefined): string {
  if (!stored) return ""
  const date = new Date(`${stored.replace(" ", "T")}Z`)
  if (Number.isNaN(date.getTime())) return ""
  return formatLocalDateTime(date)
}

/** True while the post's publish time is still in the future. A null /
 *  empty value means "no schedule" and is never scheduled. */
export function isScheduled(
  publishAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!publishAt) return false
  return publishAt > toUtcStamp(now)
}

/** Date → stored UTC "YYYY-MM-DD HH:MM:SS" (the publish_at / pinned_at
 *  format; identical to datetime('now')). */
export function toUtcStamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ")
}

/** Client-side mirror of the server's PUBLISHED_SQL predicate (draft = 0
 *  AND (publish_at IS NULL OR publish_at <= now)) — the two must stay in
 *  sync; this one just uses the browser clock. */
export function isPublic(p: {
  draft: boolean
  publishAt?: string | null
}): boolean {
  return !p.draft && !isScheduled(p.publishAt)
}
