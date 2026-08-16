"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { defaultSiteConfig, type SiteConfig } from "@/lib/site-config"

type SiteConfigContextValue = SiteConfig & {
  setSiteConfig: (next: SiteConfig | ((prev: SiteConfig) => SiteConfig)) => void
  refreshSiteConfig: () => Promise<void>
}

const SiteConfigContext = createContext<SiteConfigContextValue>({
  ...defaultSiteConfig,
  setSiteConfig: () => {},
  refreshSiteConfig: async () => {},
})

export function SiteConfigProvider({
  value,
  children,
}: {
  value: SiteConfig
  children: React.ReactNode
}) {
  // Seeded from the server value once. Deliberately NOT re-synced on
  // prop changes: a settings save updates the context immediately, and a
  // re-sync would let a stale server value (e.g. from the 1h cache during
  // a router.refresh()) clobber the user's in-session edits. Full page
  // reloads remount with fresh server data anyway.
  const [config, setConfig] = useState(value)

  const refreshSiteConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/site-settings")
      if (!res.ok) return
      const data = await res.json()
      const s = data.settings
      if (!s) return
      setConfig((prev) => ({
        ...prev,
        name: s.name ?? prev.name,
        title: s.title ?? prev.title,
        description: s.description ?? prev.description,
        author: { ...prev.author, name: s.authorName ?? prev.author.name },
        logoUrl: s.logoUrl ?? prev.logoUrl,
        logoInvertInDark:
          typeof s.logoInvertInDark === "boolean"
            ? s.logoInvertInDark
            : prev.logoInvertInDark,
        social: {
          github: s.githubUrl ?? prev.social.github,
          twitter: s.twitterUrl ?? prev.social.twitter,
        },
        commentEnabled:
          typeof s.commentEnabled === "boolean"
            ? s.commentEnabled
            : prev.commentEnabled,
      }))
    } catch {
      // ignore network errors — keep last known config
    }
  }, [])

  const ctx = useMemo<SiteConfigContextValue>(
    () => ({
      ...config,
      setSiteConfig: setConfig,
      refreshSiteConfig,
    }),
    [config, refreshSiteConfig]
  )

  return (
    <SiteConfigContext.Provider value={ctx}>
      {children}
    </SiteConfigContext.Provider>
  )
}

export function useSiteConfig(): SiteConfigContextValue {
  return useContext(SiteConfigContext)
}
