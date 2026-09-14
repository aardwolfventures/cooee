/**
 * The three things the map draws on top of a dot: a course arrow, your facing
 * cone, and the last thing someone said.
 *
 * The arrow is the one with teeth. It is present tense by nature — an arrow
 * says "they are going that way" — so it has to come from the delivered fix
 * and age out with it. If it ever reads ground truth it becomes a live arrow
 * on a dead dot, which is worse than drawing nothing.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createPinia, setActivePinia } from 'pinia'
import { loadDem } from '../dem'
import { MESSAGE_BUBBLE_MS, useSimStore } from '@/stores/sim'
import { YOU_ID } from '@/sim/mates'

beforeAll(async () => {
  await loadDem({
    meta: async () => JSON.parse(await readFile('public/terrain/elevation.json', 'utf8')),
    body: async () => new Uint8Array(await readFile('public/terrain/elevation.bin.gz')),
  })
})

type Store = ReturnType<typeof useSimStore>

/** Run the clock, keeping the view computeds in step as the app's loop does. */
function advance(sim: Store, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 1000) {
    sim.engine.tick(1000)
  }
  sim.frame += 1
}

function viewOf(sim: Store, id: string) {
  const view = sim.mateViews.find((candidate) => candidate.mate.id === id)
  if (view === undefined) {
    throw new Error(`no view for ${id}`)
  }
  return view
}

let sim: Store

beforeEach(() => {
  setActivePinia(createPinia())
  sim = useSimStore()
  sim.engine.settings.packetLossPct = 0
  sim.engine.settings.jitterEnabled = false
  sim.engine.settings.outOfOrderEnabled = false
  sim.engine.settings.reportIntervalSec = 30
})

describe('course arrow', () => {
  it('reports the heading carried by the delivered fix', () => {
    advance(sim, 120)
    const view = viewOf(sim, 'ben')
    expect(view.mate.lastFix).not.toBeNull()
    expect(view.courseDeg).toBeCloseTo(view.mate.lastFix!.headingDeg, 6)
  })

  it('does not follow the mate after the fix that carried it', () => {
    advance(sim, 120)
    const ben = viewOf(sim, 'ben').mate
    const delivered = ben.lastFix!.headingDeg

    // They walk on and turn hard. Nothing new has been heard, so the arrow
    // must still describe the fix, not the person.
    ben.trueHeadingDeg = (delivered + 137) % 360
    sim.frame += 1

    expect(viewOf(sim, 'ben').courseDeg).toBeCloseTo(delivered, 6)
    expect(viewOf(sim, 'ben').courseDeg).not.toBeCloseTo(ben.trueHeadingDeg, 3)
  })

  it('is dropped once the fix is too old to be present tense', () => {
    advance(sim, 120)
    const ben = viewOf(sim, 'ben').mate
    expect(viewOf(sim, 'ben').courseDeg).not.toBeNull()

    // Age the fix past the ten-minute cut without touching anything else.
    ben.lastFix!.capturedAt = sim.engine.now - 11 * 60_000
    sim.frame += 1

    expect(viewOf(sim, 'ben').ageMs).toBeGreaterThan(10 * 60_000)
    expect(viewOf(sim, 'ben').courseDeg).toBeNull()
  })

  it('shows nothing for someone who was standing still when it was taken', () => {
    advance(sim, 120)
    const ben = viewOf(sim, 'ben').mate
    expect(viewOf(sim, 'ben').courseDeg).not.toBeNull()

    ben.lastFix!.speedMps = 0
    sim.frame += 1

    expect(viewOf(sim, 'ben').courseDeg).toBeNull()
  })
})

describe('your facing', () => {
  it('turns to the way you are walking when converging', () => {
    sim.selectMate('ben')
    sim.applyScenario('converging')
    advance(sim, 60)
    const facing = sim.engine.youHeadingDeg
    advance(sim, 60)
    expect(Number.isFinite(facing)).toBe(true)
    expect(sim.engine.youHeadingDeg).toBeGreaterThanOrEqual(0)
    expect(sim.engine.youHeadingDeg).toBeLessThan(360)
  })

  it('stays a valid bearing while you stand still', () => {
    advance(sim, 600)
    expect(sim.engine.youHeadingDeg).toBeGreaterThanOrEqual(0)
    expect(sim.engine.youHeadingDeg).toBeLessThan(360)
  })
})

describe('message bubbles', () => {
  it('puts what you said over your own dot', () => {
    sim.send('On the ridge')
    sim.frame += 1
    expect(sim.bubbleByAuthor.get(YOU_ID)?.text).toBe('On the ridge')
  })

  it('keeps only the latest per person', () => {
    sim.send('Heading back')
    sim.send('Got one')
    sim.frame += 1
    expect(sim.bubbleByAuthor.get(YOU_ID)?.text).toBe('Got one')
    expect([...sim.bubbleByAuthor.keys()].filter((k) => k === YOU_ID)).toHaveLength(1)
  })

  it('clears once the message is no longer recent', () => {
    sim.send('Hold fire')
    sim.frame += 1
    expect(sim.bubbleByAuthor.has(YOU_ID)).toBe(true)

    advance(sim, MESSAGE_BUBBLE_MS / 1000 + 30)

    expect(sim.bubbleByAuthor.has(YOU_ID)).toBe(false)
  })
})
