import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages serves this repo from /cooee/. `base` is overridden to '/' for
// local dev so the same config works in both places.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cooee/' : '/',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
  },
}))
