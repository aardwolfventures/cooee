<script setup lang="ts">
import { computed } from 'vue'
import { useSimStore } from '@/stores/sim'
import { ageWords } from '@/lib/staleness'
import { formatDistance, formatDuration, formatElevation, formatSigned } from '@/lib/format'
import TerrainProfile from '@/components/TerrainProfile.vue'

const sim = useSimStore()

const view = computed(() => sim.selectedMate)
const fix = computed(() => view.value?.mate.lastFix ?? null)

const elevationDelta = computed(() => {
  const current = fix.value
  return current === null ? null : current.altitudeM - sim.engine.youAltitudeM
})

function close(): void {
  sim.selectMate(null)
}

function openMessages(): void {
  sim.tab = 'messages'
  close()
}
</script>

<template>
  <div v-if="view !== null && fix !== null" class="sheet" role="dialog" aria-modal="true">
    <button class="sheet__scrim" type="button" aria-label="Close" @click="close" />

    <div class="sheet__panel">
      <header class="sheet__head">
        <span class="sheet__swatch" :style="{ background: view.mate.colour }" />
        <h2 class="sheet__name">{{ view.mate.fullName }}</h2>
        <button class="sheet__close" type="button" @click="close">Close</button>
      </header>

      <!--
        Age gets the largest type on the screen and is stated in words. Every
        other number here is only as good as this one, and a figure people have
        to decode is a figure they will skip.
      -->
      <p class="sheet__age" :class="`age-${view.bucket}`">
        Last heard {{ ageWords(view.ageMs ?? 0) }}
      </p>

      <dl class="sheet__grid">
        <div class="sheet__cell">
          <dt>Distance</dt>
          <dd>{{ view.distanceM === null ? '—' : formatDistance(view.distanceM) }}</dd>
        </div>
        <div class="sheet__cell">
          <dt>Bearing</dt>
          <dd>
            {{ view.compass }}
            <small>{{ view.bearingDeg === null ? '' : `${Math.round(view.bearingDeg)}°` }}</small>
          </dd>
        </div>
        <div class="sheet__cell">
          <dt>Elevation</dt>
          <dd>
            {{ formatElevation(fix.altitudeM) }}
            <small>{{ elevationDelta === null ? '' : formatSigned(elevationDelta) }}</small>
          </dd>
        </div>
        <div class="sheet__cell">
          <dt>Walk there</dt>
          <dd>{{ sim.selectedWalk === null ? '—' : formatDuration(sim.selectedWalk.seconds) }}</dd>
        </div>
      </dl>

      <p v-if="sim.selectedWalk !== null" class="sheet__walknote">
        Slope-adjusted, {{ Math.round(sim.selectedWalk.ascentM) }} m up and
        {{ Math.round(sim.selectedWalk.descentM) }} m down on a straight line. Not
        {{ formatDistance(sim.selectedWalk.straightLineM) }} of flat.
      </p>

      <TerrainProfile :from="sim.engine.youPosition" :to="fix.position" />

      <p class="sheet__meta">
        <span>{{ view.transport === 'mesh' ? 'Mesh' : 'Cellular' }}</span>
        <span class="sheet__dot">·</span>
        <span :class="view.batteryPct < 25 ? 'age-stale' : ''">
          Node battery {{ view.batteryPct }}%
        </span>
      </p>

      <button class="sheet__message" type="button" @click="openMessages">Message</button>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
}

.sheet__panel {
  position: relative;
  background: var(--surface);
  border-top: 2px solid var(--line);
  border-radius: 16px 16px 0 0;
  padding: 14px 16px calc(16px + var(--safe-bottom));
  max-height: 88dvh;
  overflow-y: auto;
}

.sheet__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sheet__swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--bg);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
}

.sheet__name {
  margin: 0;
  font-size: 22px;
  flex: 1;
}

.sheet__close {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--surface-high);
  border: 1px solid var(--line);
  font-weight: 700;
}

.sheet__age {
  margin: 12px 0 14px;
  font-size: 24px;
  font-weight: 800;
  line-height: 1.2;
}

.sheet__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0 0 12px;
}

.sheet__cell {
  background: var(--surface-high);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
}

.sheet__cell dt {
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.sheet__cell dd {
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.sheet__cell dd small {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
}

.sheet__cell dd {
  white-space: nowrap;
}

.sheet__walknote {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-dim);
}

.sheet__meta {
  display: flex;
  gap: 8px;
  margin: 12px 0 14px;
  font-size: 14px;
  color: var(--text-dim);
}

.sheet__dot {
  color: var(--line);
}

.sheet__message {
  width: 100%;
  min-height: 52px;
  border-radius: 12px;
  background: var(--surface-high);
  border: 2px solid var(--fresh);
  color: var(--text);
  font-size: 17px;
  font-weight: 800;
}
</style>
