/**
 * How a report gets from a node to this phone — or fails to.
 *
 * Mesh and cellular are modelled as interchangeable sources behind one
 * interface. That is not tidiness for its own sake: the brief expects the real
 * transport abstraction to fall out of this prototype, so the seam is drawn
 * here rather than bolted on later.
 */
import type { Transport } from './types'

export interface LinkConditions {
  packetLossPct: number
  jitterEnabled: boolean
  relayUp: boolean
}

export interface DeliveryPlan {
  lost: boolean
  latencyMs: number
}

/** Mesh traffic reaches us via the relay. No relay, no mesh. */
export function meshReachable(conditions: LinkConditions): boolean {
  return conditions.relayUp
}

/**
 * Cellular loses far less than mesh. The single loss control still drives it,
 * scaled down, so dragging the slider degrades everything — just not equally.
 */
const CELLULAR_LOSS_FACTOR = 0.15

export function planDelivery(
  transport: Transport,
  conditions: LinkConditions,
  random: () => number,
): DeliveryPlan {
  if (transport === 'mesh' && !meshReachable(conditions)) {
    return { lost: true, latencyMs: 0 }
  }

  const lossPct =
    transport === 'mesh'
      ? conditions.packetLossPct
      : conditions.packetLossPct * CELLULAR_LOSS_FACTOR

  if (random() * 100 < lossPct) {
    return { lost: true, latencyMs: 0 }
  }

  const baseMs = transport === 'mesh' ? 8_000 : 1_500
  if (!conditions.jitterEnabled) {
    return { lost: false, latencyMs: baseMs }
  }

  // Long tail: most packets are prompt, some are dismally late. A uniform
  // jitter would never produce the fix that turns up four minutes stale, and
  // that fix is exactly what the staleness treatment has to survive.
  const spreadMs = transport === 'mesh' ? 110_000 : 4_000
  const tail = random() ** 2.2
  return { lost: false, latencyMs: baseMs + tail * spreadMs }
}
