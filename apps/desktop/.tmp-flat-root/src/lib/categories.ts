import { Monitor, Server, Bot, Package, Wrench, Smartphone, FileText } from "lucide-react"
import type { TranslationPath, TranslationValueAt } from "@/lib/i18n"

export const categoryKeys = [
  "frontend", "backend", "automator", "components", "gear", "miniprogram", "summary",
] as const

export type CategoryKey = (typeof categoryKeys)[number]

export const categoryMeta: Record<
  CategoryKey,
  { i18nKey: TranslationPath; desc: string; icon: typeof Monitor }
> = {
  frontend: { i18nKey: "cat.frontend", desc: "JavaScript · CSS · React · Vue · TypeScript", icon: Monitor },
  backend:  { i18nKey: "cat.backend", desc: "Python · MySQL · Nginx · Linux", icon: Server },
  automator: { i18nKey: "cat.automator", desc: "Appium · Jest · Testing", icon: Bot },
  components: { i18nKey: "cat.components", desc: "NPM · UI Components", icon: Package },
  gear: { i18nKey: "cat.gear", desc: "Git · Webpack · VSCode · Terminal", icon: Wrench },
  miniprogram: { i18nKey: "cat.miniprogram", desc: "WeChat Mini Program", icon: Smartphone },
  summary: { i18nKey: "cat.summary", desc: "Notes · Tips · Reflections", icon: FileText },
}

/** Resolve a tag to its major category prefix. Category keys are checked in definition order. */
export function resolveCategory(tag: string): string {
  const lower = tag.toLowerCase()
  for (const key of categoryKeys) {
    if (lower.startsWith(key + "-") || lower === key) return key
  }
  return lower
}

type TranslateFn = <P extends TranslationPath>(path: P) => TranslationValueAt<P>

/** Get the localized label for a category key. Falls back to the raw key. */
export function getCategoryLabel(key: string, t: TranslateFn): string {
  const meta = categoryMeta[key as CategoryKey]
  return meta ? (t(meta.i18nKey) as string) : key
}
