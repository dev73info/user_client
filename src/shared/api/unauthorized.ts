import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'

import { AUTH_UNAUTHORIZED_EVENT } from './authEvents'
import { useAuthStore } from '@/stores/auth'

/** 同一波并发 401 只处理一次：多个请求同时过期时不要重复登出与重复跳转。 */
const HANDLED_WINDOW_MS = 1000

/**
 * 订阅「未授权」事件：清掉本地登录态并回到首页（首页承载登录弹窗）。
 *
 * 请求层只负责派发事件，不认识 store 与路由——所以订阅放在应用装配处（`main.ts`），
 * 避免请求层反向依赖 store 造成循环引用。
 */
export function installUnauthorizedHandler(pinia: Pinia, router: Router): () => void {
  let lastHandledAt = 0

  const handle = () => {
    const now = Date.now()
    if (now - lastHandledAt < HANDLED_WINDOW_MS) {
      return
    }
    lastHandledAt = now

    try {
      useAuthStore(pinia).logout()
    } catch {
      // store 还没装上时忽略：登录态本来也不存在
    }

    if (router.currentRoute.value.name !== 'home') {
      void router.replace({ name: 'home' })
    }
  }

  window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handle)
  return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handle)
}
