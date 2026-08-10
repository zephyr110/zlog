"use client"

import { useMemo, useState } from "react"
import DottedMap, { type MapData } from "dotted-map/without-countries"
import { WORLD_DOT_MAP_JSON } from "@/lib/world-dot-map"
import { COUNTRY_CENTROIDS } from "@/lib/country-centroids"

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
  const [tooltip, setTooltip] = useState<PinTooltip | null>(null)

  const { dots, pins, width, height } = useMemo(() => {
    const map = new DottedMap({ map: MAP_DATA })
    const max = Math.max(...countries.map((c) => c.users), 1)
    for (const c of countries) {
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
  }, [countries])

  const showTooltip = (pin: PinTooltip | null) => setTooltip(pin)

  return (
    <div className="flex flex-col gap-3">
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
          {pins.map((pin) => (
            <g
              key={`${pin.name}-${pin.x}-${pin.y}`}
              className="cursor-pointer"
              onMouseEnter={() =>
                showTooltip({
                  ...pin,
                  xPct: (pin.x / width) * 100,
                  yPct: (pin.y / height) * 100,
                })
              }
              onMouseLeave={() => showTooltip(null)}
            >
              <circle
                cx={pin.x}
                cy={pin.y}
                r={pin.radius + 0.7}
                fill="var(--color-primary)"
                opacity={0.15}
              />
              <circle cx={pin.x} cy={pin.y} r={pin.radius} fill="var(--color-primary)">
                <title>{`${pin.name}: ${pin.users.toLocaleString()} ${usersLabel}`}</title>
              </circle>
            </g>
          ))}
        </svg>

        {/* Edge-aware placement: high-latitude pins flip the tooltip below
            the pin and near-edge pins switch anchoring, because the Card's
            overflow-hidden would otherwise clip it. */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
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
            <span className="font-medium">{tooltip.name}</span>{" "}
            <span className="tabular-nums text-muted-foreground">
              {tooltip.users.toLocaleString()} {usersLabel}
            </span>
          </div>
        )}
      </div>

      {/* Country legend — every row stays listed (the map can't carry exact
          values); GA caps the report at 10 rows, so no slice here. */}
      <ol className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {countries.map((c, i) => (
          <li
            key={`${c.code}-${i}`}
            className="flex items-center gap-2 text-xs"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            <span className="min-w-0 truncate font-medium" title={c.name}>
              {c.name}
            </span>
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
              {c.users.toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
