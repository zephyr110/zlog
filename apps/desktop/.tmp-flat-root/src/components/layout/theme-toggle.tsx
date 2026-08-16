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

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useT()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, []) // eslint-disable-line react-hooks/set-state-in-effect -- hydration guard: theme is only known client-side

  if (!mounted) {
    return <div className="size-9" />
  }

  const options = [
    { key: "light", label: t("admin.light"), icon: Sun, iconClass: "text-amber-500" },
    { key: "dark", label: t("admin.dark"), icon: Moon, iconClass: "text-indigo-400" },
    { key: "system", label: t("admin.system"), icon: Monitor, iconClass: "text-emerald-500" },
  ] as const

  const current = options.find((o) => o.key === theme) || options[2]
  const Icon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center justify-center size-9 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground cursor-pointer outline-none">
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
