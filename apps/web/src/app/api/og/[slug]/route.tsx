import { ImageResponse } from "next/og"
import { getPostBySlug } from "@zlog/database"
import { getSiteConfig } from "@/lib/get-site-config"
import { t } from "@/lib/i18n"
import { fitOgTitle, inferOgLocale, ogSubsetText, OG_SIZE } from "@/lib/og"
import { publicTags } from "@/lib/series"

/** Posters are data-dependent: without this, a build-time prerender (the
 *  build machine has DB access) could bake one post's card into the
 *  deployment. The response itself is CDN-cached via Cache-Control. */
export const dynamic = "force-dynamic"

const FONT_FAMILY = "Noto+Sans+SC"
/** Satori cannot parse woff2 — Google Fonts serves TTF to antique UAs. */
const LEGACY_UA = "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36"

/**
 * A TTF subset covering exactly `text` (one unique URL per glyph set, so
 * Next's data cache keys it per title). Returns null on any failure —
 * the card then renders with satori's built-in Latin font: an image with
 * a Latin-only title beats a 500 in the crawler.
 */
async function loadSubsetFont(
  weight: 400 | 700,
  text: string
): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${FONT_FAMILY}:wght@${weight}&text=${encodeURIComponent(text)}`
    const cssRes = await fetch(cssUrl, {
      cache: "force-cache",
      headers: { "User-Agent": LEGACY_UA },
    })
    if (!cssRes.ok) return null
    const css = await cssRes.text()
    const match = css.match(/src: url\((.+?)\) format\('truetype'\)/)
    if (!match) return null
    const fontRes = await fetch(match[1], { cache: "force-cache" })
    if (!fontRes.ok) return null
    return fontRes.arrayBuffer()
  } catch {
    return null
  }
}

function hostOf(siteUrl: string): string {
  try {
    return new URL(siteUrl).host
  } catch {
    return ""
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let data: [
    Awaited<ReturnType<typeof getPostBySlug>>,
    Awaited<ReturnType<typeof getSiteConfig>>,
  ]
  try {
    data = await Promise.all([getPostBySlug(slug), getSiteConfig()])
  } catch {
    // No database (demo/desktop offline) — nothing to render a card for.
    return new Response("Not found", { status: 404 })
  }
  const [post, site] = data
  if (!post || post.draft) return new Response("Not found", { status: 404 })

  // Crawlers send no locale — infer the card's language from the post.
  const locale = inferOgLocale(post.title, post.description)
  const minRead = t(locale, "post.minRead")(post.readingTime)
  const host = hostOf(site.siteUrl)
  // 系列 tag 不上分享卡（连载元数据，对卡片读者无信息量）。
  const tags = publicTags(post.tags).slice(0, 3)
  const title = fitOgTitle(post.title)
  const separator = "·"

  // Subset from the RENDERED strings: fitOgTitle may return "Untitled" or
  // a truncated text ending in "…" whose glyphs are not in the raw title,
  // and a missing glyph sends satori off to fetch a fallback font at
  // render time (or draws .notdef when that fetch fails).
  const subsetText = ogSubsetText([
    title.text,
    site.name,
    host,
    post.date,
    minRead,
    "#",
    separator,
    ...tags.map((tag) => `#${tag}`),
  ])

  const [regular, bold] = await Promise.all([
    loadSubsetFont(400, subsetText),
    loadSubsetFont(700, subsetText),
  ])
  const fonts = [
    ...(regular
      ? [{ name: "OG Sans", data: regular, weight: 400 as const, style: "normal" as const }]
      : []),
    ...(bold
      ? [{ name: "OG Sans", data: bold, weight: 700 as const, style: "normal" as const }]
      : []),
  ]

  const metaStyle = { fontSize: 24, color: "#8a8a8a" } as const
  const dotStyle = { ...metaStyle, color: "#d4d4d4" } as const

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          // Echoes the site's warm top glow (--login-glow) in hex — satori
          // does not parse oklch.
          backgroundImage: "linear-gradient(180deg, #fbf3df 0%, #ffffff 52%)",
          padding: "68px 80px 60px",
          ...(fonts.length > 0 ? { fontFamily: "OG Sans" } : {}),
        }}
      >
        {/* Site mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              backgroundColor: "#e9b949",
            }}
          />
          <div style={{ fontSize: 28, fontWeight: 700, color: "#2a2a2a" }}>
            {site.name}
          </div>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div
            style={{
              fontSize: title.fontSize,
              fontWeight: 700,
              lineHeight: 1.3,
              color: "#171717",
              letterSpacing: -0.5,
            }}
          >
            {title.text}
          </div>
        </div>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #ececec",
            paddingTop: 26,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={metaStyle}>{post.date}</div>
            <div style={dotStyle}>{separator}</div>
            <div style={metaStyle}>{minRead}</div>
            {tags.map((tag) => (
              <div key={tag} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={dotStyle}>{separator}</div>
                <div style={metaStyle}>{`#${tag}`}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 22, color: "#b0b0b0" }}>{host}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      // Only pass fonts when at least one loaded: `fonts: []` is truthy,
      // and satori throws "No fonts are loaded" instead of using
      // next/og's built-in default — the offline fallback the loader
      // above relies on.
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: {
        // Stable URL per post but content can change on edit — cache a
        // day at the edge, revalidate in the background after that.
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  )
}
