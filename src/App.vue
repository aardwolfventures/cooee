<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useSimStore } from '@/stores/sim'
import StatusStrip from '@/components/StatusStrip.vue'
import MapView from '@/components/MapView.vue'
import MessagesView from '@/components/MessagesView.vue'
import MateDetail from '@/components/MateDetail.vue'
import DevPanel from '@/components/DevPanel.vue'
import TabBar from '@/components/TabBar.vue'

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

  <main class="stage">
    <!--
      The map stays mounted rather than being torn down on every tab change:
      re-creating a Leaflet instance loses the pan and zoom the user set, and
      losing someone's view because they glanced at the messages is exactly the
      kind of small betrayal that makes an app feel untrustworthy.
    -->
    <MapView v-show="sim.tab === 'map'" />
    <MessagesView v-if="sim.tab === 'messages'" />
  </main>

  <TabBar />

  <MateDetail v-if="sim.selectedMate !== null" />
  <DevPanel v-if="sim.devPanelOpen" />
</template>

<style scoped>
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
</style>
