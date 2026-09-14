import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'leaflet/dist/leaflet.css'
import '@/styles/app.css'
import App from '@/App.vue'
import { httpDemSource, inlineDemSource, loadDem } from '@/sim/dem'

/**
 * The elevation model has to be in memory before anything mounts: the store
 * builds the simulation as it is created, and the first thing the engine does
 * is ask how high the camp is. Loading it here keeps `elevationAt` synchronous
 * everywhere else, which is worth one await at startup.
 */
async function start(): Promise<void> {
  const root = document.querySelector('#app')
  try {
    await loadDem(inlineDemSource() ?? httpDemSource(import.meta.env.BASE_URL))
  } catch (error) {
    // Without terrain there is no map, no cross-section and no walk time, so
    // say so plainly rather than mounting an app that throws on first paint.
    if (root !== null) {
      root.textContent = `Could not load the elevation model: ${String(error)}`
    }
    throw error
  }
  createApp(App).use(createPinia()).mount('#app')
}

void start()
