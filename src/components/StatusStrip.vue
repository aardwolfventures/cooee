<script setup lang="ts">
import { computed } from 'vue'
import { useSimStore } from '@/stores/sim'
import { ageShort } from '@/lib/staleness'

const sim = useSimStore()

const relayLabel = computed(() => {
  const age = sim.relayHeartbeatAgeMs
  if (sim.relayHealth === 'up') {
    return 'Relay up'
  }
  if (age === null) {
    return 'Relay: no contact'
  }
  return `Relay silent ${ageShort(age)}`
})

const relayClass = computed(() => {
  if (sim.relayHealth === 'up') {
    return 'age-fresh'
  }
  return sim.relayHealth === 'suspect' ? 'age-recent' : 'age-lost'
})

const heardLabel = computed(() => {
  const age = sim.lastHeardAgeMs
  return age === null ? 'nothing yet' : `${ageShort(age)} ago`
})

const alarmed = computed(
  () => sim.relayHealth !== 'up' || sim.reachableCount < sim.mateViews.length,
)
</script>

<template>
  <header class="strip" :class="{ 'strip--alarmed': alarmed }">
    <div class="strip__row">
      <span class="strip__item">
        <strong :class="sim.reachableCount === sim.mateViews.length ? 'age-fresh' : 'age-stale'">
          {{ sim.reachableCount }}/{{ sim.mateViews.length }}
        </strong>
        reachable
      </span>

      <span class="strip__sep" aria-hidden="true">·</span>

      <span class="strip__item" :class="relayClass">
        <strong>{{ relayLabel }}</strong>
      </span>

      <span class="strip__sep" aria-hidden="true">·</span>

      <span class="strip__item strip__item--dim"> heard {{ heardLabel }} </span>
    </div>

    <button class="strip__dev" type="button" @click="sim.devPanelOpen = !sim.devPanelOpen">
      <span aria-hidden="true">☰</span>
      <span class="sr-only">Simulation controls</span>
    </button>
  </header>
</template>

<style scoped>
/*
 * This is a safety element, not a settings element. It answers "should I trust
 * what I am looking at", so it is always on screen and it changes colour when
 * the answer is no.
 */
.strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(var(--safe-top) + 8px) 10px 8px;
  min-height: var(--strip-h);
  background: var(--surface);
  border-bottom: 2px solid var(--line);
  z-index: 600;
}

.strip--alarmed {
  border-bottom-color: var(--stale);
  background: #241d15;
}

.strip__row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  flex-wrap: wrap;
}

.strip__item {
  white-space: nowrap;
}

.strip__item--dim {
  color: var(--text-dim);
}

.strip__sep {
  color: var(--line);
}

.strip__dev {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 40px;
  min-height: 40px;
  border-radius: 8px;
  background: var(--surface-high);
  border: 1px solid var(--line);
  font-size: 16px;
  color: var(--text-dim);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
