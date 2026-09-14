import { computed, reactive, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { SimEngine, RELAY_DOWN_MS, RELAY_SUSPECT_MS } from '@/sim/engine'
import { SCENARIOS, scenarioById, type ScenarioId } from '@/sim/scenarios'
import { STALENESS_THRESHOLDS_MS, bucketFor, type StalenessBucket } from '@/lib/staleness'
import { estimateWalk, type WalkEstimate } from '@/lib/walk'
import { compassPoint } from '@/lib/geo'
import { DEFAULT_YOU_NAME, YOU_ID } from '@/sim/mates'
import { clearName, loadName, matchingMateId, normaliseName, saveName } from '@/sim/identity'
import { GROUP_THREAD, type ThreadId } from '@/sim/types'
import type { Mate, Message, StalenessTreatment, Transport } from '@/sim/types'

export type ClockSpeed = 1 | 10 | 60 | 300
export type RelayHealth = 'up' | 'suspect' | 'down'

/** A mate as the UI is allowed to see them: only ever via a delivered fix. */
export interface MateView {
  mate: Mate
  ageMs: number | null
  bucket: StalenessBucket
  distanceM: number | null
  /** Direction from you to them. */
  bearingDeg: number | null
  compass: string
  /**
   * The direction they were travelling when the fix was taken — their course,
   * not a bearing to them, and not their heading now. Null when they were not
   * moving, or when the fix is too old for it to mean anything.
   */
  courseDeg: number | null
  transport: Transport
  batteryPct: number
}

/**
 * How long a message stays in a bubble over its sender's dot.
 *
 * Long enough to catch on a glance, short enough that six mates do not bury
 * the map in speech. Like the staleness thresholds, this is a guess meant to
 * be argued with after a test round.
 */
export const MESSAGE_BUBBLE_MS = 5 * 60_000

/**
 * Below this, "moving" is GPS noise rather than a person walking, and a course
 * arrow drawn from it would spin at random.
 */
const MOVING_MPS = 0.3

/**
 * A course arrow is dropped once the fix passes this age. A stale dot is
 * already a problem; a stale arrow is a worse one, because an arrow is
 * inherently present tense — it says "they are heading that way" about
 * information that may be twenty minutes old.
 */
const COURSE_MAX_AGE_MS = STALENESS_THRESHOLDS_MS.recent

export const useSimStore = defineStore('sim', () => {
  const engine = reactive(new SimEngine()) as SimEngine

  const playing = ref(true)
  const speed = ref<ClockSpeed>(10)
  const activeScenarioId = ref<ScenarioId>('spread')
  const selectedMateId = ref<string | null>(null)
  /**
   * Which conversation is open over the map, if any. There is no messages
   * screen any more: the group thread is a button on the map and a private one
   * is reached through the mate you want, so a thread is always something you
   * opened on purpose and can drop straight back out of.
   */
  const openThreadId = ref<ThreadId | null>(null)
  const devPanelOpen = ref(false)
  /**
   * How strongly the Forestry sheet reads over the shaded relief. The build
   * plan asks for this wherever an imported map is laid over a topo base: the
   * sheet's flat zoning fills hide the landform, and being able to dial it back
   * is how you see both at once.
   */
  const sheetOpacity = ref(0.85)
  const frame = shallowRef(0)

  // --- Who is holding the phone -------------------------------------------

  const storedName = loadName()
  const youName = ref(storedName ?? DEFAULT_YOU_NAME)
  /** Nothing is shown until this is answered — see `NamePrompt.vue`. */
  const askingName = ref(storedName === null)

  /**
   * Take a name and, if it belongs to somebody in the party, take them out of
   * it. Rebuilding the world is the honest way to do that: the party is
   * constructed in `reset`, and a mate spliced out afterwards would leave
   * their fixes in flight and their messages in the threads.
   */
  function setIdentity(raw: string): void {
    const name = normaliseName(raw)
    if (name.length === 0) {
      return
    }
    youName.value = name
    saveName(name)
    askingName.value = false
    engine.excludedMateId = matchingMateId(name)
    engine.reset()
    readAt.clear()
    openThreadId.value = null
    selectedMateId.value = null
    applyScenario(activeScenarioId.value)
  }

  /** Ask again. Reached from the dev panel, for handing one phone around. */
  function forgetIdentity(): void {
    clearName()
    askingName.value = true
  }

  // --- Clock ---------------------------------------------------------------

  let rafHandle = 0
  let lastRealMs = 0

  function loop(realMs: number): void {
    rafHandle = requestAnimationFrame(loop)
    if (lastRealMs === 0) {
      lastRealMs = realMs
      return
    }
    const dtReal = Math.min(realMs - lastRealMs, 250)
    lastRealMs = realMs
    if (!playing.value) {
      return
    }
    engine.tick(dtReal * speed.value)
    // Whatever thread is on screen is being looked at, so nothing in it is
    // unread. Doing this centrally means no view can forget to and leave a
    // stale badge sitting on a dot you are already reading.
    const reading = readingThreadId.value
    if (reading !== null) {
      markRead(reading)
    }
    frame.value += 1
  }

  function start(): void {
    if (rafHandle !== 0) {
      return
    }
    lastRealMs = 0
    rafHandle = requestAnimationFrame(loop)
  }

  function stop(): void {
    if (rafHandle !== 0) {
      cancelAnimationFrame(rafHandle)
      rafHandle = 0
    }
  }

  function togglePlay(): void {
    playing.value = !playing.value
    lastRealMs = 0
  }

  function setSpeed(next: ClockSpeed): void {
    speed.value = next
  }

  // --- Scenarios -----------------------------------------------------------

  function applyScenario(id: ScenarioId): void {
    const scenario = scenarioById(id)
    if (scenario === undefined) {
      return
    }
    scenario.apply(engine)
    activeScenarioId.value = id
    if (id !== 'converging') {
      selectedMateId.value = null
    } else {
      selectedMateId.value = engine.convergeTargetId
    }
  }

  function resetAll(): void {
    engine.reset()
    applyScenario('spread')
    playing.value = true
  }

  // --- Views ---------------------------------------------------------------

  const mateViews = computed<MateView[]>(() => {
    void frame.value
    return engine.mates.map((mate) => {
      const fix = mate.lastFix
      const ageMs = fix === null ? null : Math.max(0, engine.now - fix.capturedAt)
      const distanceM = engine.distanceTo(mate)
      const bearingDeg = engine.bearingTo(mate)
      // Straight off the delivered fix. Never `mate.trueHeadingDeg`: that is
      // ground truth, and reading it would make the arrow current even when
      // the dot under it is not.
      const moving = fix !== null && fix.speedMps > MOVING_MPS
      const courseFresh = ageMs !== null && ageMs <= COURSE_MAX_AGE_MS
      return {
        mate,
        ageMs,
        bucket: bucketFor(ageMs ?? Number.POSITIVE_INFINITY),
        distanceM,
        bearingDeg,
        compass: bearingDeg === null ? '—' : compassPoint(bearingDeg),
        courseDeg: fix !== null && moving && courseFresh ? fix.headingDeg : null,
        transport: mate.transport,
        batteryPct: fix?.nodeBatteryPct ?? Math.round(mate.nodeBatteryPct),
      }
    })
  })

  /**
   * The latest thing each person said **to everyone**, while it is still
   * recent enough to sit over their dot. Keyed by author, so six mates give at
   * most six bubbles.
   *
   * Private messages deliberately do not appear here. A bubble is a public
   * thing — it hangs over a dot in plain view — and a thread someone opened
   * with you alone should not be readable at a glance by whoever is looking
   * over your shoulder. They announce themselves with a count on the dot
   * instead, and whether that is enough of a cue is the thing being tested.
   */
  const bubbleByAuthor = computed<Map<string, Message>>(() => {
    void frame.value
    const out = new Map<string, Message>()
    for (const message of engine.messages) {
      if (message.threadId !== GROUP_THREAD) {
        continue
      }
      if (engine.now - message.sentAt > MESSAGE_BUBBLE_MS) {
        continue
      }
      // messages are pushed in order, so the last one seen per author wins
      out.set(message.authorId, message)
    }
    return out
  })

  // --- Threads -------------------------------------------------------------

  /**
   * When each thread was last looked at, on the simulation clock.
   *
   * Unread is counted against *arrival*, not against when it was said. A
   * message captured before you last read the thread but delivered after it is
   * new to you, and treating it as already seen would hide exactly the late
   * arrival this whole prototype is about.
   */
  const readAt = reactive(new Map<ThreadId, number>())

  function messagesFor(threadId: ThreadId): Message[] {
    void frame.value
    return engine.messages.filter(
      (m) => m.threadId === threadId && (m.authorId === YOU_ID || m.state === 'delivered'),
    )
  }

  function unreadFor(threadId: ThreadId): number {
    void frame.value
    const seenAt = readAt.get(threadId) ?? -1
    return engine.messages.filter(
      (m) =>
        m.threadId === threadId &&
        m.authorId !== YOU_ID &&
        m.state === 'delivered' &&
        (m.deliveredAt ?? m.sentAt) > seenAt,
    ).length
  }

  function markRead(threadId: ThreadId): void {
    readAt.set(threadId, engine.now)
  }

  function openThread(threadId: ThreadId): void {
    openThreadId.value = threadId
    markRead(threadId)
  }

  /**
   * The thread currently on screen, whichever sheet is showing it.
   *
   * A mate's sheet is their private thread — the readings sit above it, but the
   * body of it is the conversation — so opening one counts as reading it just
   * as much as opening the group thread does.
   */
  const readingThreadId = computed<ThreadId | null>(
    () => openThreadId.value ?? selectedMateId.value,
  )

  function closeThread(): void {
    openThreadId.value = null
  }

  const groupUnread = computed(() => unreadFor(GROUP_THREAD))

  /** Private unread per mate, for the count that rides on their dot. */
  const unreadByMate = computed<Map<string, number>>(() => {
    void frame.value
    const out = new Map<string, number>()
    for (const mate of engine.mates) {
      const count = unreadFor(mate.id)
      if (count > 0) {
        out.set(mate.id, count)
      }
    }
    return out
  })

  const selectedMate = computed<MateView | null>(() => {
    const id = selectedMateId.value
    if (id === null) {
      return null
    }
    return mateViews.value.find((v) => v.mate.id === id) ?? null
  })

  const selectedWalk = computed<WalkEstimate | null>(() => {
    const view = selectedMate.value
    const fix = view?.mate.lastFix
    if (view === null || fix === undefined || fix === null) {
      return null
    }
    return estimateWalk(engine.youPosition, fix.position)
  })

  const relayHeartbeatAgeMs = computed<number | null>(() => {
    void frame.value
    const heard = engine.lastRelayHeartbeatAt
    return heard === null ? null : Math.max(0, engine.now - heard)
  })

  const relayHealth = computed<RelayHealth>(() => {
    const age = relayHeartbeatAgeMs.value
    if (age === null || age >= RELAY_DOWN_MS) {
      return 'down'
    }
    return age >= RELAY_SUSPECT_MS ? 'suspect' : 'up'
  })

  /**
   * A mate counts as reachable while their last fix is younger than two
   * report intervals plus a minute of slack — i.e. they have missed at most
   * one report. Any looser and a frozen mate stays green for a quarter of an
   * hour, which would quietly defeat the point of the strip.
   */
  const reachableCount = computed(() => {
    const intervalMs = engine.settings.reportIntervalSec * 1000
    const limit = intervalMs * 2 + 60_000
    return mateViews.value.filter((v) => v.ageMs !== null && v.ageMs < limit).length
  })

  const lastHeardAgeMs = computed<number | null>(() => {
    void frame.value
    const heard = engine.lastAnyReceivedAt
    return heard === null ? null : Math.max(0, engine.now - heard)
  })

  // --- Settings passthrough ------------------------------------------------

  function setTreatment(treatment: StalenessTreatment): void {
    engine.settings.stalenessTreatment = treatment
  }

  function setTransportOverride(mateId: string, transport: Transport | undefined): void {
    if (transport === undefined) {
      const { [mateId]: _removed, ...rest } = engine.settings.transportOverrides
      engine.settings.transportOverrides = rest
      return
    }
    engine.settings.transportOverrides = {
      ...engine.settings.transportOverrides,
      [mateId]: transport,
    }
  }

  function selectMate(id: string | null): void {
    selectedMateId.value = id
    if (id !== null) {
      markRead(id)
    }
  }

  function send(text: string, threadId: ThreadId = GROUP_THREAD): void {
    engine.send(text, threadId)
  }

  /** The name to put on a message, whoever wrote it. */
  function nameFor(authorId: string): string {
    if (authorId === YOU_ID) {
      return youName.value
    }
    return engine.mate(authorId)?.name ?? authorId
  }

  // A stored name has to take its mate out of the party before the first
  // scenario is laid down, or a returning Ben opens the app to himself already
  // on the ridge.
  if (storedName !== null) {
    engine.excludedMateId = matchingMateId(storedName)
    engine.reset()
  }

  applyScenario('spread')

  return {
    engine,
    frame,
    playing,
    speed,
    devPanelOpen,
    sheetOpacity,
    activeScenarioId,
    scenarios: SCENARIOS,
    selectedMateId,
    selectedMate,
    selectedWalk,
    mateViews,
    bubbleByAuthor,
    relayHealth,
    relayHeartbeatAgeMs,
    reachableCount,
    lastHeardAgeMs,
    start,
    stop,
    togglePlay,
    setSpeed,
    applyScenario,
    resetAll,
    setTreatment,
    setTransportOverride,
    selectMate,
    send,
    youName,
    askingName,
    setIdentity,
    forgetIdentity,
    nameFor,
    openThreadId,
    readingThreadId,
    openThread,
    closeThread,
    messagesFor,
    unreadFor,
    groupUnread,
    unreadByMate,
    GROUP_THREAD,
  }
})
