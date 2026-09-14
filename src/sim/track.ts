/**
 * Walking a polyline route at a slope-aware pace.
 *
 * A random walk would have been less work and would have looked wrong
 * immediately: people follow spurs, rivers and saddles. Routes are authored,
 * and pace comes from the terrain, so a mate slows climbing out of a gully.
 */
import { metresBetween, bearingBetween, interpolate, toblerSpeedMps, type LatLon } from '@/lib/geo'
import { elevationAt } from './terrain'

export interface TrackPose {
  position: LatLon
  headingDeg: number
  altitudeM: number
}

export class Track {
  private readonly waypoints: LatLon[]
  private readonly cumulative: number[]
  readonly totalM: number

  constructor(waypoints: LatLon[]) {
    if (waypoints.length < 2) {
      throw new Error('a track needs at least two waypoints')
    }
    this.waypoints = waypoints
    this.cumulative = [0]
    let running = 0
    for (let i = 1; i < waypoints.length; i += 1) {
      running += metresBetween(waypoints[i - 1]!, waypoints[i]!)
      this.cumulative.push(running)
    }
    this.totalM = running
  }

  /**
   * Pose at a distance along the route. Distance beyond the end folds back on
   * itself, so a mate turns around and walks home rather than teleporting to
   * the start.
   */
  poseAt(distanceM: number): TrackPose {
    const folded = this.fold(distanceM)
    const { index, t, reversed } = this.locate(folded)
    const a = this.waypoints[index]!
    const b = this.waypoints[index + 1]!
    const position = interpolate(a, b, t)
    const heading = reversed ? (bearingBetween(b, a) + 360) % 360 : bearingBetween(a, b)
    return { position, headingDeg: heading, altitudeM: elevationAt(position) }
  }

  /** Ground speed at a distance along the route, metres per second. */
  speedAt(distanceM: number): number {
    const here = this.poseAt(distanceM)
    const ahead = this.poseAt(distanceM + 25)
    const run = Math.max(metresBetween(here.position, ahead.position), 1)
    const rise = ahead.altitudeM - here.altitudeM
    return toblerSpeedMps(rise / run)
  }

  private fold(distanceM: number): number {
    if (this.totalM === 0) {
      return 0
    }
    const cycle = this.totalM * 2
    const wrapped = ((distanceM % cycle) + cycle) % cycle
    return wrapped <= this.totalM ? wrapped : cycle - wrapped
  }

  private locate(distanceM: number): { index: number; t: number; reversed: boolean } {
    const clamped = Math.min(Math.max(distanceM, 0), this.totalM)
    for (let i = 1; i < this.cumulative.length; i += 1) {
      const start = this.cumulative[i - 1]!
      const end = this.cumulative[i]!
      if (clamped <= end || i === this.cumulative.length - 1) {
        const span = end - start
        return { index: i - 1, t: span === 0 ? 0 : (clamped - start) / span, reversed: false }
      }
    }
    return { index: 0, t: 0, reversed: false }
  }
}
