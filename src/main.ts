import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installGlobalFetchLoadingTracker } from './composables/useGlobalLoadingScreen'
import { installMockFetch } from './mock/index'
import { installUnauthorizedHandler } from './shared/api/unauthorized'
// ui_73info 的令牌与样式底座。放在页面样式**之前**：令牌要早于消费它的样式生效
// （见 ui_73info 的 styles/index.css 顶部）。它只定义 `--73-*` 与 `.t73` 类名空间，
// 不碰各端自己的 `--dev-*` / `--portal-*` / `--profile-*`。
//
// 原来在这之前引的 `element-plus/dist/index.css` 已随组件库一起移除：整站已迁到
// ui_73info，`--el-*` 不再有供给方。迁移期的 alias.css（旧变量名桥接）仍然**没有引**，
// 理由见 ui_73info/doc/架构.md 第三节。
import 'ui_73info/styles.css'
import './styles/user.css'
import './styles/unified-top-card.css'
import './styles/dev.css'
// 工作台外壳的色板（`--uw-*`）：只被 `.user-workbench` 那一支外壳用，取值见文件头注释。
import './styles/workbench-shell.css'

// 维护模式：设置 VITE_MAINTENANCE_MODE=true 后，用户端重定向到维护页。
if (
  import.meta.env.VITE_MAINTENANCE_MODE === 'true' &&
  !window.location.pathname.endsWith('/maintenance.html')
) {
  window.location.replace('/maintenance.html')
}

if (import.meta.env.DEV) {
  ;(
    globalThis as typeof globalThis & {
      __VUE_DEVTOOLS_TOAST__?: (message: string, type?: string) => void
    }
  ).__VUE_DEVTOOLS_TOAST__ = (message: string, type?: string) => {
    if (message.includes('store installed 🆕')) {
      return
    }

    if (type === 'error') {
      console.error(message)
      return
    }

    if (type === 'warn') {
      console.warn(message)
      return
    }

    console.log(message)
  }
}

// mock 必须比全局加载进度条更早装上：进度条会把当时的 fetch 当作「原始 fetch」包一层，
// 装反了就会变成两层拦截，加载计数错乱。详见 src/mock/index.ts。
installMockFetch()
installGlobalFetchLoadingTracker()

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)

// 401 统一处理：请求层派发「未授权」事件，这里清登录态并回首页
// （与路由守卫既有做法一致：回首页后登录弹窗由用户点击触发）。
installUnauthorizedHandler(pinia, router)

app.mount('#app')
