import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
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

/** Empty or http(s) only — blocks javascript:/data: href injection. */
const optionalHttpUrl = z
  .string()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), {
    message: "URL must be empty or an http(s) URL",
  })

/** Empty, site-relative path, or http(s) — safe for <img src>. */
const optionalLogoUrl = z
  .string()
  .max(500)
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v),
    { message: "Logo must be a relative path or http(s) URL" }
  )

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  authorName: z.string().max(100).optional(),
  logoUrl: optionalLogoUrl.optional(),
  logoInvertInDark: z.boolean().optional(),
  githubUrl: optionalHttpUrl.optional(),
  twitterUrl: optionalHttpUrl.optional(),
  commentEnabled: z.boolean().optional(),
})

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
      })

  revalidateTag(SITE_CONFIG_TAG, { expire: 0 })
  revalidatePath("/", "layout")

  // Build the response from the row we just wrote — same DTO as GET,
  // without relying on the just-invalidated cache in this request.
  return NextResponse.json({
    settings: toSettingsDto(siteConfigFromRow(settings)),
  })
}
