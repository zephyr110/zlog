import { getSiteConfig } from "@/lib/get-site-config"

/** /robots.txt：允许抓取公开内容，屏蔽管理台与 API；
 *  Sitemap 指向同源的 /sitemap.xml（站点域名随 site_settings.siteUrl）。 */
export async function GET() {
  const site = await getSiteConfig()
  const siteUrl = site.siteUrl.replace(/\/+$/, "")

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n")

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
