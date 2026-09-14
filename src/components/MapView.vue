<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { useSimStore } from '@/stores/sim'
import { RELAY, YOU_NAME } from '@/sim/mates'
import { createTerrainLayer } from '@/map/terrainLayer'
import { ageShort, fadeOpacity, haloDiameterPx } from '@/lib/staleness'
import type { MateView } from '@/stores/sim'

const sim = useSimStore()
const host = ref<HTMLDivElement | null>(null)

let map: L.Map | null = null
let youMarker: L.Marker | null = null
let relayMarker: L.Marker | null = null
const mateMarkers = new Map<string, L.Marker>()
let refreshHandle = 0

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  )
}

/**
 * The three staleness treatments the brief asks for, built as one switch so
 * they can be compared like for like. Only the age cue differs — identity,
 * position and label all stay put — otherwise the comparison measures layout
 * churn instead of legibility.
 */
function mateMarkerHtml(view: MateView): string {
  const { mate, ageMs, bucket } = view
  const treatment = sim.engine.settings.stalenessTreatment
  const age = ageMs ?? 0
  const tag = escapeHtml(mate.tag)
  const name = escapeHtml(mate.name)

  const dotOpacity = treatment === 'fade' ? fadeOpacity(age) : 1
  const halo =
    treatment === 'halo'
      ? `<span class="mate-marker__halo bucket-${bucket}" style="width:${haloDiameterPx(age)}px;height:${haloDiameterPx(age)}px"></span>`
      : ''
  const ageLabel =
    treatment === 'label'
      ? `<span class="mate-marker__age age-${bucket}">${ageShort(age)}</span>`
      : ''

  return `
    <div class="mate-marker" style="opacity:${dotOpacity.toFixed(2)}">
      ${halo}
      <span class="mate-marker__dot${mate.tag.length > 1 ? ' mate-marker__dot--two' : ''}" style="background:${mate.colour}">${tag}</span>
      <span class="mate-marker__label">${name}${ageLabel}</span>
    </div>
  `
}

function relayMarkerHtml(): string {
  const modifier =
    sim.relayHealth === 'up'
      ? ''
      : sim.relayHealth === 'suspect'
        ? ' relay-marker__box--suspect'
        : ' relay-marker__box--down'
  return `<div class="mate-marker"><span class="relay-marker__box${modifier}">RELAY</span></div>`
}

function youMarkerHtml(): string {
  return `<div class="mate-marker"><span class="you-marker__dot"></span><span class="mate-marker__label">${escapeHtml(YOU_NAME)}</span></div>`
}

function icon(html: string): L.DivIcon {
  return L.divIcon({ html, className: '', iconSize: [0, 0] })
}

function render(): void {
  if (map === null) {
    return
  }

  for (const view of sim.mateViews) {
    const fix = view.mate.lastFix
    if (fix === null) {
      continue
    }
    const latLng = L.latLng(fix.position.lat, fix.position.lon)
    const existing = mateMarkers.get(view.mate.id)
    if (existing === undefined) {
      const marker = L.marker(latLng, { icon: icon(mateMarkerHtml(view)), keyboard: false })
      marker.on('click', () => sim.selectMate(view.mate.id))
      marker.addTo(map)
      mateMarkers.set(view.mate.id, marker)
      continue
    }
    existing.setLatLng(latLng)
    existing.setIcon(icon(mateMarkerHtml(view)))
  }

  const you = L.latLng(sim.engine.youPosition.lat, sim.engine.youPosition.lon)
  if (youMarker === null) {
    youMarker = L.marker(you, { icon: icon(youMarkerHtml()), keyboard: false, zIndexOffset: 500 })
    youMarker.addTo(map)
  } else {
    youMarker.setLatLng(you)
  }

  const relay = L.latLng(RELAY.position.lat, RELAY.position.lon)
  if (relayMarker === null) {
    // Always on top. At six mates the labels get dense, and the relay is the
    // one marker whose state answers "should I trust any of this" — a name
    // badge must never be able to bury it.
    relayMarker = L.marker(relay, {
      icon: icon(relayMarkerHtml()),
      keyboard: false,
      zIndexOffset: 1000,
    })
    relayMarker.addTo(map)
  } else {
    relayMarker.setIcon(icon(relayMarkerHtml()))
  }
}

function fitEveryone(): void {
  if (map === null) {
    return
  }
  const points: L.LatLngExpression[] = [
    [sim.engine.youPosition.lat, sim.engine.youPosition.lon],
    [RELAY.position.lat, RELAY.position.lon],
  ]
  for (const view of sim.mateViews) {
    const fix = view.mate.lastFix
    if (fix !== null) {
      points.push([fix.position.lat, fix.position.lon])
    }
  }
  map.fitBounds(L.latLngBounds(points), { padding: [64, 72], maxZoom: 15 })
}

onMounted(() => {
  if (host.value === null) {
    return
  }
  map = L.map(host.value, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: false,
  })

  // Shaded relief drawn from the simulation's own elevation model. It needs no
  // network, so the map is never blank — which matters for an app about being
  // somewhere without a connection.
  createTerrainLayer().addTo(map)

  // Real topography on top when it loads. If it does not, the layer above is
  // still a legible map rather than an empty grey field.
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution:
      'Relief generated from the simulation terrain model | Tiles: &copy; OpenTopoMap (CC-BY-SA), data &copy; OpenStreetMap contributors, SRTM',
  }).addTo(map)

  render()
  fitEveryone()

  refreshHandle = window.setInterval(render, 250)
})

onBeforeUnmount(() => {
  window.clearInterval(refreshHandle)
  map?.remove()
  map = null
})

watch(
  () => sim.activeScenarioId,
  () => {
    render()
    fitEveryone()
  },
)

watch(
  () => sim.tab,
  (tab) => {
    if (tab === 'map') {
      // The container had no size while hidden, so Leaflet needs telling.
      window.setTimeout(() => map?.invalidateSize(), 0)
    }
  },
)
</script>

<template>
  <div class="map">
    <div ref="host" class="map__canvas" />
    <button class="map__fit" type="button" @click="fitEveryone">Fit all</button>
  </div>
</template>

<style scoped>
.map {
  position: absolute;
  inset: 0;
}

.map__canvas {
  position: absolute;
  inset: 0;
}

.map__fit {
  position: absolute;
  right: 12px;
  bottom: 34px;
  z-index: 500;
  min-height: var(--tap);
  padding: 0 16px;
  border-radius: 10px;
  background: rgba(10, 13, 8, 0.9);
  border: 2px solid var(--line);
  font-weight: 700;
}
</style>

<style>
.bucket-fresh { color: var(--fresh); }
.bucket-recent { color: var(--recent); }
.bucket-stale { color: var(--stale); }
.bucket-lost { color: var(--lost); }
</style>
