/**
 * Slope-adjusted walk time.
 *
 * Straight-line distance is actively misleading in this country: 1.2 km can be
 * ten minutes along the flat or an hour and a half out of a gully and back up
 * the other side. The brief asks whether showing the real number changes what
 * people decide to do, so it has to be the real number.
 */
import { toblerSpeedMps } from './geo'
import { profileBetween } from '@/sim/terrain'
import type { LatLon } from './geo'

export interface WalkEstimate {
  seconds: number
  ascentM: number
  descentM: number
  straightLineM: number
}

export function estimateWalk(from: LatLon, to: LatLon): WalkEstimate {
  const samples = profileBetween(from, to, 80)
  let seconds = 0
  let ascentM = 0
  let descentM = 0

  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1]!
    const b = samples[i]!
    const run = b.distanceM - a.distanceM
    if (run <= 0) {
      continue
    }
    const rise = b.elevationM - a.elevationM
    if (rise > 0) {
      ascentM += rise
    } else {
      descentM -= rise
    }
    seconds += run / toblerSpeedMps(rise / run)
  }

  const straightLineM = samples[samples.length - 1]?.distanceM ?? 0
  // A crude allowance for scrub, deadfall and picking a line. Without it the
  // estimate reads optimistically, and an optimistic walk time is a hazard.
  return { seconds: seconds * 1.25, ascentM, descentM, straightLineM }
}
