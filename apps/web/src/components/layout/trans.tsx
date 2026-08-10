"use client"

import { useMemo } from "react"
import { useLocale } from "@/components/layout/i18n-provider"
import {
  t as tLocale,
  type Locale,
  type TranslationPath,
  type TranslationValueAt,
} from "@/lib/i18n"

/**
 * Returns a translation function. Usage: const { t, locale } = useT()
 * `t("site.home")` is typed as string; `t("site.yearPosts")` as (n: number) => string.
 *
 * `t` is memoized on `locale` — its identity is stable across renders, so
 * useMemo(..., [t]) in consumers actually caches (a fresh closure per
 * render silently defeats every t-dependent memo, e.g. chart data and
 * map projections rebuilt on every tooltip hover).
 */
export function useT() {
  const { locale } = useLocale()
  return useMemo(
    () => ({
      locale,
      t: <P extends TranslationPath>(path: P): TranslationValueAt<P> =>
        tLocale(locale, path),
    }),
    [locale]
  )
}

type TransArgs<P extends TranslationPath> =
  TranslationValueAt<P> extends (...args: infer A) => string ? A : never

/**
 * Inline translation component. Usage: <Trans k="site.home" />
 * Formatter keys: <Trans k="site.yearPosts" args={[n]} />
 */
export function Trans<P extends TranslationPath>({
  k,
  args,
  className,
}: {
  k: P
  args?: TransArgs<P>
  className?: string
}) {
  const { locale } = useLocale()
  const value = tLocale(locale, k)

  if (typeof value === "function") {
    const fn = value as (...a: never[]) => string
    return (
      <span className={className}>
        {fn(...((args ?? []) as never[]))}
      </span>
    )
  }

  return <span className={className}>{value as string}</span>
}

export type { Locale, TranslationPath, TranslationValueAt }
