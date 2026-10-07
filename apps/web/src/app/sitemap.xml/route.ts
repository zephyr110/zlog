import { getSiteConfig } from "@/lib/get-site-config"
import { getPublishedPosts } from "@zlog/database"
import { listSeries } from "@/lib/series"

/** 线上 ISR：新文章/系列最长 60s 后进入 sitemap（桌面 standalone 构建注入
 *  force-dynamic，优先级更高、每请求实时，不受此影响）。 */
export const revalidate = 60

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export async function GET() {
  const [posts, site] = await Promise.all([
    getPublishedPosts(),
    getSiteConfig(),
  ])
  const siteUrl = site.siteUrl.replace(/\/+$/, "")
  const today = new Date().toISOString().slice(0, 10)

  const urls = [
    { url: siteUrl, changefreq: "weekly", priority: "1.0", lastmod: today },
    { url: `${siteUrl}/about`, changefreq: "monthly", priority: "0.8", lastmod: today },
    { url: `${siteUrl}/archive`, changefreq: "weekly", priority: "0.8", lastmod: today },
  ]

  // 项目页随总开关显隐：关闭时不进 sitemap。
  if (site.projectsEnabled) {
    urls.push({ url: `${siteUrl}/projects`, changefreq: "weekly", priority: "0.8", lastmod: today })
  }

  const postUrls = posts.map((post) => ({
    url: `${siteUrl}/posts/${encodeURIComponent(post.slug)}`,
    lastmod: (post.updated || post.date).slice(0, 10),
    changefreq: "monthly",
    priority: "0.6",
  }))

  // 系列页：成员按连载顺序（日期升序），末位即最新一篇——lastmod 取它。
  const seriesUrls = listSeries(posts).map((entry) => {
    const latest = entry.posts[entry.posts.length - 1]
    return {
      url: `${siteUrl}/series/${encodeURIComponent(entry.name.toLowerCase())}`,
      lastmod: (latest.updated || latest.date).slice(0, 10),
      changefreq: "weekly",
      priority: "0.5",
    }
  })
  if (seriesUrls.length > 0) {
    urls.push({
      url: `${siteUrl}/series`,
      changefreq: "weekly",
      priority: "0.6",
      lastmod: today,
    })
  }

  const allUrls = [...urls, ...postUrls, ...seriesUrls]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u: { url: string; lastmod: string; changefreq: string; priority: string }) => `  <url>
    <loc>${escapeXml(u.url)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  })
}
