"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react"
import { type Locale, defaultLocale } from "@/lib/i18n"

const STORAGE_KEY = "blog-locale"

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
}

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
})

function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "zh" || stored === "en") return stored
  } catch {}
  return null
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Always start with defaultLocale to match the server render, then sync
  // from localStorage in an effect. Initialising from localStorage in the
  // useState initializer makes the FIRST client render differ from SSR for
  // every translated text node whenever the stored locale ≠ default —
  // a guaranteed hydration failure (React #418) on every page load.
  // DocumentTitle re-runs on locale change (locale is in its effect deps),
  // so the deferred sync still corrects document.title.
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)

  useEffect(() => {
    // 桌面端：语言单一事实源在主进程（lang.json，经 /api/lang）——
    // 设置窗口的语言切换优先，web 界面跟随。纯 web（GitHub Pages，
    // /api/lang 404）回落 localStorage。两者都让 SSR 首帧保持 defaultLocale，
    // 与现有注释的 hydration 约束一致。
    let cancelled = false
    async function syncFromDesktopOrStorage() {
      try {
        const res = await fetch("/api/lang")
        if (res.ok) {
          const state = (await res.json()) as { resolved?: unknown }
          if (state.resolved === "zh" || state.resolved === "en") {
            if (!cancelled) setLocaleState(state.resolved)
            return
          }
        }
      } catch {
        // 服务器未起/纯 web：走 localStorage 回落
      }
      if (cancelled) return
      const stored = getStoredLocale()
      if (stored && stored !== defaultLocale) {
        setLocaleState(stored)
      }
    }
    void syncFromDesktopOrStorage()
    // 设置窗口切换语言 → 主进程广播 → 本窗口即时跟随（无需刷新）
    const onLangChange = (e: Event) => {
      const resolved = (e as CustomEvent<{ resolved?: unknown }>).detail?.resolved
      if (resolved === "zh" || resolved === "en") setLocaleState(resolved)
    }
    window.addEventListener("zlog-lang-change", onLangChange)
    return () => {
      cancelled = true
      window.removeEventListener("zlog-lang-change", onLangChange)
    }
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {}
    // 桌面端：写回统一语言源，设置窗口/托盘跟随（纯 web 下 404 静默忽略）
    void fetch("/api/lang", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pref: l }),
    }).catch(() => {})
  }, [])

  return (
    <I18nContext.Provider value={{ locale, setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useLocale(): I18nContextValue {
  return useContext(I18nContext)
}
