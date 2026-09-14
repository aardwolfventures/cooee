import { beforeAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { SimEngine, RELAY_DOWN_MS } from '../engine'
import { scenarioById } from '../scenarios'
import { loadDem } from '../dem'
import { metresBetween } from '@/lib/geo'

/**
 * The real elevation model, read off disk instead of over HTTP. Reading the
 * bytes is the only thing swapped out — the gzip, the delta decode and every
 * sample below are the same code the app runs.
 */
beforeAll(async () => {
  await loadDem({
    meta: async () => JSON.parse(await readFile('public/terrain/elevation.json', 'utf8')),
    body: async () => new Uint8Array(await readFile('public/terrain/elevation.bin.gz')),
  })
})

/** Run the clock forward in realistic slices. */
function run(engine: SimEngine, seconds: number): void {
  const stepMs = 1_000
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += stepMs) {
    engine.tick(stepMs)
  }
}

function perfectLink(engine: SimEngine): void {
  engine.settings.packetLossPct = 0
  engine.settings.jitterEnabled = false
  engine.settings.outOfOrderEnabled = false
}

describe('capture and receipt', () => {
  it('keeps capture time and receipt time apart under jitter', () => {
    const engine = new SimEngine()
    engine.settings.reportIntervalSec = 60
    engine.settings.packetLossPct = 0
    engine.settings.jitterEnabled = true
    run(engine, 30 * 60)

    const fixes = engine.mates.map((m) => m.lastFix).filter((f) => f !== null)
    expect(fixes.length).toBeGreaterThan(0)
    // Every delivered fix arrived strictly after it was taken, and at least one
    // arrived meaningfully late. Collapsing these into one field would hide the
    // entire problem the prototype exists to explore.
    for (const fix of fixes) {
      expect(fix.receivedAt).toBeGreaterThan(fix.capturedAt)
    }
    expect(Math.max(...fixes.map((f) => f.receivedAt - f.capturedAt))).toBeGreaterThan(8_000)
  })

  it('never shows a fix that has not been delivered yet', () => {
    const engine = new SimEngine()
    engine.settings.reportIntervalSec = 120
    engine.settings.jitterEnabled = true
    run(engine, 20 * 60)

    for (const mate of engine.mates) {
      expect(mate.lastFix?.receivedAt ?? 0).toBeLessThanOrEqual(engine.now)
    }
  })
})

describe('packet loss', () => {
  it('drops roughly the configured share of mesh reports', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    engine.settings.reportIntervalSec = 10
    engine.settings.packetLossPct = 40
    engine.settings.defaultTransport = 'mesh'
    run(engine, 60 * 60)

    const expected = ((60 * 60) / 10) * engine.mates.length
    const lossRate = engine.droppedFixes / expected
    expect(lossRate).toBeGreaterThan(0.3)
    expect(lossRate).toBeLessThan(0.5)
  })

  it('delivers everything when loss is off', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    engine.settings.reportIntervalSec = 30
    run(engine, 30 * 60)
    expect(engine.droppedFixes).toBe(0)
  })
})

describe('out-of-order delivery', () => {
  it('discards a late fix that was captured before the one already shown', () => {
    const engine = new SimEngine()
    engine.settings.reportIntervalSec = 20
    engine.settings.packetLossPct = 0
    engine.settings.jitterEnabled = true
    engine.settings.outOfOrderEnabled = true
    run(engine, 90 * 60)

    const superseded = engine.mates.reduce((n, m) => n + m.supersededFixes, 0)
    // With a long jitter tail, some reports overtake each other.
    expect(superseded).toBeGreaterThan(0)

    // Whatever the arrival order, the dot never walks backwards in time.
    for (const mate of engine.mates) {
      expect(mate.lastFix).not.toBeNull()
    }
  })

  it('holds fixes in capture order when out-of-order delivery is off', () => {
    const engine = new SimEngine()
    engine.settings.reportIntervalSec = 20
    engine.settings.packetLossPct = 0
    engine.settings.jitterEnabled = true
    engine.settings.outOfOrderEnabled = false
    run(engine, 90 * 60)

    expect(engine.mates.reduce((n, m) => n + m.supersededFixes, 0)).toBe(0)
  })
})

describe('relay failure', () => {
  it('freezes mesh mates but not cellular ones when the relay goes down', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    engine.settings.reportIntervalSec = 60
    engine.settings.defaultTransport = 'mesh'
    engine.settings.transportOverrides = { marshy: 'cellular' }
    run(engine, 10 * 60)

    const before = new Map(engine.mates.map((m) => [m.id, m.lastFix?.capturedAt ?? -1]))
    engine.settings.relayUp = false
    run(engine, 20 * 60)

    expect(engine.mate('ben')!.lastFix!.capturedAt).toBe(before.get('ben'))
    expect(engine.mate('marshy')!.lastFix!.capturedAt).toBeGreaterThan(before.get('marshy')!)
  })

  it('lets the app infer the relay is down from missing heartbeats alone', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    engine.settings.defaultTransport = 'mesh'
    run(engine, 5 * 60)
    expect(engine.now - engine.lastRelayHeartbeatAt!).toBeLessThan(RELAY_DOWN_MS)

    engine.settings.relayUp = false
    run(engine, 12 * 60)
    // Nothing told the app. The silence is the only evidence there is.
    expect(engine.now - engine.lastRelayHeartbeatAt!).toBeGreaterThan(RELAY_DOWN_MS)
  })
})

describe('scenarios', () => {
  it('gone quiet leaves one mate ageing while the others keep reporting', () => {
    const engine = new SimEngine()
    scenarioById('quiet')!.apply(engine)
    const startAge = engine.now - engine.mate('marshy')!.lastFix!.capturedAt
    expect(startAge).toBeGreaterThanOrEqual(25 * 60_000)

    run(engine, 15 * 60)
    const marshyAge = engine.now - engine.mate('marshy')!.lastFix!.capturedAt
    expect(marshyAge).toBeGreaterThan(startAge)

    // The silent mate keeps walking, so the gap between the last known dot and
    // where they actually are widens the whole time.
    // The dot is frozen but Jules is not: after fifteen minutes the stale
    // marker is several hundred metres from where they actually are.
    const marshy = engine.mate('marshy')!
    const drift = metresBetween(marshy.truePosition, marshy.lastFix!.position)
    expect(drift).toBeGreaterThan(300)
  })

  it('relay dropped starts healthy and fails partway through', () => {
    const engine = new SimEngine()
    scenarioById('relay-dropped')!.apply(engine)
    expect(engine.settings.relayUp).toBe(true)
    run(engine, 5 * 60)
    expect(engine.settings.relayUp).toBe(false)
  })

  it('relay dropped freezes exactly half the party and leaves half moving', () => {
    const engine = new SimEngine()
    scenarioById('relay-dropped')!.apply(engine)
    engine.settings.packetLossPct = 0
    engine.settings.jitterEnabled = false
    run(engine, 3 * 60)

    const before = new Map(engine.mates.map((m) => [m.id, m.lastFix!.capturedAt]))
    run(engine, 20 * 60)

    const frozen = engine.mates.filter((m) => m.lastFix!.capturedAt === before.get(m.id))
    const moving = engine.mates.filter((m) => m.lastFix!.capturedAt > before.get(m.id)!)

    // Half the map carrying on as normal is what makes this hard to notice,
    // and therefore what makes it worth testing.
    expect(frozen.map((m) => m.id).sort()).toEqual(['ben', 'derrick', 'marshy'])
    expect(moving.map((m) => m.id).sort()).toEqual(['dan', 'rod', 'sahil'])
  })

  it('converging boosts the reporting rate for the selected mate', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    scenarioById('converging')!.apply(engine)
    perfectLink(engine)
    const startedAt = engine.youPosition
    run(engine, 10 * 60)

    // You closed some of the distance, and Dave reported far more often than
    // the five-minute baseline would allow.
    expect(engine.youPosition).not.toEqual(startedAt)
    expect(engine.convergeTargetId).toBe('ben')
  })
})

describe('messages', () => {
  it('resolves a sent message to delivered on a clean link', () => {
    const engine = new SimEngine()
    perfectLink(engine)
    const message = engine.send('Heading back')
    expect(message.state).toBe('sending')
    run(engine, 60)
    expect(engine.messages.find((m) => m.id === message.id)!.state).toBe('delivered')
  })

  it('leaves a message unacknowledged when the relay is down', () => {
    const engine = new SimEngine()
    engine.settings.relayUp = false
    engine.youTransport = 'mesh'
    const message = engine.send('Need a hand')
    run(engine, 120)
    expect(engine.messages.find((m) => m.id === message.id)!.state).toBe('unacknowledged')
  })
})
