/**
 * Who is holding the phone.
 *
 * The prototype is tested by sending one URL to the party, so whoever opens it
 * has to be able to be themselves. A tester watching a dot labelled "Mike"
 * while standing next to Mike is not testing what the brief cares about: the
 * thing being measured is whether people trust a stale position, trust
 * attaches to a person, and that includes the person you are.
 *
 * If the name given is somebody already in the party, they leave it. You
 * cannot be a dot on your own map, and a Ben who can see Ben out on the ridge
 * is being shown something false on the first screen he ever sees.
 */
import { DEFAULT_YOU_NAME, MATE_SEEDS } from './mates'

const STORAGE_KEY = 'cooee.you.name'

/** Long enough for any first name, short enough to sit under a dot. */
export const MAX_NAME_LENGTH = 14

/**
 * Tidy up what was thumbed in. Capitalised because it is rendered beside names
 * that are, and a lowercase "ben" under the dot would read as a different kind
 * of thing to "Rod" next to it.
 */
export function normaliseName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
  return collapsed.replace(/(^|[\s'-])(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

/**
 * The mate this name refers to, if it refers to one.
 *
 * Matches a first name or nickname, and also a full name's leading word, so
 * "Paul" finds Marshy the way the party would.
 */
export function matchingMateId(name: string): string | null {
  const needle = name.trim().toLowerCase()
  if (needle.length === 0) {
    return null
  }
  for (const seed of MATE_SEEDS) {
    const candidates = [seed.name, seed.fullName, seed.fullName.split(' ')[0] ?? '']
    if (candidates.some((c) => c.toLowerCase() === needle)) {
      return seed.id
    }
  }
  return null
}

/**
 * The name is remembered between reloads, which is the one exception to the
 * rule that this prototype persists nothing. Simulation state is deliberately
 * thrown away on every reload; being asked your name again every time you
 * refresh is not a finding, it is an irritation, and an irritated tester
 * stops testing.
 */
export function loadName(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === null) {
      return null
    }
    const name = normaliseName(stored)
    return name.length === 0 ? null : name
  } catch {
    // Private browsing, or storage turned off. Ask again rather than break.
    return null
  }
}

export function saveName(name: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, name)
  } catch {
    // Nothing to do and nothing worth saying. They can still use the app.
  }
}

export function clearName(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // As above.
  }
}

export { DEFAULT_YOU_NAME }
