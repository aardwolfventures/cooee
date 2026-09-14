/**
 * How old is too old.
 *
 * These thresholds are a guess and they are meant to be argued with — question
 * 2 in the brief is literally "at what age does a position stop being useful".
 * They live in one place so the answer from testing can be applied in one edit.
 */
export type StalenessBucket = 'fresh' | 'recent' | 'stale' | 'lost'

export const STALENESS_THRESHOLDS_MS = {
  fresh: 2 * 60_000,
  recent: 10 * 60_000,
  stale: 30 * 60_000,
} as const

export function bucketFor(ageMs: number): StalenessBucket {
  if (ageMs < STALENESS_THRESHOLDS_MS.fresh) {
    return 'fresh'
  }
  if (ageMs < STALENESS_THRESHOLDS_MS.recent) {
    return 'recent'
  }
  if (ageMs < STALENESS_THRESHOLDS_MS.stale) {
    return 'stale'
  }
  return 'lost'
}

/** Compact age for a map label: "40s", "6m", "1h12". */
export function ageShort(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}h${String(minutes % 60).padStart(2, '0')}`
}

/** Age in words, for the detail screen where it must be unmissable. */
export function ageWords(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000))
  if (seconds < 20) {
    return 'just now'
  }
  if (seconds < 60) {
    return `${seconds} seconds ago`
  }
  const minutes = Math.round(seconds / 60)
  if (minutes === 1) {
    return 'a minute ago'
  }
  if (minutes < 60) {
    return `${minutes} minutes ago`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) {
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  }
  return `${hours}h ${rest}m ago`
}

/** Opacity for the progressive-fade treatment. */
export function fadeOpacity(ageMs: number): number {
  const t = Math.min(1, ageMs / STALENESS_THRESHOLDS_MS.stale)
  return 1 - 0.72 * t
}

/**
 * Halo diameter in pixels for the growing-ring treatment.
 *
 * Starts wider than the 30px dot so the ring is present from the first second
 * and visibly grows, rather than appearing from nowhere partway through. If it
 * only showed up once a fix was old, "no ring" would silently become the cue
 * and the treatment would be testing something else.
 */
export function haloDiameterPx(ageMs: number): number {
  const t = Math.min(1, ageMs / STALENESS_THRESHOLDS_MS.stale)
  return 44 + 68 * t
}
