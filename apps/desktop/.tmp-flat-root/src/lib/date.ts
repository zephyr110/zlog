/** Local "YYYY-MM-DD" → exact UTC timestamp at the day boundary
 *  ("YYYY-MM-DD HH:MM:SS", matching created_at's format). Converting the
 *  local window start/end to UTC keeps the filter exact in any timezone. */
export function toUtcTimestamp(
  localDay: string,
  endOfDay: boolean
): string | undefined {
  if (!localDay) return undefined
  const d = new Date(endOfDay ? `${localDay}T23:59:59` : `${localDay}T00:00:00`)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().replace("T", " ").slice(0, 19)
}

/** Local "YYYY-MM-DD" from a Date — the shared wire contract for the
 *  admin date filters and the media/post display dates. */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** UTC datetime string (SQLite "YYYY-MM-DD HH:MM:SS") → local
 *  "YYYY-MM-DD" for display. Falls back to the date portion of the raw
 *  string when it can't be parsed. */
export function formatUtcDateTime(utc: string): string {
  const d = new Date(`${utc.replace(" ", "T")}Z`)
  if (Number.isNaN(d.getTime())) return utc.slice(0, 10)
  return formatLocalDate(d)
}

/** "YYYY-MM-DD" (the post/media wire format) → Date at UTC midnight.
 *  Dates are authored as UTC calendar dates (the API stores
 *  toISOString().split("T")[0]); parsing them as UTC keeps every
 *  computation timezone-independent — the same string renders
 *  identically in the build (SSR) and in every viewer's browser, with
 *  no hydration mismatch. */
export function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

/**
 * Group posts by UTC calendar year (the authored `YYYY-MM-DD` year).
 * Use `getUTCFullYear()` via parseUtcDate — local getFullYear() misgroups
 * Jan 1 in negative-offset zones.
 *
 * `sortYears: "desc" | "asc"` sorts year keys. Omit / `false` to keep
 * first-seen order (archive relies on newest-first posts so years appear
 * newest-first without an explicit sort).
 */
export function groupPostsByUtcYear<T extends { date: string }>(
  posts: T[],
  options?: { sortYears?: "asc" | "desc" | false }
): [number, T[]][] {
  const map = new Map<number, T[]>()
  for (const post of posts) {
    const year = parseUtcDate(post.date).getUTCFullYear()
    if (!Number.isFinite(year)) continue
    if (!map.has(year)) map.set(year, [])
    map.get(year)!.push(post)
  }
  const entries = Array.from(map.entries())
  if (options?.sortYears === "desc") {
    return entries.sort(([a], [b]) => b - a)
  }
  if (options?.sortYears === "asc") {
    return entries.sort(([a], [b]) => a - b)
  }
  return entries
}
