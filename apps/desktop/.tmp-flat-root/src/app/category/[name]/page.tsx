import { permanentRedirect } from "next/navigation"
import { categoryKeys } from "@/lib/categories"

interface LegacyCategoryPageProps {
  params: Promise<{ name: string }>
}

/** Permanent move: /category/* → /topics/*. Kept so old links and the
 *  static export still resolve known topic keys. Uses permanentRedirect
 *  (308 / instant meta-refresh on export) to match next.config + vercel.json. */
export function generateStaticParams() {
  return categoryKeys.map((name) => ({ name }))
}

export default async function LegacyCategoryRedirect({
  params,
}: LegacyCategoryPageProps) {
  const { name } = await params
  permanentRedirect(`/topics/${name}`)
}
