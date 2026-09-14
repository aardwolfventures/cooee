/**
 * Preset conditions, one tap each.
 *
 * Scenarios 3 and 4 are the ones that matter. They are the failure modes, and
 * how the UI handles them is the actual design problem — the other three exist
 * mostly to give testers something to compare them against.
 */
import type { SimEngine } from './engine'
import type { Mate } from './types'

/**
 * Pick the mate who plays a named role.
 *
 * These used to be hardcoded — Marshy goes quiet, you converge on Ben — but
 * whoever opens the app leaves the party, so the preferred mate may not be
 * there to play it. Falls through a preference order and then takes whoever is
 * left, because a "gone quiet" run in which nobody goes quiet is not a run.
 */
function role(engine: SimEngine, preferred: string[]): Mate | undefined {
  for (const id of preferred) {
    const mate = engine.mate(id)
    if (mate !== undefined) {
      return mate
    }
  }
  return engine.mates[0]
}

/**
 * Split the party in two for the relay scenario: alternate mates keep a bar of
 * signal and the rest are mesh-only. Computed rather than named, so the half
 * that freezes stays a half whoever is holding the phone.
 */
function halfOnCellular(engine: SimEngine): Record<string, 'cellular'> {
  const overrides: Record<string, 'cellular'> = {}
  engine.mates.forEach((mate, index) => {
    if (index % 2 === 1) {
      overrides[mate.id] = 'cellular'
    }
  })
  return overrides
}

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
        ben: 0.06,
        marshy: 0.05,
        rod: 0.05,
        derrick: 0.07,
        sahil: 0.06,
        dan: 0.05,
      }
      const still = role(engine, ['rod', 'marshy'])
      for (const mate of engine.mates) {
        mate.activity = mate.id === still?.id ? 'stationary' : 'moving'
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
        ben: 0.72,
        marshy: 0.68,
        rod: 0.62,
        derrick: 0.8,
        sahil: 0.7,
        dan: 0.66,
      }
      const still = role(engine, ['rod', 'marshy'])
      for (const mate of engine.mates) {
        mate.activity = mate.id === still?.id ? 'stationary' : 'moving'
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
        ben: 0.6,
        marshy: 0.55,
        rod: 0.5,
        derrick: 0.7,
        sahil: 0.58,
        dan: 0.52,
      }
      for (const mate of engine.mates) {
        mate.activity = 'moving'
        engine.placeAlongTrack(mate.id, fractions[mate.id] ?? 0.6)
        engine.seedLastFix(mate.id, 60_000 + Math.random() * 120_000)
      }
      // One of them stopped reporting 25 minutes ago and keeps walking
      // regardless, so the gap between the dot and the truth widens as the run
      // goes on.
      const gone = role(engine, ['marshy', 'ben', 'derrick'])
      if (gone !== undefined) {
        engine.seedLastFix(gone.id, 25 * 60_000)
        gone.activity = 'silent'
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
      // Half the party is low enough to hold a bar of signal and half is not,
      // which is the hard version of this test: three dots carry on moving
      // perfectly normally while the other three freeze. A map where
      // everything stops is obvious. A map where half of it stops is the one
      // people miss.
      engine.settings.transportOverrides = halfOnCellular(engine)
      engine.youTransport = 'cellular'
      engine.convergeTargetId = null
      const fractions: Record<string, number> = {
        ben: 0.65,
        marshy: 0.6,
        rod: 0.55,
        derrick: 0.75,
        sahil: 0.62,
        dan: 0.58,
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
    blurb: 'You walk toward a mate. Both ends boost their reporting rate.',
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
        ben: 0.45,
        marshy: 0.7,
        rod: 0.6,
        derrick: 0.78,
        sahil: 0.68,
        dan: 0.64,
      }
      for (const mate of engine.mates) {
        mate.activity = 'moving'
        engine.placeAlongTrack(mate.id, fractions[mate.id] ?? 0.6)
        engine.seedLastFix(mate.id, 40_000 + Math.random() * 60_000)
      }
      engine.convergeTargetId = role(engine, ['ben', 'marshy', 'rod'])?.id ?? null
    },
  },
]

export function scenarioById(id: ScenarioId): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
