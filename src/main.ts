import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installGlobalFetchLoadingTracker } from './composables/useGlobalLoadingScreen'
import 'element-plus/dist/index.css'
import './styles/user.css'
import './styles/unified-top-card.css'
import './dev/styles/dev.css'

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
