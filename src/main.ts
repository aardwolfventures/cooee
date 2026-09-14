import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'leaflet/dist/leaflet.css'
import '@/styles/app.css'
import App from '@/App.vue'

createApp(App).use(createPinia()).mount('#app')
