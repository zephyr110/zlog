import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextRequest } from "next/server"
import { getSiteConfig } from "@/lib/get-site-config"
import { DEFAULT_FAVICON } from "@/lib/site-config"

// ISR (revalidate 3600) instead of a plain dynamic route: /icon is a
// metadata route, which Next ≥ 16 keeps static by default — the build
// would try to prerender it, hit the no-store fetch below, and log a
// "Dynamic server usage" error. With a route-level revalidate the build
// prerenders successfully (the proxy fetch runs once at build time and
// is cached) and the runtime revalidates hourly, so a logo change
// shows up within an hour — matching the existing browser-level
// Cache-Control: max-age=3600 anyway.
//
// The static-export deploy (scripts/toggle-force-static.mjs) prepends
// `export const dynamic = "force-static"` for the GitHub Pages build;
// Next allows revalidate together with force-static, so no conflict.
export const revalidate = 3600

const MAX_FAVICON_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 5_000

/** Last-resort mark: only served when the real built-in mark is
 *  unreadable on disk AND unreachable from the origin. */
const FALLBACK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="7" fill="#555"/><text x="16" y="23" ' +
  'font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="700" ' +
  'text-anchor="middle" fill="#fff">Z</text></svg>'

/** Built-in mark bytes: build/dev machines have public/ on disk; a
 *  serverless runtime (no public/ in the function FS) fetches it from
 *  its own origin. Never redirects (a redirect can't be represented in
 *  the static export build) and never throws — worst case it serves the
 *  tiny inline mark above. */
function defaultFaviconType(path: string): string {
  if (path.endsWith(".svg")) return "image/svg+xml"
  if (path.endsWith(".ico")) return "image/x-icon"
  if (path.endsWith(".webp")) return "image/webp"
  return "image/png"
}

async function defaultFavicon(request: NextRequest): Promise<Response> {
  const file = DEFAULT_FAVICON.replace(/^\//, "")
  const headers = {
    "Content-Type": defaultFaviconType(file),
    "Cache-Control": "public, max-age=3600",
  }
  try {
    const buf = readFileSync(join(process.cwd(), "public", file))
    return new Response(buf, { headers })
  } catch {
    try {
      const res = await fetch(
        new URL(DEFAULT_FAVICON, request.nextUrl.origin),
        // Cached like the proxy below: a no-store fetch would make the
        // build-time prerender of this route fail.
        { next: { revalidate: 3600 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      )
      if (!res.ok) throw new Error(`default favicon fetch failed: ${res.status}`)
      return new Response(await res.arrayBuffer(), { headers })
    } catch {
      return new Response(FALLBACK_SVG, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      })
    }
  }
}

/**
 * Absolute logo URLs are fetched server-side on a public route, so keep
 * them https and off private/loopback/link-local hosts. (Relative paths
 * resolve to the request origin itself and never reach here.)
 */
function isUnsafeUrl(url: URL): boolean {
  if (url.protocol !== "https:") return true
  // Trailing-dot FQDN ("localhost.") resolves to the same hosts — strip
  // it so the checks below can't be bypassed with a dot.
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (host === "localhost" || host.endsWith(".localhost")) return true
  if (host.includes(":")) return true // IPv6 literal
  const ip = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ip) {
    const [a, b, c] = ip.slice(1).map(Number)
    if (a === 10 || a === 127 || (a === 169 && b === 254)) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
    if (a === 198 && (b === 18 || b === 19)) return true // 198.18/15
    if (a === 192 && b === 0 && c === 0) return true // 192.0.0/24
    if (a === 0 || a >= 224) return true
  }
  return false
}

const EXT_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
}

/**
 * Favicon passthrough. The layout links /icon only while a custom site
 * logo is set (with a ?u= cache-busting query), so this route proxies the
 * uploaded logo bytes as the favicon — the same image, one origin. If the
 * logo is cleared, unreadable, or unsafe, fall back to the built-in mark.
 */
export async function GET(request: NextRequest) {
  const site = await getSiteConfig()
  const src = site.logoUrl.trim()
  if (!src) return defaultFavicon(request)

  try {
    // Relative ("/…") and absolute https URLs only. The settings schema
    // also accepts http and "//host" forms — normalize protocol-relative
    // to https so it passes the same safety checks, and never fetch an
    // http URL server-side (SSRF).
    let url: URL
    if (src.startsWith("/") && !src.startsWith("//")) {
      // During the static-export build the request origin is a
      // placeholder — resolve site-relative logos against the site's
      // real URL instead (e.g. https://zephyr110.github.io in CI).
      const origin =
        process.env.NEXT_PHASE === "phase-production-build"
          ? site.siteUrl
          : request.nextUrl.origin
      url = new URL(src, origin)
    } else {
      url = new URL(src.startsWith("//") ? `https:${src}` : src)
      if (isUnsafeUrl(url)) throw new Error(`unsafe favicon url: ${src}`)
    }
    // A logo pointing at /icon (including percent-encoded spellings)
    // would fetch this route from inside itself.
    let decodedPath = url.pathname
    try {
      decodedPath = decodeURIComponent(decodedPath)
    } catch {
      // Malformed % sequence — can't be this route, keep as-is.
    }
    if (decodedPath === "/icon") throw new Error("self-referential favicon url")

    const res = await fetch(url, {
      // Cached for an hour (ISR): this route is prerendered at build
      // time, so a no-store fetch would fail the prerender with a
      // "Dynamic server usage" error. The route-level revalidate above
      // re-runs this fetch hourly at runtime, so a changed logo still
      // shows up within the hour.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Never follow upstream redirects — a 3xx to an internal host
      // would bypass the URL safety checks above.
      redirect: "manual",
    })
    if (!res.ok) throw new Error(`favicon fetch failed: ${res.status}`)
    // Serve images only — an html/text response (e.g. logoUrl = "/")
    // would be proxied as garbage otherwise. Trust the upstream
    // content-type; fall back to the path extension when it's missing
    // or generic (octet-stream), so SVGs still resolve.
    const declared = res.headers.get("content-type")?.split(";")[0] ?? ""
    const dot = url.pathname.lastIndexOf(".")
    const ext = dot >= 0 ? url.pathname.slice(dot).toLowerCase() : ""
    const type = declared.startsWith("image/") ? declared : (EXT_TYPES[ext] ?? "")
    if (!type) throw new Error("favicon is not an image")
    if (Number(res.headers.get("content-length") ?? 0) > MAX_FAVICON_BYTES) {
      throw new Error("favicon too large")
    }
    const bytes = await res.arrayBuffer()
    if (bytes.byteLength > MAX_FAVICON_BYTES) throw new Error("favicon too large")

    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        // Favicons get cached aggressively; an hour is cheap enough while
        // being short enough that removing a logo recovers quickly.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
      },
    })
  } catch (error) {
    console.error("[icon] favicon proxy failed — serving built-in mark:", error)
    return defaultFavicon(request)
  }
}
