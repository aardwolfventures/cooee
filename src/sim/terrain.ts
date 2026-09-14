/**
 * Synthetic terrain for the Wonnangatta Valley, Victorian High Country.
 *
 * This is deliberately fake. The brief allows it: a plausible hand-built
 * surface tests the interaction exactly as well as a real DEM, and swapping in
 * real elevation data later touches only this file. What matters is that the
 * surface is deterministic, continuous, and has the shape of real high country
 * — a sinuous river valley around 400 m with spurs and ridges climbing past
 * 1400 m — so that cross-sections and slope-adjusted walk times read honestly.
 */
import type { LatLon } from '@/lib/geo'

/** Wonnangatta Station site, roughly. Everything is positioned relative to this. */
export const ORIGIN: LatLon = { lat: -37.1897, lon: 146.8683 }

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

/** North offset of the river centreline at a given easting, in kilometres. */
function riverNorthAt(east: number): number {
  return 0.9 * Math.sin(east / 2.3) + 0.35 * Math.sin(east / 0.9 + 1.2)
}

/** Metres above sea level at a point. Continuous and deterministic. */
export function elevationAt(p: LatLon): number {
  const { east, north } = toLocalKm(p)
  const fromRiver = Math.abs(north - riverNorthAt(east))

  const valley = 400 + 700 * Math.tanh(fromRiver / 1.8)
  const ridges = 200 * Math.sin(east / 1.35 + 0.6) * Math.cos(north / 1.7 - 0.4)
  const spurs = 90 * Math.sin(east / 0.55 - 1.1) * Math.sin(north / 0.62 + 0.3)
  const rough = 28 * Math.sin(east / 0.21) * Math.cos(north / 0.19)

  return valley + ridges + spurs + rough
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
