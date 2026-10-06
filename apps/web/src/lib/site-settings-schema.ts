import { z } from "zod"
import { BASE_COLOR_IDS, THEME_COLOR_IDS } from "@/lib/theme-catalog"
import { optionalHttpUrl } from "@/lib/url-validation"

/** Empty, site-relative path, or http(s) — safe for <img src>. */
const optionalLogoUrl = z
  .string()
  .max(500)
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v),
    { message: "Logo must be a relative path or http(s) URL" }
  )

/** PUT /api/site-settings 的部分更新载荷。配色枚举由目录数组派生——
 *  新增颜色只改 theme-catalog.ts 一处。 */
export const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  authorName: z.string().max(100).optional(),
  logoUrl: optionalLogoUrl.optional(),
  logoInvertInDark: z.boolean().optional(),
  githubUrl: optionalHttpUrl.optional(),
  twitterUrl: optionalHttpUrl.optional(),
  commentEnabled: z.boolean().optional(),
  projectsEnabled: z.boolean().optional(),
  baseColor: z.enum(BASE_COLOR_IDS).optional(),
  themeColor: z.enum(THEME_COLOR_IDS).optional(),
})
