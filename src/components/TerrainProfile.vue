<script setup lang="ts">
import { computed } from 'vue'
import { profileBetween } from '@/sim/terrain'
import { formatElevation } from '@/lib/format'
import type { LatLon } from '@/lib/geo'

const props = defineProps<{ from: LatLon; to: LatLon }>()

const WIDTH = 320
const HEIGHT = 92

const samples = computed(() => profileBetween(props.from, props.to, 72))

const bounds = computed(() => {
  const elevations = samples.value.map((s) => s.elevationM)
  const min = Math.min(...elevations)
  const max = Math.max(...elevations)
  const pad = Math.max(30, (max - min) * 0.15)
  return { min: min - pad, max: max + pad }
})

function pointFor(index: number): { x: number; y: number } {
  const list = samples.value
  const sample = list[index]!
  const last = list[list.length - 1]!
  const x = last.distanceM === 0 ? 0 : (sample.distanceM / last.distanceM) * WIDTH
  const { min, max } = bounds.value
  const y = HEIGHT - ((sample.elevationM - min) / (max - min)) * HEIGHT
  return { x, y }
}

const areaPath = computed(() => {
  const parts = samples.value.map((_, i) => {
    const { x, y } = pointFor(i)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `${parts.join(' ')} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`
})

const highest = computed(() => Math.max(...samples.value.map((s) => s.elevationM)))
const lowest = computed(() => Math.min(...samples.value.map((s) => s.elevationM)))
</script>

<template>
  <figure class="profile">
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="none"
      class="profile__svg"
      role="img"
      aria-label="Terrain cross-section between you and this mate"
    >
      <path :d="areaPath" class="profile__area" />
    </svg>
    <figcaption class="profile__caption">
      <span>you</span>
      <span class="profile__range">
        {{ formatElevation(lowest) }} – {{ formatElevation(highest) }}
      </span>
      <span>them</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.profile {
  margin: 0;
}

.profile__svg {
  display: block;
  width: 100%;
  height: 92px;
  background: #131810;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.profile__area {
  fill: rgba(95, 214, 138, 0.22);
  stroke: var(--fresh);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.profile__caption {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-dim);
}

.profile__range {
  font-variant-numeric: tabular-nums;
}
</style>
