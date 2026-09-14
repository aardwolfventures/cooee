/**
 * The party: Mike Hill behind the phone, with Ben Lake, Paul "Marshy" Marsh,
 * Rod Miller, Derrick Cruz, Sahil Prasad and Dan Galea out in front.
 *
 * `name` is what everyone actually gets called and is what the map shows;
 * `fullName` is for the detail screen, where there is room for it.
 *
 * Real names, deliberately. A dot labelled "Mate 2" is not the same test as a
 * dot labelled with someone you know, because the thing being measured is
 * whether people trust a stale position — and trust attaches to a person.
 *
 * Tracks are authored in kilometres east/north of ORIGIN (the camp in Vulcan
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
  /** First name or nickname. What goes on the map, where space is scarce. */
  name: string
  /** Full name, for the detail screen where there is room for it. */
  fullName: string
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
export const YOU_FULL_NAME = 'Mike Hill'

/** Camp, and where your own position starts. */
export const CAMP: LatLon = fromLocalKm({ east: 0, north: 0 })

export const MATE_SEEDS: MateSeed[] = [
  {
    id: 'ben',
    name: 'Ben',
    fullName: 'Ben Lake',
    tag: 'B',
    colour: '#7ab8ff',
    // North up the spur between Poplar Road and Willow Springs, onto the tops.
    route: [
      { east: 0.00, north: 0.00 },
      { east: 0.15, north: 0.52 },
      { east: 0.25, north: 0.86 },
      { east: 0.28, north: 1.39 },
      { east: 0.39, north: 1.73 },
      { east: 0.53, north: 2.25 },
      { east: 0.72, north: 2.75 },
      { east: 0.76, north: 3.11 },
      { east: 0.80, north: 3.63 },
    ],
    startFraction: 0.15,
    activity: 'moving',
    batteryPct: 82,
  },
  {
    id: 'marshy',
    name: 'Marshy',
    fullName: 'Paul Marsh',
    tag: 'M',
    colour: '#c58cff',
    // South-east along the ridge toward Retreat River, sidling the high side.
    route: [
      { east: 0.00, north: 0.00 },
      { east: 0.42, north: -0.33 },
      { east: 0.71, north: -0.55 },
      { east: 1.23, north: -0.61 },
      { east: 1.51, north: -0.81 },
      { east: 1.97, north: -1.09 },
      { east: 2.41, north: -1.34 },
      { east: 2.69, north: -1.56 },
      { east: 3.16, north: -1.81 },
    ],
    startFraction: 0.3,
    activity: 'moving',
    batteryPct: 64,
  },
  {
    id: 'rod',
    name: 'Rod',
    fullName: 'Rod Miller',
    tag: 'R',
    colour: '#ff8fb1',
    // Due east, staying low along the drainage under Forest Link.
    route: [
      { east: 0.00, north: 0.00 },
      { east: 0.54, north: -0.05 },
      { east: 0.90, north: -0.03 },
      { east: 1.42, north: 0.01 },
      { east: 1.77, north: -0.02 },
      { east: 2.30, north: -0.11 },
      { east: 2.82, north: -0.13 },
      { east: 3.16, north: -0.05 },
      { east: 3.69, north: -0.08 },
    ],
    startFraction: 0.45,
    activity: 'stationary',
    batteryPct: 38,
  },
  {
    id: 'derrick',
    name: 'Derrick',
    fullName: 'Derrick Cruz',
    tag: 'DC',
    colour: '#4dd0e1',
    // North-east onto the Old Mill Road ridge, working the head of the gullies.
    route: [
      { east: 0.00, north: 0.00 },
      { east: 0.20, north: 0.50 },
      { east: 0.29, north: 0.84 },
      { east: 0.76, north: 1.11 },
      { east: 0.94, north: 1.42 },
      { east: 1.40, north: 1.68 },
      { east: 1.84, north: 1.98 },
      { east: 2.13, north: 2.18 },
      { east: 2.62, north: 2.42 },
    ],
    startFraction: 0.2,
    activity: 'moving',
    batteryPct: 91,
  },
  {
    id: 'sahil',
    name: 'Sahil',
    fullName: 'Sahil Prasad',
    tag: 'S',
    colour: '#b0bec5',
    // South-west down the gully past Claremont, toward Swatchfield.
    route: [
      { east: 0.00, north: 0.00 },
      { east: -0.29, north: -0.44 },
      { east: -0.47, north: -0.75 },
      { east: -0.70, north: -1.24 },
      { east: -0.82, north: -1.58 },
      { east: -1.00, north: -2.08 },
      { east: -1.20, north: -2.58 },
      { east: -1.35, north: -2.91 },
      { east: -1.56, north: -3.40 },
    ],
    startFraction: 0.25,
    activity: 'moving',
    batteryPct: 57,
  },
  {
    id: 'dan',
    name: 'Dan',
    fullName: 'Dan Galea',
    tag: 'DG',
    colour: '#8a92e8',
    // South along the spur above Cooks Creek, holding the high ground.
    route: [
      { east: 0.00, north: 0.00 },
      { east: 0.06, north: -0.53 },
      { east: 0.11, north: -0.88 },
      { east: 0.25, north: -1.40 },
      { east: 0.36, north: -1.74 },
      { east: 0.50, north: -2.27 },
      { east: 0.64, north: -2.79 },
      { east: 0.73, north: -3.13 },
      { east: 0.76, north: -3.66 },
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
  // The prominent knoll 2 km south-west of camp: about 1260 m, standing ~26 m
  // over everything within 600 m of it. Antenna height beats transmit power, so
  // where the relay sits is the single most consequential thing in the mesh.
  position: fromLocalKm({ east: -0.8, north: -1.8 }),
} as const

export function routeToLatLon(route: LocalKm[]): LatLon[] {
  return route.map(fromLocalKm)
}
