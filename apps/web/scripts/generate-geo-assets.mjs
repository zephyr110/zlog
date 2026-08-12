// Regenerates the two static geo assets used by the admin Traffic panel:
//   src/lib/world-dot-map.ts     — precomputed Natural Earth land dots + projection
//   src/lib/country-centroids.ts — ISO 3166-1 alpha-2 → [lat, lng] centroids
//
// Run from apps/web:  pnpm generate:geo
// Runtime cost: zero polygons — the client only ships the flat dot list and
// reuses the same Natural Earth scale/translate (via d3-geo) for traffic pins.

import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { geoNaturalEarth1, geoContains } from "d3-geo"
import { feature } from "topojson-client"

const require = createRequire(import.meta.url)
const countries = require("world-countries")
// 110m is enough for a dotted silhouette; 50m makes generate:geo much slower
// for little pin-map benefit once Antarctica is excluded from the fit.
const landTopo = require("world-atlas/land-110m.json")

const here = dirname(fileURLToPath(import.meta.url))
const out = (name) => join(here, "..", "src", "lib", name)

/** Compact viewBox — Natural Earth is ~1.9:1; padding keeps coast dots inset. */
const WIDTH = 96
const HEIGHT = 50
/** Hex-ish diagonal spacing (matches prior dotted-map “diagonal” look). */
const STEP = 1.05
/**
 * Keep Arctic tip fills on the same visual rhythm as the hex grid — a looser
 * MIN_DIST previously let Peary Land vertices clump into overlapping blobs.
 */
const MIN_DIST = STEP * 0.9
/**
 * Drop Antarctica from fit + sampling. Site-traffic pins never land there,
 * and including it in Natural Earth crush-fits Greenland against the top
 * pad so the island reads as truncated.
 */
const ANTARCTICA_MAX_LAT = -55

/**
 * world-atlas `land` is a GeometryCollection → FeatureCollection of polygons.
 * Keep any polygon whose outer ring reaches north of Antarctica.
 */
function landWithoutAntarctica(topo) {
  const fc = feature(topo, topo.objects.land)
  const feats = fc.type === "FeatureCollection" ? fc.features : [fc]
  const coordinates = []
  for (const f of feats) {
    const g = f.geometry
    if (!g) continue
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates
    for (const poly of polys) {
      let maxLat = -90
      for (const ring of poly) {
        for (const [, lat] of ring) {
          if (lat > maxLat) maxLat = lat
        }
      }
      if (maxLat < ANTARCTICA_MAX_LAT) continue
      coordinates.push(poly)
    }
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPolygon", coordinates },
  }
}

const landFeature = landWithoutAntarctica(landTopo)
const projection = geoNaturalEarth1().fitExtent(
  [
    [1.5, 2.4],
    [WIDTH - 1.5, HEIGHT - 1.5],
  ],
  landFeature
)
// Leave air above Cape Morris Jesup so the tip is not flush with the card edge.
projection.translate([
  projection.translate()[0],
  projection.translate()[1] + 0.5,
])

const pad = 1.2
const cell = MIN_DIST
const buckets = new Map()
const dots = []

function addDot(x, y) {
  if (x < pad || x > WIDTH - pad || y < pad || y > HEIGHT - pad) return false
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const ix = Math.floor(x / cell)
  const iy = Math.floor(y / cell)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const near = buckets.get(`${ix + dx};${iy + dy}`)
      if (!near) continue
      for (const d of near) {
        const ddx = d.x - x
        const ddy = d.y - y
        if (ddx * ddx + ddy * ddy < MIN_DIST * MIN_DIST) return false
      }
    }
  }
  const point = { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) }
  const key = `${Math.floor(point.x / cell)};${Math.floor(point.y / cell)}`
  const list = buckets.get(key)
  if (list) list.push(point)
  else buckets.set(key, [point])
  dots.push(point)
  return true
}

const ystep = STEP * Math.sqrt(3) * 0.5

// 1) Main diagonal hex grid — the visual rhythm for the whole map.
for (let row = 0, y = pad; y < HEIGHT - pad; row++, y += ystep) {
  const x0 = pad + (row % 2) * (STEP * 0.5)
  for (let x = x0; x < WIDTH - pad; x += STEP) {
    const ll = projection.invert([x, y])
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) continue
    if (Math.abs(ll[1]) > 90 || Math.abs(ll[0]) > 180) continue
    // Natural Earth invert is multi-valued near the frame — reject samples
    // that do not round-trip (ghost Arctic rows above the true coastline).
    const back = projection(ll)
    if (!back || Math.hypot(back[0] - x, back[1] - y) > 0.55) continue
    if (!geoContains(landFeature, ll)) continue
    addDot(x, y)
  }
}

// 2) Sparse Arctic tip fill on the same hex lattice. Natural Earth flattens
// 80–84°N into less than one hex step, so the main grid alone chops Greenland;
// we only place dots that still clear MIN_DIST (≈ hex spacing).
const tipY = projection([-33.5, 83.6])[1]
const tipRow0 = Math.floor((Math.min(tipY, pad) - pad) / ystep)
for (let row = tipRow0; row < tipRow0 + 4; row++) {
  if (row < 0) continue
  const y = pad + row * ystep
  if (y > tipY + ystep * 1.2) continue
  const x0 = pad + (row % 2) * (STEP * 0.5)
  for (let x = x0; x < WIDTH - pad; x += STEP) {
    // Only the Greenland / NE Canada longitude band needs the tip rescue.
    if (x < 34 || x > 48) continue
    const ll = projection.invert([x, y])
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) continue
    if (ll[1] < 79) continue
    const back = projection(ll)
    if (!back || Math.hypot(back[0] - x, back[1] - y) > 0.55) continue
    if (!geoContains(landFeature, ll)) continue
    addDot(x, y)
  }
}

// 3) At most a few peak vertices (Cape Morris Jesup etc.), still hex-spaced.
for (const poly of landFeature.geometry.coordinates) {
  for (const ring of poly) {
    for (const [lng, lat] of ring) {
      if (lat < 82.5) continue
      const xy = projection([lng, lat])
      if (!xy) continue
      addDot(xy[0], xy[1])
    }
  }
}

dots.sort((a, b) => a.y - b.y || a.x - b.x)

const [tx, ty] = projection.translate()
const mapAsset = {
  width: WIDTH,
  height: HEIGHT,
  projection: {
    name: "naturalEarth1",
    scale: Number(projection.scale().toFixed(6)),
    translate: [Number(tx.toFixed(4)), Number(ty.toFixed(4))],
  },
  dots,
}

writeFileSync(
  out("world-dot-map.ts"),
  `// Generated by scripts/generate-geo-assets.mjs — do not edit by hand.
export interface WorldDotMap {
  width: number
  height: number
  projection: {
    name: "naturalEarth1"
    scale: number
    translate: readonly [number, number]
  }
  dots: readonly { x: number; y: number }[]
}

export const WORLD_DOT_MAP: WorldDotMap = ${JSON.stringify(mapAsset)} as const
`
)

const centroids = Object.fromEntries(
  countries
    .filter((c) => c.cca2 && c.latlng?.length === 2)
    .map((c) => [
      c.cca2,
      [Number(c.latlng[0].toFixed(2)), Number(c.latlng[1].toFixed(2))],
    ])
)
writeFileSync(
  out("country-centroids.ts"),
  `// Generated by scripts/generate-geo-assets.mjs from world-countries — do not edit by hand.
export const COUNTRY_CENTROIDS: Record<string, readonly [number, number]> = ${JSON.stringify(centroids, null, 2)}
`
)

const jesup = projection([-33.5, 83.6])
const arctic = dots.filter((d) => {
  const ll = projection.invert([d.x, d.y])
  return ll && ll[1] >= 80 && ll[0] >= -75 && ll[0] <= -10
})
const ys = arctic.map((d) => d.y)
const minPair = (() => {
  let min = Infinity
  for (let i = 0; i < arctic.length; i++) {
    for (let j = i + 1; j < arctic.length; j++) {
      const d = Math.hypot(arctic[i].x - arctic[j].x, arctic[i].y - arctic[j].y)
      if (d < min) min = d
    }
  }
  return min
})()
console.log(
  `dots: ${dots.length}, arctic≥80°: ${arctic.length}, minArcticDist: ${minPair.toFixed(2)}, jesup y: ${jesup[1].toFixed(2)}, yMin: ${Math.min(...ys).toFixed(2)}`
)
