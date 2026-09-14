<script setup lang="ts">
import { computed } from 'vue'
import { useSimStore } from '@/stores/sim'

const sim = useSimStore()

const unread = computed(
  () => sim.engine.messages.filter((m) => m.authorId !== 'you' && m.state === 'delivered').length,
)
</script>

<template>
  <nav class="tabs">
    <button
      class="tabs__btn"
      :class="{ 'tabs__btn--on': sim.tab === 'map' }"
      type="button"
      @click="sim.tab = 'map'"
    >
      Map
    </button>
    <button
      class="tabs__btn"
      :class="{ 'tabs__btn--on': sim.tab === 'messages' }"
      type="button"
      @click="sim.tab = 'messages'"
    >
      Messages
      <span v-if="unread > 0 && sim.tab !== 'messages'" class="tabs__dot" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  background: var(--surface);
  border-top: 2px solid var(--line);
  padding-bottom: var(--safe-bottom);
  z-index: 600;
}

.tabs__btn {
  position: relative;
  flex: 1;
  min-height: var(--tabs-h);
  font-size: 16px;
  font-weight: 700;
  color: var(--text-dim);
}

.tabs__btn--on {
  color: var(--text);
  box-shadow: inset 0 3px 0 0 var(--fresh);
}

.tabs__dot {
  position: absolute;
  top: 14px;
  margin-left: 6px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--fresh);
}
</style>
