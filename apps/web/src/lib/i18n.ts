import { site } from "./i18n/site"
import { post } from "./i18n/post"
import { about } from "./i18n/about"
import { a11y } from "./i18n/a11y"
import { cat } from "./i18n/cat"
import { timeline } from "./i18n/timeline"
import { archive } from "./i18n/archive"
import { category } from "./i18n/category"
import { admin } from "./i18n/admin"

export type { LocaleMessages } from "./i18n/locale-messages"

export type Locale = "zh" | "en"

export const locales: Locale[] = ["zh", "en"]

export const defaultLocale: Locale = "zh"

export const localeLabels: Record<Locale, string> = {
  zh: "中文",
  en: "English",
}

export const translations = {
  zh: {
    site: site.zh,
    post: post.zh,
    about: about.zh,
    a11y: a11y.zh,
    cat: cat.zh,
    timeline: timeline.zh,
    archive: archive.zh,
    category: category.zh,
    admin: admin.zh,
  },
  en: {
    site: site.en,
    post: post.en,
    about: about.en,
    a11y: a11y.en,
    cat: cat.en,
    timeline: timeline.en,
    archive: archive.en,
    category: category.en,
    admin: admin.en,
  },
} as const

export type TranslationDict = typeof translations.zh

/** Dot-path to a leaf string or formatter in the dictionary. */
type Leaves<T, P extends string = ""> = T extends (
  ...args: never[]
) => unknown
  ? P
  : T extends object
    ? {
        [K in keyof T & string]: Leaves<
          T[K],
          P extends "" ? K : `${P}.${K}`
        >
      }[keyof T & string]
    : P

export type TranslationPath = Leaves<TranslationDict>

type PathValue<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? PathValue<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never

export type TranslationValueAt<P extends TranslationPath> = PathValue<
  TranslationDict,
  P
>

function lookup(locale: Locale, path: string): unknown {
  const keys = path.split(".")
  let value: unknown = translations[locale]
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key]
    } else {
      return path
    }
  }
  return value
}

export function t<P extends TranslationPath>(
  locale: Locale,
  path: P
): TranslationValueAt<P> {
  return lookup(locale, path) as TranslationValueAt<P>
}
