"use client"

import { Languages } from "lucide-react"
import { useLocale } from "@/components/layout/i18n-provider"
import { localeLabels, locales } from "@/lib/i18n"
import { IconButton } from "@/components/ui/icon-button"
import { useT } from "@/components/layout/trans"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

export function LanguageSwitcher({
  variant = "icon",
}: {
  /** footer = labelled settings row; icon = compact header/menu button */
  variant?: "icon" | "footer"
}) {
  const { locale, setLocale } = useLocale()
  const { t } = useT()

  function toggle() {
    const currentIndex = locales.indexOf(locale)
    const next = locales[(currentIndex + 1) % locales.length]
    setLocale(next)
  }

  const nextLocale = locales[(locales.indexOf(locale) + 1) % locales.length]
  // Visible text is the *current* locale; the accessible name must describe
  // the action (and the target), not repeat "English" over a "中文" label.
  const switchLabel = t("site.switchToLanguage")(localeLabels[nextLocale])

  if (variant === "footer") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={toggle}
              aria-label={switchLabel}
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Languages size={18} />
            </button>
          }
        />
        <TooltipContent side="top" sideOffset={6}>
          {switchLabel}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <IconButton onClick={toggle} aria-label={switchLabel} title={switchLabel} className="text-xs font-medium">
      <span lang={locale}>{locale === "zh" ? "中文" : "EN"}</span>
    </IconButton>
  )
}
