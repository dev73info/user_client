import { fileURLToPath, URL } from 'node:url'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import vueDevTools from 'vite-plugin-vue-devtools'
import Components from 'unplugin-vue-components/vite'

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
  proxyPaths.map((path) => [path, { target: proxyTarget, changeOrigin: true, ws: true }]),
)
const publicHtaccessPath = resolve(import.meta.dirname, 'public/.htaccess')
const distHtaccessPath = resolve(import.meta.dirname, 'dist/.htaccess')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // 模板里的绝对路径都是 public/ 下的静态资源（如 /icons/alipay.png），
      // 它们本来就由运行时的根路径直接提供，不需要 Vite 在构建期改写成模块 import。
      // 保持原样还能避免 vitest 在处理这类 import 时解析失败，导致引用这些组件的用例整包加载不起来。
      template: { transformAssetUrls: { includeAbsolute: false } },
    }),
    wasm(),
    // 组件的按需注册，只覆盖本项目的 `src/components`（插件的默认 dirs）。
    // 原来挂在 `AutoImport` 与这里的 `ElementPlusResolver` 已随 element-plus 一起移除：
    // 那两个解析器唯一的作用是按需引入 El* 组件与 `ElMessage` 这类命令式 API，
    // 站内已经没有用武之地（`ElMessage` / `ElMessageBox` 已换成 ui_73info 的 TMessage / TMessageBox）。
    Components(),
    {
      name: 'copy-spa-fallback-htaccess',
      closeBundle() {
        if (existsSync(publicHtaccessPath)) {
          copyFileSync(publicHtaccessPath, distHtaccessPath)
        }
      },
    },
    // 「在编辑器中打开」默认走 `code`（VS Code）；本机用 Cursor，这里固定指向 cursor。
    // 注意不要写成 process.env.LAUNCH_EDITOR ?? 'cursor'：该变量正是本选项回填到进程环境的，
    // dev server 因配置变更原地重启时会读到上一次注入的 'code'，等于永远改不过来。
    ...(process.env.NODE_ENV !== 'production' ? [vueDevTools({ launchEditor: 'cursor' })] : []),
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

          // 自研组件库单独成块。它发的是源码、被 link 进来（真实路径在 node_modules 之外），
          // 不在这里挑出来就会落进下面的 vendor 兜底，与第三方库混在一起。
          if (normalizedId.includes('/ui_73info/')) {
            return 'ui-73info'
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

          if (normalizedId.includes('/src/views/Dev')) {
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
              normalizedId.includes('TicketCenterView')
            ) {
              return 'user-account'
            }

            if (
              normalizedId.includes('ResourceCatalogView') ||
              normalizedId.includes('ResourcesView')
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
    // 绑 0.0.0.0：localhost / 127.0.0.1 / 局域网 IP 都能进；默认只绑回环时
    // Windows 上常变成仅 [::1]，用 127.0.0.1 打不开，真机也访问不到。
    host: '0.0.0.0',
    proxy: proxyConfig,
    fs: {
      allow: ['..'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // `ui_73info` 是 link 进来的源码，它自己的 node_modules 里也装了一份 vue
    // （供本库的 playground 与 type-check 用）。不收敛的话，库里那些 `import { ref } from 'vue'`
    // 会解析到另一份 vue，运行时就真的有两套响应式系统：`provide/inject` 对不上、
    // `instanceof` 判不过、`getCurrentInstance()` 在库里拿不到宿主实例。
    // 类型侧对应 `tsconfig.app.json` 里 `"vue"` 那条 paths，两处必须一起改。
    dedupe: ['vue'],
  },
  optimizeDeps: {
    // 两个都是发源码的 link 依赖（一个 Rust→WASM，一个 .vue 源码）。
    // 预打包会把它们当第三方包处理：ui_73info 是 .vue 源码，预打包后宿主的 HMR 就跨不过去，
    // 改组件得重启 dev server 才生效——那正是「发源码」想避开的事。
    exclude: ['tags-wasm', 'ui_73info'],
  },
})
