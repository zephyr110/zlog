import { createHmac } from "node:crypto"

/** Client IP for rate limiting + session binding.
 *
 *  Order of preference:
 *  1. x-forwarded-for first hop — on Vercel (the primary deployment)
 *     the platform overwrites this header and does not forward external
 *     IPs, so the first hop is the real client. Nginx deployments
 *     commonly set it too (proxy_set_header X-Forwarded-For $remote_addr).
 *  2. x-real-ip — set by some reverse proxies; must NOT be preferred
 *     over x-forwarded-for: Vercel does not strip it, so a client could
 *     forge an arbitrary value and rotate per-IP rate buckets.
 *
 *  A client POSTing raw headers at a server with no trusted proxy in
 *  front can still choose its own "IP" — that weakens the per-IP rate
 *  bucket (post/global buckets still hold) and is inherent to HTTP. */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")
  const ip = fwd?.split(",")[0]?.trim()
  if (ip) return ip
  const realIp = request.headers.get("x-real-ip")
  return realIp || "unknown"
}

/** Keyed hash so the DB never stores a raw IP — HMAC-SHA256 with the
 *  session secret (a plain hash of an IPv4 address is trivially
 *  rainbow-table reversible if the DB leaks). The same derivation is
 *  used by the session token binding and the rate-limit scopes, so a
 *  secret change rotates all three consistently. */
export function hashIp(ip: string): string {
  const key =
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === "development" ? "dev-comment-ip-salt" : "")
  return createHmac("sha256", key).update(ip).digest("hex")
}
