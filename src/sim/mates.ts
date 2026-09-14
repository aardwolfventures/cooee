/**
 * The party: Mike behind the phone, with Ben, Marshy and Rod out in front.
 *
 * Real names, deliberately. A dot labelled "Mate 2" is not the same test as a
 * dot labelled with someone you know, because the thing being measured is
 * whether people trust a stale position — and trust attaches to a person.
 *
 * Tracks are authored in kilometres east/north of ORIGIN (the Wonnangatta
 * Station flat) and converted to lat/lon, because reasoning about a walking
 * route in kilometres is far easier than in decimal degrees.
 */
import { fromLocalKm, type LocalKm } from './terrain'
import type { LatLon } from '@/lib/geo'

/*
 * Identity colours are deliberately kept out of the green/amber/orange/red
 * staleness ramp. A green mate dot reads as "fresh" and an amber one as
 * "ageing" before anyone has looked at the age cue at all, which would corrupt
 * the comparison between the three staleness treatments.
 */
export interface MateSeed {
  id: string
  name: string
  colour: string
  /** Waypoints of a plausible route, in km east/north of ORIGIN. */
  route: LocalKm[]
  /** Where along the route they start, as a fraction of total length. */
  startFraction: number
  activity: 'moving' | 'stationary'
  batteryPct: number
}

export const YOU_ID = 'you'
export const YOU_NAME = 'Mike'

/** Camp, and where your own position starts. */
export const CAMP: LatLon = fromLocalKm({ east: 0, north: 0 })

export const MATE_SEEDS: MateSeed[] = [
  {
    id: 'ben',
    name: 'Ben',
    colour: '#7ab8ff',
    // Up the river west, then climbing the spur onto the northern tops.
    route: [
      { east: -0.2, north: 0.1 },
      { east: -1.4, north: 0.5 },
      { east: -2.6, north: 0.4 },
      { east: -3.4, north: 1.2 },
      { east: -3.9, north: 2.4 },
      { east: -4.2, north: 3.6 },
    ],
    startFraction: 0.15,
    activity: 'moving',
    batteryPct: 82,
  },
  {
    id: 'marshy',
    name: 'Marshy',
    colour: '#c58cff',
    // South-east, climbing hard onto the high ridge and sidling along it.
    route: [
      { east: 0.4, north: -0.3 },
      { east: 1.3, north: -1.2 },
      { east: 2.2, north: -2.1 },
      { east: 3.4, north: -2.6 },
      { east: 4.6, north: -2.9 },
      { east: 5.6, north: -3.4 },
    ],
    startFraction: 0.3,
    activity: 'moving',
    batteryPct: 64,
  },
  {
    id: 'rod',
    name: 'Rod',
    colour: '#ff8fb1',
    // Stays low, east along the river flats, glassing the far faces.
    route: [
      { east: 0.5, north: 0.2 },
      { east: 1.7, north: -0.1 },
      { east: 2.9, north: 0.3 },
      { east: 4.0, north: 0.1 },
      { east: 5.2, north: -0.2 },
    ],
    startFraction: 0.45,
    activity: 'stationary',
    batteryPct: 38,
  },
]

/** The relay node, parked high where it can hear into the valley. */
export const RELAY = {
  id: 'relay',
  name: 'Relay',
  position: fromLocalKm({ east: 0.9, north: 2.2 }),
} as const

export function routeToLatLon(route: LocalKm[]): LatLon[] {
  return route.map(fromLocalKm)
}
