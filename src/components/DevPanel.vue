<script setup lang="ts">
import { computed } from 'vue'
import { useSimStore, type ClockSpeed } from '@/stores/sim'
import { scenarioById } from '@/sim/scenarios'
import { formatClock } from '@/lib/format'
import type { StalenessTreatment, Transport } from '@/sim/types'

const sim = useSimStore()

const SPEEDS: ClockSpeed[] = [1, 10, 60, 300]

const TREATMENTS: { id: StalenessTreatment; label: string; note: string }[] = [
  { id: 'label', label: 'Age label', note: 'Numeric age next to the name.' },
  { id: 'fade', label: 'Fade', note: 'Dot fades out as the fix ages.' },
  { id: 'halo', label: 'Halo', note: 'Ring grows and reddens with age.' },
]

const activeScenario = computed(() => scenarioById(sim.activeScenarioId))

const settings = computed(() => sim.engine.settings)

function overrideFor(mateId: string): Transport | '' {
  return settings.value.transportOverrides[mateId] ?? ''
}

function setOverride(mateId: string, value: string): void {
  sim.setTransportOverride(mateId, value === '' ? undefined : (value as Transport))
}

const supersededTotal = computed(() =>
  sim.engine.mates.reduce((total, mate) => total + mate.supersededFixes, 0),
)
</script>

<template>
  <div class="dev" role="dialog" aria-label="Simulation controls">
    <button class="dev__scrim" type="button" aria-label="Close" @click="sim.devPanelOpen = false" />

    <div class="dev__panel">
      <header class="dev__head">
        <h2 class="dev__title">Simulation</h2>
        <span class="dev__clock">{{ formatClock(sim.engine.now) }}</span>
        <button class="dev__close" type="button" @click="sim.devPanelOpen = false">Done</button>
      </header>

      <section class="dev__section">
        <h3 class="dev__label">Clock</h3>
        <div class="dev__row">
          <button class="chip chip--wide" type="button" @click="sim.togglePlay()">
            {{ sim.playing ? 'Pause' : 'Play' }}
          </button>
          <button
            v-for="value in SPEEDS"
            :key="value"
            class="chip"
            :class="{ 'chip--on': sim.speed === value }"
            type="button"
            @click="sim.setSpeed(value)"
          >
            {{ value }}×
          </button>
        </div>
      </section>

      <section class="dev__section">
        <h3 class="dev__label">Scenario</h3>
        <div class="dev__grid">
          <button
            v-for="scenario in sim.scenarios"
            :key="scenario.id"
            class="chip chip--block"
            :class="{ 'chip--on': sim.activeScenarioId === scenario.id }"
            type="button"
            @click="sim.applyScenario(scenario.id)"
          >
            {{ scenario.name }}
          </button>
        </div>
        <p v-if="activeScenario !== undefined" class="dev__note">
          {{ activeScenario.blurb }}
          <br />
          <em>{{ activeScenario.watchFor }}</em>
        </p>
      </section>

      <section class="dev__section">
        <h3 class="dev__label">Staleness treatment</h3>
        <div class="dev__grid">
          <button
            v-for="treatment in TREATMENTS"
            :key="treatment.id"
            class="chip chip--block"
            :class="{ 'chip--on': settings.stalenessTreatment === treatment.id }"
            type="button"
            @click="sim.setTreatment(treatment.id)"
          >
            {{ treatment.label }}
          </button>
        </div>
        <p class="dev__note">
          {{ TREATMENTS.find((t) => t.id === settings.stalenessTreatment)?.note }}
          Test all three. One of them is obviously right and it is not obvious in advance
          which.
        </p>
      </section>

      <section class="dev__section">
        <h3 class="dev__label">
          Report interval
          <span class="dev__value">{{ settings.reportIntervalSec }} s</span>
        </h3>
        <input
          v-model.number="settings.reportIntervalSec"
          class="dev__slider"
          type="range"
          min="10"
          max="900"
          step="10"
        />

        <h3 class="dev__label">
          Packet loss
          <span class="dev__value">{{ settings.packetLossPct }}%</span>
        </h3>
        <input
          v-model.number="settings.packetLossPct"
          class="dev__slider"
          type="range"
          min="0"
          max="50"
          step="1"
        />
      </section>

      <section class="dev__section">
        <label class="dev__toggle">
          <input v-model="settings.jitterEnabled" type="checkbox" />
          <span>Delivery jitter</span>
        </label>
        <label class="dev__toggle">
          <input v-model="settings.outOfOrderEnabled" type="checkbox" />
          <span>Out-of-order delivery</span>
        </label>
        <label class="dev__toggle">
          <input v-model="settings.relayUp" type="checkbox" />
          <span>Relay up</span>
        </label>
      </section>

      <section class="dev__section">
        <h3 class="dev__label">Transport per mate</h3>
        <div v-for="view in sim.mateViews" :key="view.mate.id" class="dev__mate">
          <span class="dev__mateName" :style="{ color: view.mate.colour }">
            {{ view.mate.name }}
          </span>
          <select
            class="dev__select"
            :value="overrideFor(view.mate.id)"
            @change="setOverride(view.mate.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Default ({{ settings.defaultTransport }})</option>
            <option value="mesh">Mesh</option>
            <option value="cellular">Cellular</option>
          </select>
        </div>
      </section>

      <section class="dev__section">
        <h3 class="dev__label">Link counters</h3>
        <p class="dev__note">
          {{ sim.engine.droppedFixes }} fixes lost in transit ·
          {{ supersededTotal }} arrived out of order and were discarded as stale.
        </p>
        <button class="chip chip--block" type="button" @click="sim.resetAll()">
          Reset simulation
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dev {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  justify-content: flex-end;
}

.dev__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
}

.dev__panel {
  position: relative;
  width: min(420px, 92vw);
  background: var(--surface);
  border-left: 2px solid var(--line);
  overflow-y: auto;
  padding: calc(var(--safe-top) + 12px) 14px calc(20px + var(--safe-bottom));
}

.dev__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.dev__title {
  margin: 0;
  font-size: 20px;
  flex: 1;
}

.dev__clock {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  font-size: 18px;
  color: var(--text-dim);
}

.dev__close {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--surface-high);
  border: 1px solid var(--line);
  font-weight: 700;
}

.dev__section {
  padding: 12px 0;
  border-top: 1px solid var(--line);
}

.dev__label {
  display: flex;
  justify-content: space-between;
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.dev__value {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.dev__row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.dev__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.chip {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 9px;
  background: var(--surface-high);
  border: 2px solid var(--line);
  font-weight: 700;
  font-size: 14px;
}

.chip--wide {
  flex: 1;
}

.chip--block {
  width: 100%;
}

.chip--on {
  border-color: var(--fresh);
  color: var(--fresh);
}

.dev__note {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-dim);
}

.dev__slider {
  width: 100%;
  margin-bottom: 10px;
  accent-color: var(--fresh);
  height: 32px;
}

.dev__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  font-size: 15px;
}

.dev__toggle input {
  width: 22px;
  height: 22px;
  accent-color: var(--fresh);
}

.dev__mate {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
}

.dev__mateName {
  flex: 1;
  font-weight: 700;
}

.dev__select {
  min-height: 40px;
  border-radius: 8px;
  background: var(--surface-high);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 0 8px;
  font-size: 14px;
}
</style>
