<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useSimStore } from '@/stores/sim'
import StatusStrip from '@/components/StatusStrip.vue'
import MapView from '@/components/MapView.vue'
import MateDetail from '@/components/MateDetail.vue'
import MessageThread from '@/components/MessageThread.vue'
import NamePrompt from '@/components/NamePrompt.vue'
import DevPanel from '@/components/DevPanel.vue'

const sim = useSimStore()

onMounted(() => {
  sim.start()
})

onBeforeUnmount(() => {
  sim.stop()
})
</script>

<template>
  <StatusStrip />

  <!--
    The map is the app. There is no tab bar any more: messages were a second
    screen and are now two things reached from this one — a button for the
    group, a mate's own dot for a word with just them — so nothing competes
    with the map for the bottom of the screen.
  -->
  <main class="stage">
    <MapView />
  </main>

  <MateDetail v-if="sim.selectedMate !== null" />
  <MessageThread v-if="sim.openThreadId !== null" />
  <DevPanel v-if="sim.devPanelOpen" />

  <!-- Last, and over everything: nothing behind this is usable until it is
       answered, and the simulation should not be watched through it. -->
  <NamePrompt v-if="sim.askingName" />
</template>

<style scoped>
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
</style>
