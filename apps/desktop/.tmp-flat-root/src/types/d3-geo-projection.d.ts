declare module "d3-geo-projection" {
  import type { GeoProjection } from "d3-geo"

  export function geoRobinson(): GeoProjection
  export function geoRobinsonRaw(lambda: number, phi: number): [number, number]
}
