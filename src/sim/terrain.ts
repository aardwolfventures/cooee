/**
 * Terrain for Vulcan State Forest, NSW Central Tablelands.
 *
 * Elevation is real, not modelled: `elevationAt` reads the SRTM-derived grid
 * loaded by `./dem`, covering the same extent as the Forestry Corporation
 * 1:50,000 sheet the map draws. Cross-sections, slope-adjusted walk times and
 * the shaded-relief base layer all read this one surface, so they agree with
 * each other and with the printed contours.
 *
 * This replaced a synthetic surface shaped like the Wonnangatta Valley — a
 * river valley with a 400 m floor and 1400 m tops. Vulcan is a different kind
 * of country: a dissected plateau sitting around 1100-1300 m, with the
 * Abercrombie gorge cut into the south-west corner. Moving the prototype here
 * without moving the terrain would have put honest-looking numbers on the
 * wrong landform.
 */
import type { LatLon } from '@/lib/geo'
import { sampleElevation } from './dem'

/**
 * Camp: a road junction in the Vulcan State Forest block south-east of Black
 * Springs, inside the area the sheet zones as Hunting Forest. Everything is
 * positioned relative to this.
 */
export const ORIGIN: LatLon = { lat: -33.85137, lon: 149.7697 }

const M_PER_DEG_LAT = 111_132
const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)

/** Kilometres east and north of ORIGIN. */
export interface LocalKm {
  east: number
  north: number
}

export function toLocalKm(p: LatLon): LocalKm {
  return {
    east: ((p.lon - ORIGIN.lon) * M_PER_DEG_LON) / 1000,
    north: ((p.lat - ORIGIN.lat) * M_PER_DEG_LAT) / 1000,
  }
}

export function fromLocalKm(local: LocalKm): LatLon {
  return {
    lat: ORIGIN.lat + (local.north * 1000) / M_PER_DEG_LAT,
    lon: ORIGIN.lon + (local.east * 1000) / M_PER_DEG_LON,
  }
}

/** Metres above sea level at a point. */
export function elevationAt(p: LatLon): number {
  return sampleElevation(p)
}

/** Elevation samples along a straight line, for the cross-section view. */
export interface ProfileSample {
  distanceM: number
  elevationM: number
}

export function profileBetween(a: LatLon, b: LatLon, samples = 64): ProfileSample[] {
  const out: ProfileSample[] = []
  const totalM = Math.hypot(
    (b.lat - a.lat) * M_PER_DEG_LAT,
    (b.lon - a.lon) * M_PER_DEG_LON,
  )
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples
    const point = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }
    out.push({ distanceM: totalM * t, elevationM: elevationAt(point) })
  }
  return out
}
