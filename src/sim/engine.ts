/**
 * The simulation engine.
 *
 * Everything else in the app is a view onto this. Nothing in the UI may read a
 * mate's `truePosition`: the UI only ever sees fixes that have actually been
 * delivered, which is the only way the prototype can be honest about what the
 * user does and does not know.
 */
import { metresBetween, bearingBetween, type LatLon } from '@/lib/geo'
import { elevationAt } from './terrain'
import { makeRng } from './rng'
import { Track } from './track'
import { planDelivery, type LinkConditions } from './transport'
import { CAMP, MATE_SEEDS, YOU_ID, routeToLatLon } from './mates'
import type { Fix, Mate, Message, MessageState, SimSettings, Transport } from './types'

/** Sim clock origin. Rendered with UTC getters so it reads the same anywhere. */
export const START_EPOCH_MS = Date.UTC(2026, 8, 14, 6, 40)

interface PendingFix {
  fix: Fix
  deliverAt: number
}

interface PendingMessage {
  messageId: string
  deliverAt: number
  outcome: MessageState
}

interface ScheduledEvent {
  atMs: number
  run: () => void
}

export const MESH_DEFAULTS: SimSettings = {
  // The uncomfortable case is the normal case. Opening on perfect ten-second
  // cellular updates would make everyone like it and teach us nothing.
  reportIntervalSec: 300,
  packetLossPct: 20,
  jitterEnabled: true,
  outOfOrderEnabled: true,
  relayUp: true,
  defaultTransport: 'mesh',
  transportOverrides: {},
  stalenessTreatment: 'label',
}

export const RELAY_HEARTBEAT_MS = 60_000

/** Missed heartbeats before the relay is treated as suspect, then as down. */
export const RELAY_SUSPECT_MS = 3 * RELAY_HEARTBEAT_MS
export const RELAY_DOWN_MS = 6 * RELAY_HEARTBEAT_MS

/**
 * Route geometry is static and is deliberately held outside the engine
 * instance: the store wraps the engine in a reactive proxy, and there is no
 * sense paying dependency-tracking costs on a polyline that never changes.
 */
const TRACKS = new Map<string, Track>(
  MATE_SEEDS.map((seed) => [seed.id, new Track(routeToLatLon(seed.route))]),
)

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

export class SimEngine {
  now = 0
  mates: Mate[] = []
  youPosition: LatLon = { ...CAMP }
  /**
   * Which way you are facing, in degrees from north.
   *
   * Simulated, like everything else here. On a real phone this would come off
   * the magnetometer; the build plan is clear that it has to, because course
   * over ground says nothing while you are standing still. For a prototype
   * whose job is to find out whether a facing cone helps at all, a plausible
   * heading tests the interaction exactly as well as a real one — the same
   * argument the brief makes for faking the terrain profile.
   */
  youHeadingDeg = 42
  youAltitudeM = elevationAt(CAMP)
  youTransport: Transport = 'mesh'
  settings: SimSettings = { ...MESH_DEFAULTS, transportOverrides: {} }
  messages: Message[] = []
  lastAnyReceivedAt: number | null = null
  convergeTargetId: string | null = null
  droppedFixes = 0
  /**
   * When we last heard the relay's own heartbeat. The app is never told the
   * relay is down — it can only infer it from silence, exactly as the real
   * thing would have to. That inference is what question 7 is testing.
   */
  lastRelayHeartbeatAt: number | null = null

  private pendingFixes: PendingFix[] = []
  private pendingMessages: PendingMessage[] = []
  private events: ScheduledEvent[] = []
  private lastScheduledArrival = new Map<string, number>()
  private nextReplyAt = 0
  private nextRelayHeartbeatAt = 0
  private random = makeRng(20260914)

  constructor() {
    this.reset()
  }

  reset(): void {
    this.now = 0
    this.pendingFixes = []
    this.pendingMessages = []
    this.events = []
    this.lastScheduledArrival.clear()
    this.messages = []
    this.lastAnyReceivedAt = null
    this.convergeTargetId = null
    this.droppedFixes = 0
    this.random = makeRng(20260914)
    this.youPosition = { ...CAMP }
    this.youAltitudeM = elevationAt(CAMP)
    this.youHeadingDeg = 42
    this.nextReplyAt = 150_000
    this.nextRelayHeartbeatAt = 0
    this.lastRelayHeartbeatAt = 0

    this.mates = MATE_SEEDS.map((seed) => {
      const track = TRACKS.get(seed.id)!
      const distance = track.totalM * seed.startFraction
      const pose = track.poseAt(distance)
      return {
        id: seed.id,
        name: seed.name,
        fullName: seed.fullName,
        tag: seed.tag,
        colour: seed.colour,
        truePosition: pose.position,
        trueAltitudeM: pose.altitudeM,
        trueSpeedMps: seed.activity === 'moving' ? track.speedAt(distance) : 0,
        trueHeadingDeg: pose.headingDeg,
        activity: seed.activity,
        transport: this.settings.defaultTransport,
        nodeBatteryPct: seed.batteryPct,
        trackDistanceM: distance,
        lastFix: null,
        supersededFixes: 0,
        nextReportAt: 0,
      }
    })

    // Seed one delivered fix each so the map is not blank on open. They are
    // backdated by a report interval, which is the honest starting state.
    for (const mate of this.mates) {
      const fix = this.captureFix(mate)
      fix.capturedAt = -this.settings.reportIntervalSec * 1000
      fix.receivedAt = 0
      mate.lastFix = fix
      mate.nextReportAt = this.settings.reportIntervalSec * 1000 * this.random()
    }
    this.lastAnyReceivedAt = 0
  }

  get conditions(): LinkConditions {
    return {
      packetLossPct: this.settings.packetLossPct,
      jitterEnabled: this.settings.jitterEnabled,
      relayUp: this.settings.relayUp,
    }
  }

  transportFor(mateId: string): Transport {
    return this.settings.transportOverrides[mateId] ?? this.settings.defaultTransport
  }

  mate(id: string): Mate | undefined {
    return this.mates.find((m) => m.id === id)
  }

  /** Advance the simulation. `dtMs` is simulated milliseconds, not real ones. */
  tick(dtMs: number): void {
    if (dtMs <= 0) {
      return
    }
    const target = this.now + dtMs
    // Step in bounded slices so a 300x clock cannot skip past a report.
    const sliceMs = 2_000
    while (this.now < target) {
      const step = Math.min(sliceMs, target - this.now)
      this.now += step
      this.runEvents()
      this.advanceMates(step)
      this.advanceYou(step)
      this.swayHeading(step)
      this.emitReports()
      this.emitRelayHeartbeat()
      this.deliver()
      this.maybeReply()
    }
  }

  private runEvents(): void {
    const due = this.events.filter((e) => e.atMs <= this.now)
    if (due.length === 0) {
      return
    }
    this.events = this.events.filter((e) => e.atMs > this.now)
    for (const event of due) {
      event.run()
    }
  }

  schedule(atMs: number, run: () => void): void {
    this.events.push({ atMs, run })
  }

  private advanceMates(stepMs: number): void {
    for (const mate of this.mates) {
      mate.transport = this.transportFor(mate.id)

      // Note the test is against 'stationary', not for 'moving'. A silent mate
      // is still walking — their radio stopped, their legs did not — and the
      // widening gap between the frozen dot and where they actually are is the
      // entire hazard that scenario 3 exists to put in front of people.
      if (mate.activity !== 'stationary') {
        const track = TRACKS.get(mate.id)!
        const speed = track.speedAt(mate.trackDistanceM)
        mate.trackDistanceM += speed * (stepMs / 1000)
        const pose = track.poseAt(mate.trackDistanceM)
        mate.truePosition = pose.position
        mate.trueAltitudeM = pose.altitudeM
        mate.trueHeadingDeg = pose.headingDeg
        mate.trueSpeedMps = speed
      } else {
        mate.trueSpeedMps = 0
      }

      // Mesh nodes work harder and drain faster, more so at short intervals.
      const hoursElapsed = stepMs / 3_600_000
      const drainPerHour = mate.transport === 'mesh' ? 3.2 : 1.6
      const intervalPenalty = Math.min(2, 300 / Math.max(this.settings.reportIntervalSec, 10))
      mate.nodeBatteryPct = Math.max(
        0,
        mate.nodeBatteryPct - drainPerHour * intervalPenalty * hoursElapsed,
      )
    }
  }

  /**
   * Standing still, you still turn: glassing a face, checking a spur, looking
   * back at camp. A cone frozen dead still would read as a broken instrument
   * rather than a compass, so it drifts gently when you are not walking.
   */
  private swayHeading(stepMs: number): void {
    if (this.convergeTargetId !== null) {
      return
    }
    this.youHeadingDeg = (this.youHeadingDeg + 0.9 * Math.sin(this.now / 9_000) * (stepMs / 1000) + 360) % 360
  }

  /** Scenario 5: you walk toward the mate you selected. */
  private advanceYou(stepMs: number): void {
    if (this.convergeTargetId === null) {
      return
    }
    const target = this.mate(this.convergeTargetId)
    const aim = target?.lastFix?.position
    if (aim === undefined) {
      return
    }
    const remaining = metresBetween(this.youPosition, aim)
    if (remaining < 30) {
      return
    }
    const stepM = 1.25 * (stepMs / 1000)
    const t = Math.min(1, stepM / remaining)
    const next = {
      lat: this.youPosition.lat + (aim.lat - this.youPosition.lat) * t,
      lon: this.youPosition.lon + (aim.lon - this.youPosition.lon) * t,
    }
    // Walking, so you are facing where you are going.
    this.youHeadingDeg = bearingBetween(this.youPosition, next)
    this.youPosition = next
    this.youAltitudeM = elevationAt(this.youPosition)
  }

  private captureFix(mate: Mate): Fix {
    return {
      id: nextId('fix'),
      mateId: mate.id,
      position: { ...mate.truePosition },
      altitudeM: mate.trueAltitudeM,
      speedMps: mate.trueSpeedMps,
      headingDeg: mate.trueHeadingDeg,
      capturedAt: this.now,
      receivedAt: this.now,
      transport: mate.transport,
      nodeBatteryPct: Math.round(mate.nodeBatteryPct),
    }
  }

  private intervalMsFor(mateId: string): number {
    // Converging boosts both ends' reporting rate, which is the behaviour
    // scenario 5 exists to test.
    if (this.convergeTargetId === mateId) {
      return 30_000
    }
    return this.settings.reportIntervalSec * 1000
  }

  private emitReports(): void {
    for (const mate of this.mates) {
      if (mate.activity === 'silent') {
        continue
      }
      if (this.now < mate.nextReportAt) {
        continue
      }
      const interval = this.intervalMsFor(mate.id)
      // A little dither stops every node reporting on the same beat.
      mate.nextReportAt = this.now + interval * (0.85 + this.random() * 0.3)

      const fix = this.captureFix(mate)
      const plan = planDelivery(mate.transport, this.conditions, this.random)
      if (plan.lost) {
        this.droppedFixes += 1
        continue
      }

      let deliverAt = this.now + plan.latencyMs
      if (!this.settings.outOfOrderEnabled) {
        const previous = this.lastScheduledArrival.get(mate.id) ?? 0
        deliverAt = Math.max(deliverAt, previous + 1)
      }
      this.lastScheduledArrival.set(mate.id, deliverAt)
      this.pendingFixes.push({ fix, deliverAt })
    }
  }

  private deliver(): void {
    if (this.pendingFixes.length === 0) {
      return
    }
    const due = this.pendingFixes.filter((p) => p.deliverAt <= this.now)
    if (due.length === 0) {
      return
    }
    this.pendingFixes = this.pendingFixes.filter((p) => p.deliverAt > this.now)

    for (const pending of due) {
      const mate = this.mate(pending.fix.mateId)
      if (mate === undefined) {
        continue
      }
      pending.fix.receivedAt = pending.deliverAt
      this.lastAnyReceivedAt = Math.max(this.lastAnyReceivedAt ?? 0, pending.deliverAt)

      // A fix that arrives after a newer one is not an update. Taking the
      // latest *received* rather than the latest *captured* would make the dot
      // jump backwards, which is the classic bug this model exists to expose.
      if (mate.lastFix !== null && pending.fix.capturedAt <= mate.lastFix.capturedAt) {
        mate.supersededFixes += 1
        continue
      }
      mate.lastFix = pending.fix
    }
  }

  // --- Messages ------------------------------------------------------------

  send(text: string): Message {
    const message: Message = {
      id: nextId('msg'),
      authorId: YOU_ID,
      text,
      sentAt: this.now,
      state: 'sending',
      deliveredAt: null,
    }
    this.messages.push(message)

    const plan = planDelivery(this.youTransport, this.conditions, this.random)
    if (plan.lost) {
      // No ack ever comes. The message sits unacknowledged, which is exactly
      // the state the brief wants people's reaction to.
      this.pendingMessages.push({
        messageId: message.id,
        deliverAt: this.now + 45_000,
        outcome: 'unacknowledged',
      })
    } else {
      this.pendingMessages.push({
        messageId: message.id,
        deliverAt: this.now + plan.latencyMs,
        outcome: 'delivered',
      })
    }
    return message
  }

  private maybeReply(): void {
    this.resolveMessages()
    if (this.now < this.nextReplyAt) {
      return
    }
    this.nextReplyAt = this.now + 120_000 + this.random() * 180_000

    const speakers = this.mates.filter((m) => m.activity !== 'silent')
    if (speakers.length === 0) {
      return
    }
    const speaker = speakers[Math.floor(this.random() * speakers.length)]!
    const plan = planDelivery(speaker.transport, this.conditions, this.random)
    if (plan.lost) {
      return
    }
    const text = MATE_REPLIES[Math.floor(this.random() * MATE_REPLIES.length)]!
    const message: Message = {
      id: nextId('msg'),
      authorId: speaker.id,
      text,
      sentAt: this.now,
      state: 'sending',
      deliveredAt: null,
    }
    this.messages.push(message)
    this.pendingMessages.push({
      messageId: message.id,
      deliverAt: this.now + plan.latencyMs,
      outcome: 'delivered',
    })
  }

  private resolveMessages(): void {
    if (this.pendingMessages.length === 0) {
      return
    }
    const due = this.pendingMessages.filter((p) => p.deliverAt <= this.now)
    if (due.length === 0) {
      return
    }
    this.pendingMessages = this.pendingMessages.filter((p) => p.deliverAt > this.now)
    for (const pending of due) {
      const message = this.messages.find((m) => m.id === pending.messageId)
      if (message === undefined) {
        continue
      }
      message.state = pending.outcome
      message.deliveredAt = pending.outcome === 'delivered' ? pending.deliverAt : null
    }
  }

  /**
   * The relay reports its own health on a short cycle. Losing the occasional
   * heartbeat is normal; losing several in a row is the signal.
   */
  private emitRelayHeartbeat(): void {
    if (this.now < this.nextRelayHeartbeatAt) {
      return
    }
    this.nextRelayHeartbeatAt = this.now + RELAY_HEARTBEAT_MS
    if (!this.settings.relayUp) {
      return
    }
    const plan = planDelivery('mesh', this.conditions, this.random)
    if (plan.lost) {
      return
    }
    const heardAt = this.now + plan.latencyMs
    this.schedule(heardAt, () => {
      this.lastRelayHeartbeatAt = Math.max(this.lastRelayHeartbeatAt ?? 0, heardAt)
    })
  }

  // --- Scenario helpers ---------------------------------------------------

  /** Drop a mate at a fraction along their route and re-derive their pose. */
  placeAlongTrack(mateId: string, fraction: number): void {
    const mate = this.mate(mateId)
    const track = TRACKS.get(mateId)
    if (mate === undefined || track === undefined) {
      return
    }
    mate.trackDistanceM = track.totalM * fraction
    const pose = track.poseAt(mate.trackDistanceM)
    mate.truePosition = pose.position
    mate.trueAltitudeM = pose.altitudeM
    mate.trueHeadingDeg = pose.headingDeg
    mate.trueSpeedMps = mate.activity === 'moving' ? track.speedAt(mate.trackDistanceM) : 0
  }

  /** Replace a mate's last known fix with one captured `ageMs` ago. */
  seedLastFix(mateId: string, ageMs: number): void {
    const mate = this.mate(mateId)
    if (mate === undefined) {
      return
    }
    const fix = this.captureFix(mate)
    fix.capturedAt = this.now - ageMs
    fix.receivedAt = this.now - ageMs + 8_000
    mate.lastFix = fix
  }

  /** Forget everything in flight, e.g. when a scenario rewrites the world. */
  clearInFlight(): void {
    this.pendingFixes = []
    this.lastScheduledArrival.clear()
    this.events = []
  }

  // --- Derived readings ----------------------------------------------------

  bearingTo(mate: Mate): number | null {
    const fix = mate.lastFix
    return fix === null ? null : bearingBetween(this.youPosition, fix.position)
  }

  distanceTo(mate: Mate): number | null {
    const fix = mate.lastFix
    return fix === null ? null : metresBetween(this.youPosition, fix.position)
  }
}

export const MATE_REPLIES = [
  'on the ridge',
  'heading back',
  'nothing yet',
  'got one',
  'at the truck',
  'hold fire',
  'sitting tight for a bit',
] as const
