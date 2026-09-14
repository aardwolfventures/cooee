/** Geodesy helpers. Small-area work, so a spherical earth is plenty. */

export interface LatLon {
  lat: number
  lon: number
}

const EARTH_RADIUS_M = 6371008.8
const DEG = Math.PI / 180

export function metresBetween(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG
  const dLon = (b.lon - a.lon) * DEG
  const lat1 = a.lat * DEG
  const lat2 = b.lat * DEG
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Initial great-circle bearing from `a` to `b`, degrees clockwise from north. */
export function bearingBetween(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * DEG
  const lat2 = b.lat * DEG
  const dLon = (b.lon - a.lon) * DEG
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) / DEG + 360) % 360
}

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const

export function compassPoint(bearingDeg: number): string {
  const index = Math.round(((bearingDeg % 360) + 360) % 360 / 22.5) % 16
  return COMPASS[index] ?? 'N'
}

/** Interpolate along the great circle between two points (t from 0 to 1). */
export function interpolate(a: LatLon, b: LatLon, t: number): LatLon {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }
}

/**
 * Tobler's hiking function: walking speed as a function of slope.
 * Returns metres per second. The 0.05 offset puts peak speed on a gentle
 * descent rather than the flat, which is what actually happens on a hill.
 */
export function toblerSpeedMps(slope: number): number {
  const kmh = 6 * Math.exp(-3.5 * Math.abs(slope + 0.05))
  return (kmh * 1000) / 3600
}
