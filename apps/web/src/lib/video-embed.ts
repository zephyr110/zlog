/** Parse post-markdown video URLs into provider embeds (no network). */

export type VideoProvider = "bilibili" | "youtube"

export type VideoEmbed = {
  provider: VideoProvider
  id: string
}

const BV_RE = /^(BV[a-zA-Z0-9]+)/i
const YT_ID_RE = /^[\w-]{11}$/

function hostname(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase()
}

function bilibiliIdFromPath(pathname: string): string | null {
  // /video/BVxxx… or /video/BVxxx/...
  const m = pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i)
  if (m) {
    const id = m[1]
    return BV_RE.test(id) ? id : null
  }
  // b23.tv short links carry the BV id directly in the path
  // (https://b23.tv/BV1xx…) with no /video/ segment.
  const bare = pathname.match(/(BV[a-zA-Z0-9]+)/)
  return bare && BV_RE.test(bare[1]) ? bare[1] : null
}

function youtubeIdFromUrl(url: URL): string | null {
  const host = hostname(url)
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0]
    return id && YT_ID_RE.test(id) ? id : null
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v")
    if (v && YT_ID_RE.test(v)) return v
    const parts = url.pathname.split("/").filter(Boolean)
    // /shorts/ID, /embed/ID, /live/ID
    if (
      parts.length >= 2 &&
      (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") &&
      YT_ID_RE.test(parts[1])
    ) {
      return parts[1]
    }
  }
  return null
}

/**
 * Returns a Bilibili/YouTube embed descriptor for a page URL, or null.
 * Start-time and other query params are ignored for matching and embedding.
 */
export function parseVideoEmbed(href: string): VideoEmbed | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null

  const host = hostname(url)

  if (
    host === "bilibili.com" ||
    host === "m.bilibili.com" ||
    host === "b23.tv"
  ) {
    // b23.tv only when the path already carries a BV id (no redirect fetch).
    const id = bilibiliIdFromPath(url.pathname)
    if (id) return { provider: "bilibili", id }
    return null
  }

  const yt = youtubeIdFromUrl(url)
  if (yt) return { provider: "youtube", id: yt }

  return null
}

/**
 * Canonical iframe src — never forwards start times.
 * Pass `autoplay: true` only after an explicit user gesture (click-to-play);
 * default stays off so an eager iframe cannot start sound on scroll-in.
 */
export function videoEmbedSrc(
  embed: VideoEmbed,
  opts: { autoplay?: boolean } = {}
): string {
  const autoplay = opts.autoplay ? 1 : 0
  if (embed.provider === "bilibili") {
    return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(embed.id)}&autoplay=${autoplay}`
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(embed.id)}?autoplay=${autoplay}`
}
