/**
 * Seeded PRNG. Runs need to be repeatable: the brief calls for two rounds of
 * testing a week apart with changes in between, and that comparison is
 * meaningless if the simulation rolls different dice each time.
 */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
