import { NextRequest, NextResponse } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"
import { getSiteSettings, upsertSiteSettings } from "@zlog/database"
import { requireAuth } from "@/lib/api-auth"
import {
  getSiteConfig,
  SITE_CONFIG_TAG,
  siteConfigFromRow,
  toSettingsDto,
} from "@/lib/get-site-config"
import { defaultSiteConfig } from "@/lib/site-config"
import { updateSchema } from "@/lib/site-settings-schema"

/** Public — effective site config (defaults merged). */
export async function GET() {
  const config = await getSiteConfig()
  return NextResponse.json({ settings: toSettingsDto(config) })
}

/** Auth — persist editable site identity fields. */
export async function PUT(request: NextRequest) {
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    )
  }

  const patch = parsed.data
  const dbPatch = {
    name: patch.name,
    title: patch.title,
    description: patch.description,
    authorName: patch.authorName,
    logoUrl: patch.logoUrl,
    logoInvertDark: patch.logoInvertInDark,
    githubUrl: patch.githubUrl,
    twitterUrl: patch.twitterUrl,
    commentEnabled: patch.commentEnabled,
    projectsEnabled: patch.projectsEnabled,
    baseColor: patch.baseColor,
    themeColor: patch.themeColor,
  }

  // First save with no existing row: fill missing fields from defaults so
  // we don't persist empty strings over the compile-time identity.
  const existing = await getSiteSettings()
  const settings = existing
    ? await upsertSiteSettings(dbPatch)
    : await upsertSiteSettings({
        name: patch.name ?? defaultSiteConfig.name,
        title: patch.title ?? defaultSiteConfig.title,
        description: patch.description ?? defaultSiteConfig.description,
        authorName: patch.authorName ?? defaultSiteConfig.author.name,
        logoUrl: patch.logoUrl ?? "",
        logoInvertDark: patch.logoInvertInDark ?? defaultSiteConfig.logoInvertInDark,
        githubUrl: patch.githubUrl ?? defaultSiteConfig.social.github,
        twitterUrl: patch.twitterUrl ?? defaultSiteConfig.social.twitter,
        commentEnabled: patch.commentEnabled ?? defaultSiteConfig.commentEnabled,
        projectsEnabled: patch.projectsEnabled ?? defaultSiteConfig.projectsEnabled,
        baseColor: patch.baseColor ?? defaultSiteConfig.baseColor,
        themeColor: patch.themeColor ?? defaultSiteConfig.themeColor,
      })

  revalidateTag(SITE_CONFIG_TAG, { expire: 0 })
  revalidatePath("/", "layout")

  // Build the response from the row we just wrote — same DTO as GET,
  // without relying on the just-invalidated cache in this request.
  return NextResponse.json({
    settings: toSettingsDto(siteConfigFromRow(settings)),
  })
}
