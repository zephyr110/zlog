"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import DottedMap, { type MapData } from "dotted-map/without-countries"
import { WORLD_DOT_MAP_JSON } from "@/lib/world-dot-map"
import { COUNTRY_CENTROIDS } from "@/lib/country-centroids"
import { TruncateTooltip } from "@/components/ui/truncate-tooltip"
import { useT } from "@/components/layout/trans"
import { cn } from "@/lib/utils"
import type { Locale } from "@/lib/i18n"

export interface CountryDatum {
  /** ISO 3166-1 alpha-2 (GA countryId), used to locate the pin. */
  code: string
  name: string
  users: number
}

interface PinData {
  name: string
  users: number
  radius: number
}

interface PinTooltip extends PinData {
  xPct: number
  yPct: number
}

// Parsed once at module load — the 90KB JSON is a precomputed dot grid, so
// no country polygons or projection math ship to the client bundle.
const MAP_DATA = JSON.parse(WORLD_DOT_MAP_JSON) as MapData

/** Background dot radius; pins scale with sqrt share of the max country. */
const DOT_RADIUS = 0.3
/** Invisible hit target floor — map coords are tiny; without this, phone
 *  taps miss the pin core entirely. */
const PIN_HIT_MIN = 2.2

function subscribeHover(onChange: () => void) {
  const mq = window.matchMedia("(hover: hover) and (pointer: fine)")
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function getHoverSnapshot() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches
}

/** Localize a GA country via ISO code; fall back to the API string. */
function localizedCountryName(
  code: string,
  fallback: string,
  locale: Locale,
  notSetLabel: string
): string {
  if (!code || code === "(not set)" || fallback === "(not set)") {
    return notSetLabel
  }
  if (!/^[A-Za-z]{2}$/.test(code)) return fallback
  try {
    return (
      new Intl.DisplayNames([locale === "zh" ? "zh-CN" : "en"], {
        type: "region",
      }).of(code.toUpperCase()) ?? fallback
    )
  } catch {
    return fallback
  }
}

/**
 * Dotted world map (GitHub-contribution-style) with a pin per visitor
 * country. Exact numbers stay readable in the legend below — the map is
 * the at-a-glance geographic shape, not the precise source of truth.
 */
export function CountryDotMap({
  countries,
  usersLabel,
}: {
  countries: CountryDatum[]
  usersLabel: string
}) {
  const { t, locale } = useT()
  const [tooltip, setTooltip] = useState<PinTooltip | null>(null)
  const canHover = useSyncExternalStore(
    subscribeHover,
    getHoverSnapshot,
    () => true
  )

  const localizedCountries = useMemo(() => {
    const notSet = t("admin.countryNotSet") as string
    return countries.map((c) => ({
      ...c,
      name: localizedCountryName(c.code, c.name, locale, notSet),
    }))
  }, [countries, locale, t])

  // Drop an open tip when the locale flips so we don't keep an English
  // (or Chinese) label after the chips have already relabeled.
  const [prevLocale, setPrevLocale] = useState(locale)
  if (locale !== prevLocale) {
    setPrevLocale(locale)
    setTooltip(null)
  }

  const { dots, pins, width, height } = useMemo(() => {
    const map = new DottedMap({ map: MAP_DATA })
    const max = Math.max(...localizedCountries.map((c) => c.users), 1)
    for (const c of localizedCountries) {
      const centroid = COUNTRY_CENTROIDS[c.code]
      if (!centroid) continue // e.g. "(not set)" — stays in the legend
      map.addPin({
        lat: centroid[0],
        lng: centroid[1],
        data: {
          name: c.name,
          users: c.users,
          radius: 0.55 + 0.5 * Math.sqrt(c.users / max),
        } satisfies PinData,
      })
    }
    const all = map.getPoints()
    const pins: ({ x: number; y: number } & PinData)[] = []
    const dots: { x: number; y: number }[] = []
    for (const p of all) {
      if (p.data) pins.push({ x: p.x, y: p.y, ...(p.data as PinData) })
      else dots.push({ x: p.x, y: p.y })
    }
    return { dots, pins, width: map.image.width, height: map.image.height }
  }, [localizedCountries])

  const pinTooltip = useCallback(
    (pin: { x: number; y: number } & PinData): PinTooltip => ({
      ...pin,
      xPct: (pin.x / width) * 100,
      yPct: (pin.y / height) * 100,
    }),
    [width, height]
  )

  // Tap-outside dismisses the mobile pin tooltip.
  useEffect(() => {
    if (!tooltip || canHover) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (target?.closest?.("[data-country-map]")) return
      setTooltip(null)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [tooltip, canHover])

  return (
    <div className="flex flex-col gap-3" data-country-map>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full text-muted-foreground/30"
          aria-hidden="true"
        >
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={DOT_RADIUS}
              fill="currentColor"
            />
          ))}
          {pins.map((pin, i) => {
            const active = tooltip?.name === pin.name
            return (
              <g
                key={`${pin.name}-${pin.x}-${pin.y}`}
                className="cursor-pointer"
                // Visual-only: the chip list below is the accessible control.
                // Do not put role/tabIndex here — the parent svg is
                // aria-hidden, and focusable nodes inside aria-hidden are
                // an a11y violation.
                onMouseEnter={
                  canHover ? () => setTooltip(pinTooltip(pin)) : undefined
                }
                onMouseLeave={canHover ? () => setTooltip(null) : undefined}
                onClick={
                  !canHover
                    ? () => {
                        const next = pinTooltip(pin)
                        setTooltip((cur) =>
                          cur?.name === next.name ? null : next
                        )
                      }
                    : undefined
                }
              >
                {/* Invisible hit pad — visual pin stays small; touch needs
                    a larger target in map coordinates. */}
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={Math.max(pin.radius + 0.7, PIN_HIT_MIN)}
                  fill="transparent"
                />
                {/* Halo breathes (pin-breathe, globals.css); delay staggers
                    pins so the map shimmers instead of pulsing in unison.
                    chart-2: single-hue family shared with area/calendar. */}
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={pin.radius + 0.7}
                  fill="var(--color-chart-2)"
                  opacity={active ? 0.35 : 0.15}
                  className="map-pin-halo"
                  style={{ animationDelay: `${(i * 0.45) % 2.6}s` }}
                />
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={pin.radius}
                  fill="var(--color-chart-2)"
                />
              </g>
            )
          })}
        </svg>

        {/* Edge-aware placement: high-latitude pins flip the tooltip below
            the pin and near-edge pins switch anchoring, because the Card's
            overflow-hidden would otherwise clip it. */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 flex flex-col gap-0.5 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `${tooltip.xPct}%`,
              top: `${tooltip.yPct}%`,
              transform: `${
                tooltip.xPct < 20
                  ? "translateX(0)"
                  : tooltip.xPct > 80
                    ? "translateX(-100%)"
                    : "translateX(-50%)"
              } ${
                tooltip.yPct < 18
                  ? "translateY(10px)"
                  : "translateY(calc(-100% - 10px))"
              }`,
            }}
          >
            <span className="font-medium">{tooltip.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {usersLabel}: {tooltip.users.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Country chips — every row stays listed (the map can't carry exact
          values); GA caps the report at 10 rows, so wrapping chips stay
          compact. On touch, tapping a chip also focuses the matching pin. */}
      <ul className="flex flex-wrap gap-1.5">
        {localizedCountries.map((c, i) => {
          const pin = pins.find((p) => p.name === c.name)
          const selected = tooltip?.name === c.name
          return (
            <li key={`${c.code}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  if (!pin) {
                    setTooltip(null)
                    return
                  }
                  const next = pinTooltip(pin)
                  setTooltip((cur) =>
                    cur?.name === next.name ? null : next
                  )
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  selected
                    ? "border-chart-2/50 bg-chart-2/15"
                    : "border-border/60 bg-muted/40 hover:bg-muted"
                )}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-chart-2" />
                <TruncateTooltip
                  nativeTitle
                  className="max-w-[9rem] font-medium"
                >
                  {c.name}
                </TruncateTooltip>
                <span className="tabular-nums text-muted-foreground">
                  {c.users.toLocaleString()}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
