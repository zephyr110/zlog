"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Sun, Moon, Monitor } from "lucide-react"
import { useT } from "@/components/layout/trans"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

function useThemeOptions() {
  const { theme, setTheme } = useTheme()
  const { t } = useT()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, []) // eslint-disable-line react-hooks/set-state-in-effect -- hydration guard: theme is only known client-side

  const options = [
    { key: "light", label: t("admin.light"), icon: Sun, iconClass: "text-amber-500" },
    { key: "dark", label: t("admin.dark"), icon: Moon, iconClass: "text-indigo-400" },
    { key: "system", label: t("admin.system"), icon: Monitor, iconClass: "text-emerald-500" },
  ] as const

  const current = options.find((o) => o.key === theme) || options[2]
  return { theme, setTheme, options, current, mounted, t }
}

/** Header / mobile-nav control: opens a three-option menu. */
export function ThemeToggle() {
  const { theme, setTheme, options, current, mounted, t } = useThemeOptions()

  if (!mounted) {
    return <div className="size-9" />
  }

  const Icon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("admin.theme")}: ${current.label}`}
        className="inline-flex items-center justify-center size-9 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground cursor-pointer outline-none"
      >
        <Icon size={18} className={current.iconClass} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-36">
        {options.map((opt) => {
          const OptIcon = opt.icon
          const isActive = theme === opt.key
          return (
            <DropdownMenuItem
              key={opt.key}
              onClick={() => setTheme(opt.key)}
              className="flex items-center gap-2.5"
            >
              <OptIcon size={16} className={opt.iconClass} />
              <span className={isActive ? "font-medium text-foreground" : ""}>
                {opt.label}
              </span>
              {isActive && (
                <span className="ml-auto size-1.5 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Footer control: one click advances light → dark → system, no menu. */
export function ThemeCycleButton() {
  const { theme, setTheme, options, current, mounted, t } = useThemeOptions()

  if (!mounted) {
    return <div className="size-9" />
  }

  const Icon = current.icon
  const index = options.findIndex((o) => o.key === theme)
  const next = options[(index + 1) % options.length]
  // State lives in the icon; the accessible name announces the action,
  // matching LanguageSwitcher's "Switch to X" convention.
  const label = (
    next.key === "light"
      ? t("admin.commandToLight")
      : next.key === "dark"
        ? t("admin.commandToDark")
        : t("admin.commandToSystem")
  ) as string

  function cycle() {
    setTheme(next.key)
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={cycle}
            aria-label={label}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Icon size={18} className={current.iconClass} />
          </button>
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
