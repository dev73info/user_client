import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installGlobalFetchLoadingTracker } from './composables/useGlobalLoadingScreen'
import { installMockFetch } from './mock/index'
import 'element-plus/dist/index.css'
import './styles/user.css'
import './styles/unified-top-card.css'
import './styles/dev.css'

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

app.use(createPinia())
app.use(router)

app.mount('#app')
