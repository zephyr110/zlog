"use client"

import { useLocale } from "@/components/layout/i18n-provider"
import { localeLabels, locales } from "@/lib/i18n"
import { IconButton } from "@/components/ui/icon-button"

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()

  function toggle() {
    const currentIndex = locales.indexOf(locale)
    const next = locales[(currentIndex + 1) % locales.length]
    setLocale(next)
  }

  const nextLocale = locales[(locales.indexOf(locale) + 1) % locales.length]

  return (
    <IconButton
      onClick={toggle}
      aria-label={localeLabels[nextLocale]}
      className="text-xs font-medium"
    >
      {locale === "zh" ? "中文" : "EN"}
    </IconButton>
  )
}
