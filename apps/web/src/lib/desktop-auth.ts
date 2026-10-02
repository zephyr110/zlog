import { timingSafeEqual } from "node:crypto"

/**
 * Desktop-shell request authentication: the Electron main process sends a
 * per-install random key (`ZLOG_DESKTOP_KEY` env ↔ `x-zlog-desktop-key`
 * header) on every loopback call it makes on the user's behalf. Pure so it
 * can be unit-tested without a Request object.
 */
export function validateDesktopKey(
  supplied: string | null,
  expected: string | undefined
): boolean {
  if (!expected || !supplied) return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch — compare lengths first.
  // The length of a per-install random key is not itself a secret.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
