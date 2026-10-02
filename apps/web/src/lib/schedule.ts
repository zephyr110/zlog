/**
 * Scheduled-publishing helpers. `publish_at` is stored as UTC
 * "YYYY-MM-DD HH:MM:SS" — the same format as datetime('now') and
 * pinned_at, so SQL string comparison is exact — while the admin edits
 * it through an <input type="datetime-local">, which speaks local time
 * at minute precision. Everything between those two worlds lives here.
 */

/** <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm") → stored UTC,
 *  or null for "publish immediately" / unparseable input. */
export function toPublishAtUtc(localValue: string): string | null {
  if (!localValue) return null
  // A date-time string without a zone is parsed as LOCAL time, which is
  // exactly what the author picked in their browser.
  const date = new Date(localValue)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 19).replace("T", " ")
}

/** Stored UTC → the local value the datetime-local input expects.
 *  Parsed as UTC (seconds are dropped — the input has minute precision). */
export function fromPublishAtUtc(stored: string | null | undefined): string {
  if (!stored) return ""
  const date = new Date(`${stored.replace(" ", "T")}Z`)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** True while the post's publish time is still in the future. A null /
 *  empty value means "no schedule" and is never scheduled. */
export function isScheduled(
  publishAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!publishAt) return false
  return publishAt > now.toISOString().slice(0, 19).replace("T", " ")
}
