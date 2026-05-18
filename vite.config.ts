import { fileURLToPath, URL } from 'node:url'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const proxyTarget = 'http://127.0.0.1:8080'
const proxyPaths = [
  '/api',
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
const publicHtaccessPath = resolve(import.meta.dirname, 'public/.htaccess')
const distHtaccessPath = resolve(import.meta.dirname, 'dist/.htaccess')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    wasm(),
    AutoImport({
      resolvers: [ElementPlusResolver({ importStyle: false })],
    }),
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
    }),
    {
      name: 'copy-spa-fallback-htaccess',
      closeBundle() {
        if (existsSync(publicHtaccessPath)) {
          copyFileSync(publicHtaccessPath, distHtaccessPath)
        }
      },
    },
    ...(process.env.NODE_ENV !== 'production' ? [vueDevTools()] : []),
  ],
  build: {
    chunkSizeWarningLimit: 1200,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (
            normalizedId.includes('/@vue/') ||
            normalizedId.includes('/vue/') ||
            normalizedId.includes('vue-router')
          ) {
            return 'vue-vendor'
          }

          if (normalizedId.includes('pinia')) {
            return 'pinia'
          }

          if (
            normalizedId.includes('element-plus') ||
            normalizedId.includes('@element-plus/icons-vue')
          ) {
            return 'element-plus'
          }

          if (normalizedId.includes('@tiptap/')) {
            return 'tiptap'
          }

          if (
            normalizedId.includes('markdown-it') ||
            normalizedId.includes('qrcode') ||
            normalizedId.includes('tags-wasm')
          ) {
            return 'dev-tools'
          }

          if (normalizedId.includes('/src/dev/views/')) {
            if (normalizedId.includes('DevResource')) {
              return 'dev-resources'
            }

            if (
              normalizedId.includes('DevRequirement') ||
              normalizedId.includes('DevMyRequirements')
            ) {
              return 'dev-requirements'
            }

            if (
              normalizedId.includes('DevWallet') ||
              normalizedId.includes('DevWithdrawal') ||
              normalizedId.includes('DevReleases')
            ) {
              return 'dev-wallet'
            }

            return 'dev-shell'
          }

          if (normalizedId.includes('/src/views/')) {
            if (
              normalizedId.includes('ProfileView') ||
              normalizedId.includes('MyCustomResourcesView') ||
              normalizedId.includes('TicketCenterView')
            ) {
              return 'user-account'
            }

            if (
              normalizedId.includes('ResourceCatalogView') ||
              normalizedId.includes('ResourceDetailView') ||
              normalizedId.includes('FreeResourcesView')
            ) {
              return 'user-resources'
            }
          }

          if (normalizedId.includes('node_modules')) {
            return 'vendor'
          }
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
      '@dev': fileURLToPath(new URL('./src/dev', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['tags-wasm'],
  },
})
