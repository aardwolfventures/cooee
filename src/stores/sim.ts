import { computed, reactive, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { SimEngine, RELAY_DOWN_MS, RELAY_SUSPECT_MS } from '@/sim/engine'
import { SCENARIOS, scenarioById, type ScenarioId } from '@/sim/scenarios'
import { bucketFor, type StalenessBucket } from '@/lib/staleness'
import { estimateWalk, type WalkEstimate } from '@/lib/walk'
import { compassPoint } from '@/lib/geo'
import type { Mate, StalenessTreatment, Transport } from '@/sim/types'

export type ClockSpeed = 1 | 10 | 60 | 300
export type RelayHealth = 'up' | 'suspect' | 'down'
export type Tab = 'map' | 'messages'

/** A mate as the UI is allowed to see them: only ever via a delivered fix. */
export interface MateView {
  mate: Mate
  ageMs: number | null
  bucket: StalenessBucket
  distanceM: number | null
  bearingDeg: number | null
  compass: string
  transport: Transport
  batteryPct: number
}

export const useSimStore = defineStore('sim', () => {
  const engine = reactive(new SimEngine()) as SimEngine

  const playing = ref(true)
  const speed = ref<ClockSpeed>(10)
  const activeScenarioId = ref<ScenarioId>('spread')
  const selectedMateId = ref<string | null>(null)
  const tab = ref<Tab>('map')
  const devPanelOpen = ref(false)
  /**
   * How strongly the Forestry sheet reads over the shaded relief. The build
   * plan asks for this wherever an imported map is laid over a topo base: the
   * sheet's flat zoning fills hide the landform, and being able to dial it back
   * is how you see both at once.
   */
  const sheetOpacity = ref(0.85)
  const frame = shallowRef(0)

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
      return {
        mate,
        ageMs,
        bucket: bucketFor(ageMs ?? Number.POSITIVE_INFINITY),
        distanceM,
        bearingDeg,
        compass: bearingDeg === null ? '—' : compassPoint(bearingDeg),
        transport: mate.transport,
        batteryPct: fix?.nodeBatteryPct ?? Math.round(mate.nodeBatteryPct),
      }
    })
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
  }

  function send(text: string): void {
    engine.send(text)
  }

  applyScenario('spread')

  return {
    engine,
    frame,
    playing,
    speed,
    tab,
    devPanelOpen,
    sheetOpacity,
    activeScenarioId,
    scenarios: SCENARIOS,
    selectedMateId,
    selectedMate,
    selectedWalk,
    mateViews,
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
  }
})
