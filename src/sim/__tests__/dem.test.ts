/**
 * The elevation model is now real data rather than a formula, so these tests
 * are about the things that can actually go wrong with real data: a decode
 * that silently shifts, a projection that puts the grid somewhere else, and
 * interpolation that stair-steps.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { demBounds, isDemLoaded, loadDem, sampleElevation } from '../dem'
import { ORIGIN, elevationAt, profileBetween, fromLocalKm } from '../terrain'
import { estimateWalk } from '@/lib/walk'

beforeAll(async () => {
  await loadDem({
    meta: async () => JSON.parse(await readFile('public/terrain/elevation.json', 'utf8')),
    body: async () => new Uint8Array(await readFile('public/terrain/elevation.bin.gz')),
  })
})

describe('elevation model', () => {
  it('loads', () => {
    expect(isDemLoaded()).toBe(true)
  })

  it('covers the Forestry sheet', () => {
    const bounds = demBounds()
    // The sheet's own georeferencing, from the GeoPDF's /GPTS array.
    expect(bounds.west).toBeCloseTo(149.538, 2)
    expect(bounds.east).toBeCloseTo(149.992, 2)
    expect(bounds.north).toBeCloseTo(-33.648, 2)
    expect(bounds.south).toBeCloseTo(-34.139, 2)
  })

  it('puts camp on the plateau, not in a valley floor', () => {
    // Vulcan sits around 1100-1300 m. The surface this replaced was a river
    // valley with a 400 m floor, and got camp wrong by about 800 m.
    expect(elevationAt(ORIGIN)).toBeGreaterThan(1150)
    expect(elevationAt(ORIGIN)).toBeLessThan(1280)
  })

  it('spans the gorge and the tops', () => {
    let min = Infinity
    let max = -Infinity
    const bounds = demBounds()
    for (let i = 0; i <= 60; i += 1) {
      for (let j = 0; j <= 60; j += 1) {
        const lat = bounds.south + ((bounds.north - bounds.south) * i) / 60
        const lon = bounds.west + ((bounds.east - bounds.west) * j) / 60
        const z = sampleElevation({ lat, lon })
        min = Math.min(min, z)
        max = Math.max(max, z)
      }
    }
    expect(min).toBeLessThan(700)
    expect(max).toBeGreaterThan(1300)
  })

  it('interpolates continuously rather than stepping between posts', () => {
    // Posts are ~32 m apart, so a 200 m line sampled every 2 m crosses only
    // about seven of them. Under nearest-neighbour that line returns seven
    // distinct values in flat runs; under bilinear every sample differs.
    // Distinct-count is what separates the two — the largest single step does
    // not, because on ground this gentle even a hard step is only ~1.2 m.
    const readings: number[] = []
    for (let m = 0; m <= 200; m += 2) {
      readings.push(elevationAt(fromLocalKm({ east: m / 1000, north: 0 })))
    }
    const distinct = new Set(readings.map((value) => value.toFixed(4))).size
    expect(distinct).toBeGreaterThan(readings.length * 0.9)

    let biggestStep = 0
    for (let i = 1; i < readings.length; i += 1) {
      biggestStep = Math.max(biggestStep, Math.abs(readings[i]! - readings[i - 1]!))
    }
    expect(biggestStep).toBeLessThan(0.5)
  })

  it('clamps outside the sheet instead of throwing', () => {
    expect(() => sampleElevation({ lat: -20, lon: 130 })).not.toThrow()
    expect(Number.isFinite(sampleElevation({ lat: -20, lon: 130 }))).toBe(true)
  })
})

describe('derived terrain readings', () => {
  it('profiles the ground actually between two points', () => {
    const to = fromLocalKm({ east: 2, north: -1.5 })
    const samples = profileBetween(ORIGIN, to, 64)
    expect(samples).toHaveLength(65)
    expect(samples[0]!.distanceM).toBe(0)
    expect(samples[64]!.distanceM).toBeGreaterThan(2000)
    expect(samples[0]!.elevationM).toBeCloseTo(elevationAt(ORIGIN), 5)
    for (const sample of samples) {
      expect(sample.elevationM).toBeGreaterThan(400)
      expect(sample.elevationM).toBeLessThan(1400)
    }
  })

  it('charges more for the uphill direction than the downhill one', () => {
    // Tobler is asymmetric, so the same leg must not cost the same both ways.
    // Pick a leg with real relief: the knoll the relay sits on.
    const knoll = fromLocalKm({ east: -0.8, north: -1.8 })
    const up = estimateWalk(ORIGIN, knoll)
    const down = estimateWalk(knoll, ORIGIN)
    expect(up.ascentM).toBeGreaterThan(20)
    expect(up.ascentM).toBeCloseTo(down.descentM, 5)
    expect(up.seconds).toBeGreaterThan(down.seconds)
  })

  it('quotes a walk time slower than a straight-line stroll', () => {
    const to = fromLocalKm({ east: 3, north: 0 })
    const walk = estimateWalk(ORIGIN, to)
    expect(walk.straightLineM).toBeGreaterThan(2900)
    // 3 km of undulating forest is not a 25-minute flat-ground walk.
    expect(walk.seconds).toBeGreaterThan(1800)
    expect(walk.seconds).toBeLessThan(7200)
  })
})
