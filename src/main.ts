import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installGlobalFetchLoadingTracker } from './composables/useGlobalLoadingScreen'
import 'element-plus/dist/index.css'
import './styles/user.css'
import './styles/unified-top-card.css'
import './dev/styles/dev.css'

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

installGlobalFetchLoadingTracker()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
