"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Maximize2 } from "lucide-react"
import { hasFlag } from "country-flag-icons"
import * as Flags from "country-flag-icons/react/3x2"
import DottedMap, { type MapData } from "dotted-map/without-countries"
import { WORLD_DOT_MAP_JSON } from "@/lib/world-dot-map"
import { COUNTRY_CENTROIDS } from "@/lib/country-centroids"
import { TruncateTooltip } from "@/components/ui/truncate-tooltip"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AdminBlockEmpty } from "@/components/admin/admin-block-empty"
import { useCanHover } from "@/hooks/use-media-query"
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
  /** ISO 3166-1 alpha-2 — drives the SVG flag in tooltips/chips. */
  code: string
  name: string
  users: number
  radius: number
}

interface PinTooltip extends PinData {
  xPct: number
  yPct: number
}

type LegendMode = "scroll" | "grid"

// Parsed once at module load — the ~50KB JSON is a precomputed dot grid, so
// no country polygons or projection math ship to the client bundle.
const MAP_DATA = JSON.parse(WORLD_DOT_MAP_JSON) as MapData

/** Background dot radius; pins scale with sqrt share of the max country. */
const DOT_RADIUS = 0.3
/** Invisible hit target floor — map coords are tiny; without this, phone
 *  taps miss the pin core entirely. */
const PIN_HIT_MIN = 2.2
/**
 * Pin-halo breathe duration (seconds) — MUST match the `pin-breathe`
 * animation in globals.css. The stagger phases wrap on this value so the
 * shimmer stays evenly distributed when the animation is re-tuned.
 */
const PIN_BREATHE_S = 2.6

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

type FlagSize = "sm" | "md" | "lg"

const FLAG_SIZE_CLASS: Record<FlagSize, string> = {
  sm: "h-3 w-[1.125rem]",
  md: "h-3.5 w-5",
  lg: "h-4 w-6",
}

function FlagFallback({
  size,
  className,
}: {
  size: FlagSize
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        FLAG_SIZE_CLASS[size],
        className
      )}
      aria-hidden
    >
      <span className="size-1.5 rounded-full bg-chart-2" />
    </span>
  )
}

/**
 * Cross-platform SVG flag (country-flag-icons). System emoji flags are
 * unreliable on Windows — these render identically everywhere.
 *
 * Uses the static react/3x2 barrel (Turbopack cannot resolve dynamic
 * `import(\`…/${cc}\`)` into that package). The module is admin-only via
 * Traffic’s client boundary.
 */
function CountryFlag({
  code,
  size = "sm",
  className,
}: {
  code: string
  size?: FlagSize
  className?: string
}) {
  const cc = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc) || !hasFlag(cc)) {
    return <FlagFallback size={size} className={className} />
  }
  const Flag = Flags[cc as keyof typeof Flags]
  if (!Flag) {
    return <FlagFallback size={size} className={className} />
  }
  return (
    <Flag
      className={cn(
        "shrink-0 rounded-[2px] ring-1 ring-border/40",
        FLAG_SIZE_CLASS[size],
        className
      )}
      aria-hidden
    />
  )
}

/**
 * Dotted world map + country legend. `legend="scroll"` keeps the compact
 * card row; `legend="grid"` wraps every country so expanded view shows all.
 */
function CountryMapView({
  countries,
  usersLabel,
  legend,
}: {
  countries: CountryDatum[]
  usersLabel: string
  legend: LegendMode
}) {
  const { t, locale } = useT()
  const [tooltip, setTooltip] = useState<PinTooltip | null>(null)
  const canHover = useCanHover()

  // t is stable across renders (memoized on locale in useT), so memoizing
  // on [countries, locale] is safe — a per-render t identity here used to
  // re-run the whole {dots,pins} pipeline (new DottedMap + getPoints over
  // the full dot grid) on every pin hover.
  //
  // Distinct GA rows can localize to the same name ("(not set)" classes,
  // DisplayNames collisions) — dedupe by name and merge users so legend
  // chips and map pins are 1:1 and chip taps always hit their own pin.
  const localizedCountries = useMemo(() => {
    const notSet = t("admin.countryNotSet") as string
    const byName = new Map<string, CountryDatum & { name: string }>()
    for (const c of countries) {
      const name = localizedCountryName(c.code, c.name, locale, notSet)
      const entry = byName.get(name)
      if (entry) entry.users += c.users
      else byName.set(name, { ...c, name })
    }
    return [...byName.values()].sort((a, b) => b.users - a.users)
  }, [countries, locale, t])

  const totalUsers =
    localizedCountries.reduce((sum, c) => sum + c.users, 0) || 1

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
          code: c.code,
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

  const selectCountry = useCallback(
    (name: string) => {
      const pin = pins.find((p) => p.name === name)
      if (!pin) {
        setTooltip(null)
        return
      }
      const next = pinTooltip(pin)
      setTooltip((cur) => (cur?.name === next.name ? null : next))
    },
    [pins, pinTooltip]
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

  const tooltipFlag = tooltip ? (
    <CountryFlag code={tooltip.code} size="md" className="mt-0.5" />
  ) : null

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3",
        // Compact card: fill stretched xl row height so chips sit on the
        // floor instead of floating above a void.
        legend === "scroll" && "min-h-0 flex-1"
      )}
      data-country-map
    >
      <div
        className={cn(
          "relative min-w-0",
          legend === "scroll" && "flex min-h-0 flex-1 items-center"
        )}
      >
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
                  style={{
                    animationDelay: `${(i * 0.45) % PIN_BREATHE_S}s`,
                  }}
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
            className="pointer-events-none absolute z-10 flex items-start gap-2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
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
            {tooltipFlag}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{tooltip.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {usersLabel}: {tooltip.users.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {legend === "scroll" ? (
        /* Compact card: one row with horizontal scroll when chips overflow. */
        <ul className="flex min-w-0 shrink-0 touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {localizedCountries.map((c, i) => {
            const selected = tooltip?.name === c.name
            return (
              <li key={`${c.code}-${i}`} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectCountry(c.name)}
                  className={cn(
                    "flex max-w-[min(100vw-3rem,18rem)] items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
                    selected
                      ? "border-chart-2/50 bg-chart-2/15"
                      : "border-border/60 bg-muted/40 hover:bg-muted"
                  )}
                >
                  <CountryFlag code={c.code} size="sm" />
                  <TruncateTooltip
                    nativeTitle
                    className="max-w-[7rem] font-medium sm:max-w-[9rem]"
                  >
                    {c.name}
                  </TruncateTooltip>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    ({c.users.toLocaleString()})
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        /* Expanded dialog: wrap grid so every country is visible at once. */
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {localizedCountries.map((c, i) => {
            const selected = tooltip?.name === c.name
            const pct = Math.round((c.users / totalUsers) * 1000) / 10
            return (
              <li key={`${c.code}-${i}`}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectCountry(c.name)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "border-chart-2/50 bg-chart-2/15"
                      : "border-border/60 bg-muted/30 hover:bg-muted/60"
                  )}
                >
                  <CountryFlag code={c.code} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {c.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                      <span>
                        {usersLabel} {c.users.toLocaleString()}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{pct}%</span>
                    </span>
                    <span
                      className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full bg-chart-2"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Countries breakdown card with optional fullscreen dialog — compact chips
 * stay in the panel; expand shows the full wrap grid so nothing is hidden
 * behind horizontal scroll.
 */
export function CountriesPanel({
  title,
  countries,
  usersLabel,
}: {
  title: string
  countries: CountryDatum[]
  usersLabel: string
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const empty = countries.length === 0

  return (
    <>
      <Card className="flex min-w-0 flex-col py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {!empty && (
            <CardAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("admin.analyticsExpandCountries")}
                onClick={() => setOpen(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Maximize2 />
              </Button>
            </CardAction>
          )}
        </CardHeader>
        {/* Card py-4 already provides the 16px floor — no extra pb-4, so
            side/bottom insets stay equal (px-4). */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 md:min-h-40">
          {empty ? (
            <AdminBlockEmpty className="min-h-0 flex-1" />
          ) : (
            <CountryMapView
              countries={countries}
              usersLabel={usersLabel}
              legend="scroll"
            />
          )}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(94vh,56rem)] w-full max-w-[min(56rem,calc(100%_-_1.5rem))] flex-col gap-0 overflow-hidden p-0 xl:max-h-[min(94vh,68rem)] xl:max-w-[min(72rem,calc(100%_-_3rem))] 2xl:max-w-[min(84rem,calc(100%_-_4rem))]">
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-12 text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {t("admin.analyticsExpandCountriesDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <CountryMapView
              countries={countries}
              usersLabel={usersLabel}
              legend="grid"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

