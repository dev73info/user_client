import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import vueDevTools from 'vite-plugin-vue-devtools'

const proxyTarget = 'http://127.0.0.1:8080'
const proxyPaths = [
  '/auth',
  '/requirements',
  '/tickets',
  '/payments',
  '/settings',
  '/resources/resources',
  '/resources/tags',
  '/uploads',
]
const proxyConfig = Object.fromEntries(
  proxyPaths.map((path) => [path, { target: proxyTarget, changeOrigin: true }]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), wasm(), ...(process.env.NODE_ENV !== 'production' ? [vueDevTools()] : [])],
  server: {
    proxy: proxyConfig,
    fs: {
      allow: ['..'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['tags-wasm'],
  },
})
