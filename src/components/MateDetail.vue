<script setup lang="ts">
/**
 * One mate: what you want to say to them, and — smaller — where they are.
 *
 * This used to be a stats screen with a "Message" button at the bottom, which
 * put the thread two taps away and read as though the numbers were the point.
 * They are not. Tapping someone on a map is nearly always the start of saying
 * something to them, so the thread is the body of this sheet and the readings
 * sit above it in one line, with the detail behind a tap.
 *
 * The age of the fix is deliberately exempt from that shrinking. It is not a
 * statistic in the same sense as the others — it is the one number that says
 * whether any of the rest can be trusted, and the brief makes it the loudest
 * thing on the screen. It is smaller than it was, but it is still the first
 * thing read after the name and still carries its staleness colour.
 */
import { computed, ref, watch } from 'vue'
import { useSimStore } from '@/stores/sim'
import { ageWords } from '@/lib/staleness'
import { formatDistance, formatDuration, formatElevation, formatSigned } from '@/lib/format'
import TerrainProfile from '@/components/TerrainProfile.vue'
import ThreadLog from '@/components/ThreadLog.vue'

const sim = useSimStore()

const view = computed(() => sim.selectedMate)
const fix = computed(() => view.value?.mate.lastFix ?? null)

/**
 * Collapsed by default, and reset on every open.
 *
 * Question 6 asks whether the terrain profile and walk time change what people
 * decide or are decoration. Deleting them would make that unanswerable;
 * leaving them open would keep answering it the old way. Behind one tap, the
 * question sharpens into something better: does anyone go looking?
 */
const showDetail = ref(false)

watch(
  () => view.value?.mate.id,
  () => {
    showDetail.value = false
  },
)

const elevationDelta = computed(() => {
  const current = fix.value
  return current === null ? null : current.altitudeM - sim.engine.youAltitudeM
})

function close(): void {
  sim.selectMate(null)
}
</script>

<template>
  <div v-if="view !== null" class="sheet" role="dialog" aria-modal="true">
    <button class="sheet__scrim" type="button" aria-label="Close" @click="close" />

    <section class="panel">
      <header class="panel__head">
        <span class="panel__swatch" :style="{ background: view.mate.colour }" />
        <div class="panel__who">
          <h2 class="panel__name">{{ view.mate.name }}</h2>
          <p class="panel__age" :class="`age-${view.bucket}`">
            Last heard {{ ageWords(view.ageMs ?? 0) }}
          </p>
        </div>
        <button class="panel__close" type="button" @click="close">Close</button>
      </header>

      <!--
        Everything else about where they are, on one line. Tappable, because
        the numbers underneath it are worth having and worth not looking at
        most of the time.
      -->
      <button
        v-if="fix !== null"
        class="panel__glance"
        type="button"
        :aria-expanded="showDetail"
        @click="showDetail = !showDetail"
      >
        <span class="panel__glance-text">
          {{ view.distanceM === null ? '—' : formatDistance(view.distanceM) }}
          {{ view.compass }}
          <span class="panel__sep">·</span>
          {{ formatElevation(fix.altitudeM) }}
          <span class="panel__sep">·</span>
          {{ sim.selectedWalk === null ? '—' : formatDuration(sim.selectedWalk.seconds) }} walk
        </span>
        <span class="panel__chev" aria-hidden="true">{{ showDetail ? '▲' : '▼' }}</span>
      </button>

      <p class="panel__private">Just you and {{ view.mate.name }}. Nobody else sees this.</p>

      <ThreadLog :thread-id="view.mate.id">
        <template #over-stream>
        <div v-if="showDetail && fix !== null" class="panel__detail">
          <dl class="detail__grid">
            <div class="detail__cell">
              <dt>Distance</dt>
              <dd>{{ view.distanceM === null ? '—' : formatDistance(view.distanceM) }}</dd>
            </div>
            <div class="detail__cell">
              <dt>Bearing</dt>
              <dd>
                {{ view.compass }}
                <small>{{ view.bearingDeg === null ? '' : `${Math.round(view.bearingDeg)}°` }}</small>
              </dd>
            </div>
            <div class="detail__cell">
              <dt>Elevation</dt>
              <dd>
                {{ formatElevation(fix.altitudeM) }}
                <small>{{ elevationDelta === null ? '' : formatSigned(elevationDelta) }}</small>
              </dd>
            </div>
            <div class="detail__cell">
              <dt>Walk there</dt>
              <dd>{{ sim.selectedWalk === null ? '—' : formatDuration(sim.selectedWalk.seconds) }}</dd>
            </div>
          </dl>

          <p v-if="sim.selectedWalk !== null" class="detail__walknote">
            Slope-adjusted, {{ Math.round(sim.selectedWalk.ascentM) }} m up and
            {{ Math.round(sim.selectedWalk.descentM) }} m down on a straight line. Not
            {{ formatDistance(sim.selectedWalk.straightLineM) }} of flat.
          </p>

          <TerrainProfile :from="sim.engine.youPosition" :to="fix.position" />

          <p class="detail__meta">
            <span>{{ view.transport === 'mesh' ? 'Mesh' : 'Cellular' }}</span>
            <span class="detail__dot">·</span>
            <span :class="view.batteryPct < 25 ? 'age-stale' : ''">
              Node battery {{ view.batteryPct }}%
            </span>
          </p>
        </div>
        </template>
      </ThreadLog>
    </section>
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

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 86dvh;
  background: var(--bg);
  border-top: 2px solid var(--line);
  border-radius: 16px 16px 0 0;
  overflow: hidden;
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 0;
}

.panel__swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--bg);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
  flex: none;
}

.panel__who {
  flex: 1;
  min-width: 0;
}

.panel__name {
  margin: 0;
  font-size: 22px;
  line-height: 1.1;
}

.panel__age {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
}

.panel__close {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--surface-high);
  border: 1px solid var(--line);
  font-weight: 700;
  flex: none;
}

/* The readings, dialled right back: one dim line, and a tap for the rest. */
.panel__glance {
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 32px);
  margin: 8px 16px 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text-dim);
  font-size: 13px;
  text-align: left;
}

.panel__glance-text {
  flex: 1;
  font-variant-numeric: tabular-nums;
}

.panel__sep {
  color: var(--line);
  margin: 0 2px;
}

.panel__chev {
  font-size: 10px;
}

/*
 * Laid over the conversation rather than pushed in above it. As a sibling in
 * the column it starved the stream to a 24 px sliver and shoved the compose
 * row 47 px below the bottom of the screen, taking the Send button with it.
 */
.panel__detail {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow-y: auto;
  padding: 12px 16px 16px;
  background: var(--bg);
}

.detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0 0 10px;
}

.detail__cell {
  background: var(--surface-high);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 10px;
}

.detail__cell dt {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.detail__cell dd {
  margin: 3px 0 0;
  font-size: 17px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.detail__cell dd small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}

.detail__walknote {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-dim);
}

.detail__meta {
  display: flex;
  gap: 8px;
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--text-dim);
}

.detail__dot {
  color: var(--line);
}

.panel__private {
  margin: 8px 16px 0;
  font-size: 13px;
  color: var(--text-dim);
}
</style>
