"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Globe, { type GlobeMethods } from "react-globe.gl"
import { COUNTRY_CENTROIDS } from "@/lib/country-centroids"
import { cn } from "@/lib/utils"

export interface GlobeCountry {
  code: string
  name: string
  users: number
}

interface GlobePoint {
  code: string
  name: string
  users: number
  lat: number
  lng: number
  altitude: number
  radius: number
}

/** Approx chart-2 (oklch teal) as hex — Three.js cannot read CSS variables. */
const POINT_COLOR = "#2bb8a6"
const POINT_COLOR_ACTIVE = "#1a9e8c"

/**
 * Rotatable Three.js globe for the Countries expand dialog. Client-only
 * (imported via next/dynamic with ssr:false). Drag to orbit; chips call
 * `focusName` to fly the camera to that country.
 */
export function CountryTrafficGlobe({
  countries,
  focusName,
  usersLabel,
  className,
}: {
  countries: GlobeCountry[]
  /** Localized country name to fly to; null keeps auto-rotate. */
  focusName: string | null
  usersLabel: string
  className?: string
}) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      const side = Math.floor(Math.min(rect.width, rect.height))
      if (side > 0) setSize({ w: side, h: side })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = useMemo(() => {
    const max = Math.max(...countries.map((c) => c.users), 1)
    const out: GlobePoint[] = []
    for (const c of countries) {
      const centroid = COUNTRY_CENTROIDS[c.code]
      if (!centroid) continue
      const share = Math.sqrt(c.users / max)
      out.push({
        code: c.code,
        name: c.name,
        users: c.users,
        lat: centroid[0],
        lng: centroid[1],
        altitude: 0.012 + 0.06 * share,
        radius: 0.35 + 0.55 * share,
      })
    }
    return out
  }, [countries])

  // Enable orbit + gentle auto-rotate once the WebGL canvas mounts.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || size.w === 0) return
    const controls = globe.controls()
    controls.autoRotate = !focusName
    controls.autoRotateSpeed = 0.45
    controls.enableZoom = true
    controls.minDistance = 120
    controls.maxDistance = 400
    if (!focusName) {
      globe.pointOfView({ lat: 18, lng: 12, altitude: 2.15 }, 0)
    }
  }, [size.w, focusName])

  // Fly to the selected country when a legend chip is pressed.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !focusName) return
    const point = points.find((p) => p.name === focusName)
    if (!point) return
    const controls = globe.controls()
    controls.autoRotate = false
    globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: 1.55 }, 900)
  }, [focusName, points])

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[min(100%,28rem)]",
        className
      )}
    >
      {size.w > 0 && (
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
          atmosphereColor={POINT_COLOR}
          atmosphereAltitude={0.14}
          pointsData={points}
          pointLat="lat"
          pointLng="lng"
          pointAltitude="altitude"
          pointRadius="radius"
          pointColor={(d) =>
            (d as GlobePoint).name === focusName
              ? POINT_COLOR_ACTIVE
              : POINT_COLOR
          }
          pointLabel={(d) => {
            const p = d as GlobePoint
            return `${p.name}<br/>${usersLabel}: ${p.users.toLocaleString()}`
          }}
          pointsMerge={false}
          animateIn
        />
      )}
    </div>
  )
}
