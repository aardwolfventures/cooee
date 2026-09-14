<script setup lang="ts">
/**
 * The group thread, as a sheet over the map.
 *
 * There is no messages screen any more. This opens from a button on the map,
 * so it is always something opened on purpose, and closing it puts you
 * straight back on the map rather than on a tab to navigate out of. A private
 * thread lives on the mate's own sheet — see `MateDetail.vue` — and both share
 * `ThreadLog` so the two behave identically.
 */
import { useSimStore } from '@/stores/sim'
import { GROUP_THREAD } from '@/sim/types'
import ThreadLog from '@/components/ThreadLog.vue'

const sim = useSimStore()

function close(): void {
  sim.closeThread()
}
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true">
    <button class="sheet__scrim" type="button" aria-label="Close" @click="close" />

    <section class="panel">
      <header class="panel__head">
        <h2 class="panel__title">Everyone</h2>
        <button class="panel__close" type="button" @click="close">Close</button>
      </header>

      <!--
        Said out loud once, at the top. A group message that looks identical to
        a private one is a message people will send to the wrong audience, and
        in a safety app the wrong audience for "need a hand" is one person.
      -->
      <p class="panel__who">Everyone on the mesh sees this.</p>

      <ThreadLog :thread-id="GROUP_THREAD" />
    </section>
  </div>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 1300;
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

.panel__title {
  margin: 0;
  flex: 1;
  font-size: 22px;
}

.panel__close {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--surface-high);
  border: 1px solid var(--line);
  font-weight: 700;
}

.panel__who {
  margin: 4px 16px 0;
  font-size: 13px;
  color: var(--text-dim);
}
</style>
