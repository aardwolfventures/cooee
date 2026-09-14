<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { useSimStore } from '@/stores/sim'
import { RELAY, YOU_ID } from '@/sim/mates'
import { createTerrainLayer } from '@/map/terrainLayer'
import { ageShort, fadeOpacity, haloDiameterPx } from '@/lib/staleness'
import type { MateView } from '@/stores/sim'

const sim = useSimStore()
const host = ref<HTMLDivElement | null>(null)
const sheetOpacity = computed(() => sim.sheetOpacity)

let map: L.Map | null = null
let sheetLayer: L.TileLayer | null = null
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
/**
 * The bubble over someone's dot. Truncated hard: this is a glance, and the
 * whole thread is one tab away.
 */
function bubbleHtml(authorId: string): string {
  const message = sim.bubbleByAuthor.get(authorId)
  if (message === undefined) {
    return ''
  }
  const text = message.text.length > 42 ? `${message.text.slice(0, 41)}…` : message.text
  const pending = message.state === 'unacknowledged' ? ' mate-marker__bubble--unacked' : ''
  return `<span class="mate-marker__bubble${pending}">${escapeHtml(text)}</span>`
}

/**
 * The little arrow showing which way someone was walking.
 *
 * Drawn from the delivered fix, so it ages out with the dot rather than
 * quietly staying current — see `courseDeg` in the store for why that matters.
 */
function courseHtml(courseDeg: number | null): string {
  if (courseDeg === null) {
    return ''
  }
  return `<span class="mate-marker__course" style="transform:rotate(${courseDeg.toFixed(0)}deg)"></span>`
}

/**
 * The count of private messages waiting from this mate.
 *
 * With the messages tab gone there is no bar left to badge, so this is the
 * only cue that somebody has taken you aside. It sits on the dot rather than
 * over it because a bubble is a public thing — see `bubbleByAuthor` in the
 * store — and whether a count alone gets noticed is precisely what this
 * arrangement is being tested for.
 */
function unreadHtml(mateId: string): string {
  const count = sim.unreadByMate.get(mateId)
  if (count === undefined) {
    return ''
  }
  return `<span class="mate-marker__unread">${count > 9 ? '9+' : count}</span>`
}

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
      ${bubbleHtml(mate.id)}
      ${halo}
      ${courseHtml(view.courseDeg)}
      <span class="mate-marker__dot${mate.tag.length > 1 ? ' mate-marker__dot--two' : ''}" style="background:${mate.colour}">${tag}${unreadHtml(mate.id)}</span>
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
  // A cone rather than an arrow: you know roughly which way you are pointed,
  // not precisely, and a hard needle would claim a precision no compass has.
  const cone = `<span class="you-marker__cone" style="transform:rotate(${sim.engine.youHeadingDeg.toFixed(0)}deg)"></span>`
  return `<div class="mate-marker">${bubbleHtml(YOU_ID)}${cone}<span class="you-marker__dot"></span><span class="mate-marker__label">${escapeHtml(sim.youName)}</span></div>`
}

function icon(html: string): L.DivIcon {
  return L.divIcon({ html, className: '', iconSize: [0, 0] })
}

/** Last markup painted per marker, so an unchanged frame touches no DOM. */
const painted = new Map<string, string>()

/**
 * Update a marker's contents without replacing the marker.
 *
 * `setIcon` throws the icon's root element away and builds a new one. Doing
 * that on a 250 ms timer quietly breaks tapping: a tap is only a click if the
 * press and the release land on the same element, so any tap that straddles a
 * refresh is swallowed and the dot has to be tapped again. Writing into the
 * existing element keeps the root — and therefore Leaflet's interactive target
 * — alive across the swap, so the click always lands.
 */
function paint(marker: L.Marker, key: string, html: string): void {
  if (painted.get(key) === html) {
    return
  }
  painted.set(key, html)
  const element = marker.getElement()
  if (element === undefined || element === null) {
    marker.setIcon(icon(html))
    return
  }
  element.innerHTML = html
}

function render(): void {
  if (map === null) {
    return
  }

  // The party can change under us: whoever is holding the phone is taken out
  // of it, so a mate who was on the map a moment ago may no longer exist.
  // Their marker has to go with them or it sits there as a dot that can never
  // update again — the exact thing this app is meant to make impossible to
  // mistake for a live one.
  const present = new Set(sim.mateViews.map((v) => v.mate.id))
  for (const [id, marker] of mateMarkers) {
    if (!present.has(id)) {
      marker.remove()
      mateMarkers.delete(id)
      painted.delete(id)
    }
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
    paint(existing, view.mate.id, mateMarkerHtml(view))
  }

  const you = L.latLng(sim.engine.youPosition.lat, sim.engine.youPosition.lon)
  if (youMarker === null) {
    youMarker = L.marker(you, { icon: icon(youMarkerHtml()), keyboard: false, zIndexOffset: 500 })
    youMarker.addTo(map)
  } else {
    youMarker.setLatLng(you)
    paint(youMarker, YOU_ID, youMarkerHtml())
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
    paint(relayMarker, 'relay', relayMarkerHtml())
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
    attributionControl: false,
    preferCanvas: false,
  })

  // Shaded relief from the elevation model. It needs no network, so the map is
  // never blank — which matters for an app about being somewhere without a
  // connection — and it carries on below the sheet's own zoom range.
  createTerrainLayer().addTo(map)

  // The Forestry Corporation sheet, rasterised from the supplied GeoPDF and
  // reprojected to these tiles. Also local, for the same reason. Its native
  // range is z11-z14; Leaflet over-zooms the z14 tiles past that rather than
  // dropping the sheet when someone pinches in.
  sheetLayer = L.tileLayer(`${import.meta.env.BASE_URL}map/{z}/{x}/{y}.png`, {
    minZoom: 9,
    maxZoom: 17,
    minNativeZoom: 11,
    // Hosts with a file-count cap get a trimmed tile set; the deploy that has
    // room carries z14. Leaflet over-zooms whatever the top native level is,
    // so the map stays usable either way.
    maxNativeZoom: Number(import.meta.env.VITE_MAX_TILE_ZOOM ?? 14),
    opacity: sheetOpacity.value,
    // The single-file standalone build carries no tiles. Fail to nothing so it
    // falls back to bare relief instead of a grid of broken images.
    errorTileUrl:
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  })
  sheetLayer.addTo(map)

  render()
  fitEveryone()

  refreshHandle = window.setInterval(render, 250)
})

watch(sheetOpacity, (value) => {
  sheetLayer?.setOpacity(value)
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
</script>

<template>
  <div class="map">
    <div ref="host" class="map__canvas" />
    <button class="map__fit" type="button" @click="fitEveryone">Fit all</button>

    <!--
      The group thread lives here rather than behind a tab. Saying something to
      everybody is the one message action that is not about a particular
      person, so it belongs on the map next to all of them; anything you want
      to say to one person is reached by tapping that person.
    -->
    <button class="map__shout" type="button" @click="sim.openThread(sim.GROUP_THREAD)">
      Message everyone
      <span v-if="sim.groupUnread > 0" class="map__shout-count">{{ sim.groupUnread }}</span>
    </button>
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
  bottom: calc(80px + var(--safe-bottom));
  z-index: 500;
  min-height: var(--tap);
  padding: 0 16px;
  border-radius: 10px;
  background: rgba(10, 13, 8, 0.9);
  border: 2px solid var(--line);
  font-weight: 700;
}

.map__shout {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: calc(12px + var(--safe-bottom));
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 56px;
  border-radius: 14px;
  background: rgba(10, 13, 8, 0.92);
  border: 2px solid var(--line);
  color: var(--text);
  font-size: 17px;
  font-weight: 800;
}

.map__shout:active {
  border-color: var(--fresh);
}

/* Unread on the group thread. Green rather than red: it is somebody talking,
   not something wrong, and red is spoken for by the staleness ramp. */
.map__shout-count {
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 12px;
  background: var(--fresh);
  color: var(--bg);
  font-size: 14px;
  font-weight: 800;
  line-height: 24px;
}
</style>

<style>
.bucket-fresh { color: var(--fresh); }
.bucket-recent { color: var(--recent); }
.bucket-stale { color: var(--stale); }
.bucket-lost { color: var(--lost); }
</style>
