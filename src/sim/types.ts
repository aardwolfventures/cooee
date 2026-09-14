import type { LatLon } from '@/lib/geo'

export type Transport = 'mesh' | 'cellular'

/** What a mate's node is doing, independent of whether we can hear it. */
export type MateActivity = 'moving' | 'stationary' | 'silent'

export type StalenessTreatment = 'label' | 'fade' | 'halo'

/**
 * A single position report.
 *
 * `capturedAt` and `receivedAt` are deliberately separate and must stay that
 * way. Their divergence is the whole problem off-grid tracking has, and a data
 * model that collapses them cannot show it.
 */
export interface Fix {
  id: string
  mateId: string
  position: LatLon
  altitudeM: number
  speedMps: number
  headingDeg: number
  capturedAt: number
  receivedAt: number
  transport: Transport
  nodeBatteryPct: number
}

export interface Mate {
  id: string
  name: string
  fullName: string
  tag: string
  colour: string
  /** Ground truth. The UI must never read this — only delivered fixes. */
  truePosition: LatLon
  trueAltitudeM: number
  trueSpeedMps: number
  trueHeadingDeg: number
  activity: MateActivity
  transport: Transport
  nodeBatteryPct: number
  /** Distance walked along this mate's track, in metres. */
  trackDistanceM: number
  /** Most recent fix we have actually received, by capture time. */
  lastFix: Fix | null
  /** Fixes received but discarded because a newer capture had already landed. */
  supersededFixes: number
  nextReportAt: number
}

export interface SimSettings {
  reportIntervalSec: number
  packetLossPct: number
  jitterEnabled: boolean
  outOfOrderEnabled: boolean
  relayUp: boolean
  defaultTransport: Transport
  transportOverrides: Record<string, Transport | undefined>
  stalenessTreatment: StalenessTreatment
}

export type MessageState = 'sending' | 'delivered' | 'unacknowledged'

/**
 * Which conversation a message belongs to.
 *
 * `GROUP_THREAD` is the one thread everybody is in. Any other value is a mate
 * id, and means a private thread between you and that mate — there are no
 * private threads that do not include you, because this is your phone and it
 * can only ever show what it has actually received.
 */
export const GROUP_THREAD = 'everyone'

export type ThreadId = string

export interface Message {
  id: string
  threadId: ThreadId
  authorId: string
  text: string
  sentAt: number
  state: MessageState
  deliveredAt: number | null
}

export function isPrivateThread(threadId: ThreadId): boolean {
  return threadId !== GROUP_THREAD
}

export interface ScenarioEvent {
  atSec: number
  apply: string
}
