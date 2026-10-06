import { cache } from "react"
import { unstable_cache } from "next/cache"
import {
  getSiteSettings,
  type SiteSettingsRecord,
} from "@zlog/database"
import { defaultSiteConfig, type SiteConfig } from "@/lib/site-config"
import {
  DEFAULT_BASE_COLOR,
  DEFAULT_THEME_COLOR,
  isBaseColorName,
  isThemeColorName,
  type BaseColorName,
  type ThemeColorName,
} from "@/lib/theme-catalog"

export const SITE_CONFIG_TAG = "site-config"

type SiteSettingsDto = {
  name: string
  title: string
  description: string
  authorName: string
  logoUrl: string
  logoInvertInDark: boolean
  githubUrl: string
  twitterUrl: string
  commentEnabled: boolean
  projectsEnabled: boolean
  baseColor: BaseColorName
  themeColor: ThemeColorName
}

/**
 * Merge a DB row with compile-time defaults.
 * Once a row exists, stored empty strings are intentional (cleared fields)
 * and must not fall back to defaults — except author.name, which the Atom
 * feed spec requires non-empty, so it keeps the default fallback like
 * name/title.
 */
export function siteConfigFromRow(
  row: SiteSettingsRecord | null
): SiteConfig {
  if (!row) {
    return { ...defaultSiteConfig }
  }

  return {
    name: row.name.trim() ? row.name : defaultSiteConfig.name,
    title: row.title.trim() ? row.title : defaultSiteConfig.title,
    description: row.description,
    author: {
      name: row.authorName.trim()
        ? row.authorName
        : defaultSiteConfig.author.name,
      avatar: defaultSiteConfig.author.avatar,
    },
    logoUrl: row.logoUrl,
    logoInvertInDark: row.logoInvertDark ?? defaultSiteConfig.logoInvertInDark,
    social: {
      github: row.githubUrl,
      twitter: row.twitterUrl,
    },
    commentEnabled: row.commentEnabled,
    projectsEnabled: row.projectsEnabled,
    // 成员校验兜底：手改 DB 的脏值不能把 data-* 属性带崩。
    baseColor: isBaseColorName(row.baseColor)
      ? row.baseColor
      : DEFAULT_BASE_COLOR,
    themeColor: isThemeColorName(row.themeColor)
      ? row.themeColor
      : DEFAULT_THEME_COLOR,
    siteUrl: defaultSiteConfig.siteUrl,
    ogImage: defaultSiteConfig.ogImage,
  }
}

export function toSettingsDto(config: SiteConfig): SiteSettingsDto {
  return {
    name: config.name,
    title: config.title,
    description: config.description,
    authorName: config.author.name,
    logoUrl: config.logoUrl,
    logoInvertInDark: config.logoInvertInDark,
    githubUrl: config.social.github,
    twitterUrl: config.social.twitter,
    commentEnabled: config.commentEnabled,
    projectsEnabled: config.projectsEnabled,
    baseColor: config.baseColor,
    themeColor: config.themeColor,
  }
}

// DB failure propagates here — the fallback below must NOT be cached, or
// a transient outage at first fetch would freeze the site identity on
// defaults for the whole revalidate window.
async function loadCachedConfig(): Promise<
  Omit<SiteConfig, "siteUrl" | "ogImage">
> {
  const row = await getSiteSettings()
  const config = siteConfigFromRow(row)
  // Cache only the DB-backed fields — siteUrl/ogImage are env-derived and
  // must not cross the Data Cache (see getSiteConfig below).
  return {
    name: config.name,
    title: config.title,
    description: config.description,
    author: config.author,
    logoUrl: config.logoUrl,
    logoInvertInDark: config.logoInvertInDark,
    social: config.social,
    commentEnabled: config.commentEnabled,
    projectsEnabled: config.projectsEnabled,
    baseColor: config.baseColor,
    themeColor: config.themeColor,
  }
}

const cachedLoad = unstable_cache(loadCachedConfig, [SITE_CONFIG_TAG], {
  tags: [SITE_CONFIG_TAG],
  revalidate: 3600,
})

/** Request-deduped + cross-request cached site config. A DB failure falls
 *  back to compile-time defaults without caching them.
 *
 * siteUrl and ogImage are env-derived (resolveSiteUrl, NEXT_PUBLIC_OG_IMAGE)
 * and must NOT go through the cross-request cache: Vercel's Data Cache
 * persists across deployments and is not refreshed at build time, so a
 * cached SiteConfig from an older deployment can keep serving a stale
 * URL (e.g. the localhost placeholder) for the whole revalidate window.
 * Reading them off defaultSiteConfig here re-resolves the env on every
 * server process start, so a config/URL change takes effect immediately
 * after the next deploy. */
export const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  try {
    const cached = await cachedLoad()
    return {
      ...cached,
      // ?? default: a pre-commentEnabled cache entry persisted across
      // deployments has no commentEnabled field — undefined would read
      // as "comments closed" for the whole revalidate window.
      commentEnabled: cached.commentEnabled ?? defaultSiteConfig.commentEnabled,
      // ?? default: 同 commentEnabled —— 跨部署旧缓存条目缺此字段时
      // undefined 会被读成「关闭」,用默认值兜底（本项目默认即 false）。
      projectsEnabled: cached.projectsEnabled ?? defaultSiteConfig.projectsEnabled,
      // ?? default: 跨部署旧缓存条目没有配色字段——undefined 会渲染出
      // 无效的 data-* 值，用默认兜底（同 commentEnabled 先例）。
      baseColor: cached.baseColor ?? defaultSiteConfig.baseColor,
      themeColor: cached.themeColor ?? defaultSiteConfig.themeColor,
      siteUrl: defaultSiteConfig.siteUrl,
      ogImage: defaultSiteConfig.ogImage,
    }
  } catch {
    console.warn("[site-config] DB read failed — using compile-time defaults")
    return { ...defaultSiteConfig }
  }
})
