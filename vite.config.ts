import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const proxyTarget = 'http://127.0.0.1:8080'
const proxyPaths = [
  '/auth',
  '/coupons',
  '/public/requirements',
  '/realname',
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
  plugins: [
    vue(),
    wasm(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    ...(process.env.NODE_ENV !== 'production' ? [vueDevTools()] : []),
  ],
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks(id) {
          if (id.includes('/@vue/') || id.includes('/vue/') || id.includes('vue-router')) {
            return 'vue-vendor'
          }

          if (id.includes('pinia')) {
            return 'pinia'
          }

          if (id.includes('element-plus')) {
            return 'element-plus'
          }

          if (id.includes('node_modules')) {
            return 'vendor'
          }

          return 'app'
        },
      },
    },
  },
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
