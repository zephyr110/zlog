// Writing-streak insights for the admin post calendar ("发布日历").
//
// A streak is a run of consecutive calendar days with at least one post.
// Day keys come from the posts' date field exactly the way the heatmap
// derives its cells (slice to YYYY-MM-DD, drafts included) — so the
// numbers here always agree with what the grid shows. Day arithmetic
// runs on UTC-midnight timestamps of date-only strings (no DST anywhere
// in the pipeline), which also makes the month/year/leap boundaries
// ordinary cases rather than special ones.

export interface PublishingStreaks {
  /** Consecutive days ending today or yesterday (0 when the run is
   *  older — GitHub's grace: the current day is not over yet, so a gap
   *  only exists once a full day has passed with no post). */
  current: number
  /** Longest consecutive-day run in the whole history. */
  longest: number
  /** Distinct days with at least one post. */
  activeDays: number
}

/** "YYYY-MM-DD" → the next/previous day, UTC arithmetic (DST-free). */
function addDays(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Normalize a post date/timestamp to its YYYY-MM-DD day key, or null
 *  when it doesn't start with a date (defensive: a malformed row must
 *  not poison the whole run). */
function dayKey(raw: string): string | null {
  const key = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null
}

/** Streak stats for a set of post dates. `today` is injected (the
 *  caller's local date) so the "current" streak is testable and matches
 *  the heatmap's local-day keys. */
export function publishingStreaks(
  dates: string[],
  today: string
): PublishingStreaks {
  const days = [
    ...new Set(
      dates.map(dayKey).filter((d): d is string => d !== null)
    ),
  ].sort()
  if (days.length === 0) return { current: 0, longest: 0, activeDays: 0 }

  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const day of days) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1
    if (run > longest) longest = run
    prev = day
  }

  // Current streak: the run ending at the newest day that is not in the
  // future. Post dates can be pre-dated (the heatmap dims future cells),
  // and a pre-dated post must not zero out a streak the author is
  // actively keeping. ISO date strings compare lexicographically =
  // chronologically, so the <= filter is exact. Longest stays computed
  // over all days — a written pre-dated post is still writing.
  const past = days.filter((d) => d <= today)
  let current = 0
  if (past.length > 0) {
    const newest = past[past.length - 1]
    if (newest === today || newest === addDays(today, -1)) {
      current = 1
      for (
        let i = past.length - 2;
        i >= 0 && addDays(past[i], 1) === past[i + 1];
        i--
      ) {
        current++
      }
    }
  }

  return { current, longest, activeDays: days.length }
}
