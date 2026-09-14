import { START_EPOCH_MS } from '@/sim/engine'

export function formatDistance(metres: number): string {
  if (metres < 1000) {
    return `${Math.round(metres / 10) * 10} m`
  }
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours === 0) {
    return `${Math.max(minutes, 1)} min`
  }
  return `${hours} h ${String(minutes).padStart(2, '0')}`
}

export function formatElevation(metres: number): string {
  return `${Math.round(metres)} m`
}

/** Sim clock as wall time. UTC getters keep it stable across timezones. */
export function formatClock(simMs: number): string {
  const date = new Date(START_EPOCH_MS + simMs)
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function formatSigned(metres: number): string {
  const rounded = Math.round(metres)
  return rounded >= 0 ? `+${rounded} m` : `${rounded} m`
}
