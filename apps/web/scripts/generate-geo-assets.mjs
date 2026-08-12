// Regenerates the two static geo assets used by the admin Traffic panel:
//   src/lib/world-dot-map.ts     — precomputed Robinson land dots + projection
//   src/lib/country-centroids.ts — ISO 3166-1 alpha-2 → [lat, lng] centroids
//
// Run from apps/web:  pnpm generate:geo
// Runtime cost: zero polygons — the client only ships the flat dot list and
// reuses the same Robinson scale/translate (via d3-geo-projection) for pins.

import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { geoContains, geoCentroid, geoArea } from "d3-geo"
import { geoRobinson } from "d3-geo-projection"
import { feature } from "topojson-client"

const require = createRequire(import.meta.url)
const countries = require("world-countries")
// 110m for fast hex sampling; 50m only to recover small islands / Arctic tips
// that 110m flattens away (Pacific, Caribbean, Canadian archipelago, Svalbard).
const land110Topo = require("world-atlas/land-110m.json")
const land50Topo = require("world-atlas/land-50m.json")

const here = dirname(fileURLToPath(import.meta.url))
const out = (name) => join(here, "..", "src", "lib", name)

/**
 * Robinson silhouette (~1.97:1). Larger viewBox + denser step than the old
 * 96×50 grid so Canada/Russia north and Pacific islands read against the
 * reference compromise map (Antarctica omitted).
 */
const WIDTH = 168
const HEIGHT = 85
const STEP = 0.82
const MIN_DIST = STEP * 0.9
/** Drop Antarctica — reference traffic maps end south of Tierra del Fuego / NZ. */
const ANTARCTICA_MAX_LAT = -55
/** Steradians; roughly “one hex cell or smaller” on a world map. */
const SMALL_ISLAND_AREA = 0.00012

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

const land110 = landWithoutAntarctica(land110Topo)
const land50 = landWithoutAntarctica(land50Topo)

const projection = geoRobinson().fitExtent(
  [
    [1.8, 2.2],
    [WIDTH - 1.8, HEIGHT - 1.8],
  ],
  land110
)
// Slight south bias so Greenland / Ellesmere tip sits inside the frame.
projection.translate([
  projection.translate()[0],
  projection.translate()[1] + 0.7,
])

const pad = 1.4
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

function validLandSample(x, y, land) {
  const ll = projection.invert([x, y])
  if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return null
  if (Math.abs(ll[1]) > 90 || Math.abs(ll[0]) > 180) return null
  // Invert can be multi-valued near the frame — require round-trip.
  const back = projection(ll)
  if (!back || Math.hypot(back[0] - x, back[1] - y) > 0.6) return null
  if (!geoContains(land, ll)) return null
  return ll
}

const ystep = STEP * Math.sqrt(3) * 0.5

// 1) Main diagonal hex grid against 110m land (fast path).
for (let row = 0, y = pad; y < HEIGHT - pad; row++, y += ystep) {
  const x0 = pad + (row % 2) * (STEP * 0.5)
  for (let x = x0; x < WIDTH - pad; x += STEP) {
    if (!validLandSample(x, y, land110)) continue
    addDot(x, y)
  }
}

// 2) Extra Arctic hex rows on 110m — Robinson flattens 80–84°N.
const tipY = projection([-33.5, 83.6])[1]
for (let row = 0, y = pad; y < tipY + ystep * 1.5; row++, y += ystep) {
  const x0 = pad + (row % 2) * (STEP * 0.5)
  for (let x = x0; x < WIDTH - pad; x += STEP) {
    const ll = validLandSample(x, y, land110)
    if (!ll || ll[1] < 78) continue
    addDot(x, y)
  }
}

// 3) 50m small-island centroids — Pacific / Caribbean / Aleutians / Svalbard
// often fall between hex cells on 110m.
let islandSeeds = 0
for (const poly of land50.geometry.coordinates) {
  const feat = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: poly },
  }
  const area = geoArea(feat)
  if (area > SMALL_ISLAND_AREA) continue
  const [lng, lat] = geoCentroid(feat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
  if (lat < ANTARCTICA_MAX_LAT) continue
  const xy = projection([lng, lat])
  if (!xy) continue
  if (addDot(xy[0], xy[1])) islandSeeds++
}

// 4) 50m high-latitude coastline vertices (sparse via MIN_DIST) for jagged
// Arctic archipelago detail that 110m smooths over.
let arcticVerts = 0
for (const poly of land50.geometry.coordinates) {
  for (const ring of poly) {
    for (let i = 0; i < ring.length; i += 3) {
      const [lng, lat] = ring[i]
      if (lat < 70) continue
      const xy = projection([lng, lat])
      if (!xy) continue
      if (addDot(xy[0], xy[1])) arcticVerts++
    }
  }
}

dots.sort((a, b) => a.y - b.y || a.x - b.x)

const [tx, ty] = projection.translate()
const mapAsset = {
  width: WIDTH,
  height: HEIGHT,
  projection: {
    name: "robinson",
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
    name: "robinson"
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

const pacific = dots.filter((d) => {
  const ll = projection.invert([d.x, d.y])
  return ll && ll[0] > 130 && ll[0] < 180 && ll[1] > -50 && ll[1] < 30
})
const arctic = dots.filter((d) => {
  const ll = projection.invert([d.x, d.y])
  return ll && ll[1] >= 70
})
console.log(
  `dots: ${dots.length}, islands: ${islandSeeds}, arcticVerts: ${arcticVerts}, arctic≥70°: ${arctic.length}, pacific: ${pacific.length}`
)
