/**
 * Preset conditions, one tap each.
 *
 * Scenarios 3 and 4 are the ones that matter. They are the failure modes, and
 * how the UI handles them is the actual design problem — the other three exist
 * mostly to give testers something to compare them against.
 */
import type { SimEngine } from './engine'

export type ScenarioId = 'together' | 'spread' | 'quiet' | 'relay-dropped' | 'converging'

export interface Scenario {
  id: ScenarioId
  name: string
  blurb: string
  /** What this run is meant to find out. Shown to you, not to testers. */
  watchFor: string
  apply: (engine: SimEngine) => void
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'together',
    name: 'Together',
    blurb: 'Everyone inside a kilometre, cellular, fresh data.',
    watchFor: 'The easy case. Mostly a baseline for how good it can ever look.',
    apply: (engine) => {
      engine.clearInFlight()
      engine.settings.reportIntervalSec = 10
      engine.settings.packetLossPct = 0
      engine.settings.jitterEnabled = false
      engine.settings.outOfOrderEnabled = false
      engine.settings.relayUp = true
      engine.settings.defaultTransport = 'cellular'
      engine.settings.transportOverrides = {}
      engine.youTransport = 'cellular'
      engine.convergeTargetId = null
      const fractions: Record<string, number> = {
        macca: 0.06,
        dave: 0.05,
        jules: 0.07,
        tommo: 0.05,
      }
      for (const mate of engine.mates) {
        mate.activity = mate.id === 'tommo' ? 'stationary' : 'moving'
        engine.placeAlongTrack(mate.id, fractions[mate.id] ?? 0.05)
        engine.seedLastFix(mate.id, 15_000)
      }
    },
  },
  {
    id: 'spread',
    name: 'Spread out',
    blurb: 'Three to six kilometres apart, mesh only, five-minute intervals.',
    watchFor: 'Whether the map is still readable when nothing is fresh.',
    apply: (engine) => {
      engine.clearInFlight()
      engine.settings.reportIntervalSec = 300
      engine.settings.packetLossPct = 20
      engine.settings.jitterEnabled = true
      engine.settings.outOfOrderEnabled = true
      engine.settings.relayUp = true
      engine.settings.defaultTransport = 'mesh'
      engine.settings.transportOverrides = {}
      engine.youTransport = 'mesh'
      engine.convergeTargetId = null
      const fractions: Record<string, number> = {
        macca: 0.72,
        dave: 0.68,
        jules: 0.8,
        tommo: 0.62,
      }
      for (const mate of engine.mates) {
        mate.activity = mate.id === 'tommo' ? 'stationary' : 'moving'
        engine.placeAlongTrack(mate.id, fractions[mate.id] ?? 0.7)
        engine.seedLastFix(mate.id, 120_000 + Math.random() * 180_000)
      }
    },
  },
  {
    id: 'quiet',
    name: 'Gone quiet',
    blurb: "One mate's last fix is 25 minutes old and ageing.",
    watchFor: 'Does anyone notice, unprompted, and how long does it take?',
    apply: (engine) => {
      engine.clearInFlight()
      engine.settings.reportIntervalSec = 300
      engine.settings.packetLossPct = 20
      engine.settings.jitterEnabled = true
      engine.settings.outOfOrderEnabled = true
      engine.settings.relayUp = true
      engine.settings.defaultTransport = 'mesh'
      engine.settings.transportOverrides = {}
      engine.youTransport = 'mesh'
      engine.convergeTargetId = null
      const fractions: Record<string, number> = {
        macca: 0.6,
        dave: 0.55,
        jules: 0.7,
        tommo: 0.5,
      }
      for (const mate of engine.mates) {
        mate.activity = 'moving'
        engine.placeAlongTrack(mate.id, fractions[mate.id] ?? 0.6)
        engine.seedLastFix(mate.id, 60_000 + Math.random() * 120_000)
      }
      // Jules stopped reporting 25 minutes ago and keeps walking regardless,
      // so the gap between the dot and the truth widens as the run goes on.
      const jules = engine.mate('jules')
      if (jules !== undefined) {
        engine.seedLastFix('jules', 25 * 60_000)
        jules.activity = 'silent'
      }
    },
  },
  {
    id: 'relay-dropped',
    name: 'Relay dropped',
    blurb: 'The relay falls over mid-session and the mesh fragments.',
    watchFor:
      'The most important question in the brief. How long before anyone notices?',
    apply: (engine) => {
      engine.clearInFlight()
      engine.settings.reportIntervalSec = 300
      engine.settings.packetLossPct = 20
      engine.settings.jitterEnabled = true
      engine.settings.outOfOrderEnabled = true
      engine.settings.relayUp = true
      engine.settings.defaultTransport = 'mesh'
      // Dave and Tommo are low enough to hold a bar of signal; Macca and
      // Jules are mesh-only and will freeze the moment the relay goes.
      engine.settings.transportOverrides = { dave: 'cellular', tommo: 'cellular' }
      engine.youTransport = 'cellular'
      engine.convergeTargetId = null
      const fractions: Record<string, number> = {
        macca: 0.65,
        dave: 0.6,
        jules: 0.75,
        tommo: 0.55,
      }
      for (const mate of engine.mates) {
        mate.activity = 'moving'
        engine.placeAlongTrack(mate.id, fractions[mate.id] ?? 0.6)
        engine.seedLastFix(mate.id, 45_000 + Math.random() * 90_000)
      }
      // Two minutes of everything looking fine, then it doesn't.
      engine.schedule(engine.now + 120_000, () => {
        engine.settings.relayUp = false
      })
    },
  },
  {
    id: 'converging',
    name: 'Converging',
    blurb: 'You walk toward Dave. Both ends boost their reporting rate.',
    watchFor: 'Do they use the map, or immediately want an arrow?',
    apply: (engine) => {
      engine.clearInFlight()
      engine.settings.reportIntervalSec = 300
      engine.settings.packetLossPct = 15
      engine.settings.jitterEnabled = true
      engine.settings.outOfOrderEnabled = true
      engine.settings.relayUp = true
      engine.settings.defaultTransport = 'mesh'
      engine.settings.transportOverrides = {}
      engine.youTransport = 'mesh'
      const fractions: Record<string, number> = {
        macca: 0.7,
        dave: 0.45,
        jules: 0.78,
        tommo: 0.6,
      }
      for (const mate of engine.mates) {
        mate.activity = mate.id === 'dave' ? 'moving' : 'moving'
        engine.placeAlongTrack(mate.id, fractions[mate.id] ?? 0.6)
        engine.seedLastFix(mate.id, 40_000 + Math.random() * 60_000)
      }
      engine.convergeTargetId = 'dave'
    },
  },
]

export function scenarioById(id: ScenarioId): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
