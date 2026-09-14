/**
 * The party: Mike behind the phone, with Ben, Marshy, Rod, Derrick, Sahil and
 * Dan out in front.
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
  /**
   * The letter(s) on the dot. Explicit rather than derived: Derrick Cruz and
   * Dan Galea share a first initial, so they take first-and-surname initials
   * while everyone else keeps a single letter. Two dots both reading "D" would
   * be worse than no letter at all. At six mates colour cannot carry identity
   * on its own either — the dot letters and the name labels do the work, and
   * the colour is a shortcut.
   */
  tag: string
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
    tag: 'B',
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
    tag: 'M',
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
    tag: 'R',
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
  {
    id: 'derrick',
    name: 'Derrick',
    tag: 'DC',
    colour: '#4dd0e1',
    // North-east through the timber, working the heads of the gullies.
    route: [
      { east: 0.3, north: 0.5 },
      { east: 1.1, north: 1.6 },
      { east: 1.6, north: 2.8 },
      { east: 2.6, north: 3.5 },
      { east: 3.8, north: 3.9 },
      { east: 4.9, north: 4.4 },
    ],
    startFraction: 0.2,
    activity: 'moving',
    batteryPct: 91,
  },
  {
    id: 'sahil',
    name: 'Sahil',
    tag: 'S',
    colour: '#b0bec5',
    // South-west, down-valley then up onto the shaded southern faces.
    route: [
      { east: -0.4, north: -0.4 },
      { east: -1.5, north: -1.1 },
      { east: -2.4, north: -1.9 },
      { east: -3.1, north: -2.9 },
      { east: -4.0, north: -3.6 },
    ],
    startFraction: 0.25,
    activity: 'moving',
    batteryPct: 57,
  },
  {
    id: 'dan',
    name: 'Dan',
    tag: 'DG',
    colour: '#8a92e8',
    // Due north up the side creek to the saddle, then sitting on it.
    route: [
      { east: -0.6, north: 0.8 },
      { east: -0.9, north: 1.9 },
      { east: -1.1, north: 3.0 },
      { east: -1.4, north: 4.1 },
    ],
    startFraction: 0.35,
    activity: 'moving',
    batteryPct: 73,
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
