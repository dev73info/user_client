/**
 * 门户外壳的登录态接线：启动时初始化会话（含开发模式自动登录），以及全局 401 的兜底处理。
 *
 * 从 `App.vue` 拆出，逻辑逐行搬移；外壳只剩下层结构与事件注册的调用点。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { useAuthStore } from '@/stores/auth'
import { AUTH_UNAUTHORIZED_EVENT, type AuthUnauthorizedEventDetail } from '@/shared/api/authEvents'
import { fetchTurnstileToken, getTurnstileSiteKey, isTurnstileEnabled } from '@/shared/turnstile'

const CLOUDFLARE_TEST_SITE_KEY = '1x0000000000000000000000000000000AA'

export function useAppShellAuth() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()
  const devAutoLoginCredentials = import.meta.env.DEV
    ? {
        username: import.meta.env.VITE_DEV_AUTO_LOGIN_USERNAME?.trim() ?? '',
        password: import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD?.trim() ?? '',
      }
    : null
  let handlingUnauthorized = false

  async function loginWithDevelopmentAccount() {
    if (!devAutoLoginCredentials?.username || !devAutoLoginCredentials.password) {
      return
    }

    try {
      // `/auth/login` 与手动登录是同一个端点，仍由后端校验账号密码与 token。
      // 只有官方测试站点密钥才直接提交测试 token，避免本机挂件域名或脚本加载阻塞自动登录；
      // 正式站点密钥必须继续通过 Cloudflare 取得真实 token，不能拿测试值代替。
      const turnstileToken = isTurnstileEnabled()
        ? getTurnstileSiteKey() === CLOUDFLARE_TEST_SITE_KEY
          ? 'test'
          : await fetchTurnstileToken('login')
        : ''
      await auth.login(
        devAutoLoginCredentials.username,
        devAutoLoginCredentials.password,
        undefined,
        turnstileToken || undefined,
      )
    } catch (error) {
      console.warn('开发模式自动登录失败', error)
    }
  }

  async function initializeAuthSession() {
    auth.hydrate()

    let hasUsableSession = false
    if (auth.token) {
      try {
        await auth.initializeSession()
        hasUsableSession = true
      } catch (error) {
        console.warn('初始化登录态失败', error)
      }
    }

    if (!devAutoLoginCredentials?.username || !devAutoLoginCredentials.password) {
      return
    }

    // 已有可用会话就不再打登录接口。开发模式的自动登录**不能**每次启动都重新登一次：
    // 后端对同一账号的登录限流是 8 次 / 15 分（防撞库），而整页 HMR 重载、重启 dev server、
    // 开新标签页都算一次「启动」，照旧写法十几分钟就能把额度打满，正常开发反被限流拦下。
    if (hasUsableSession) {
      // 会话有效但登的不是指定的开发账号（手动换过号）：这时才切回开发账号。
      if (auth.username && auth.username !== devAutoLoginCredentials.username) {
        auth.logout()
        await loginWithDevelopmentAccount()
      }
      return
    }

    await loginWithDevelopmentAccount()
  }

  function currentRedirectTarget() {
    const fullPath = route.fullPath.trim()
    if (!fullPath || !fullPath.startsWith('/') || fullPath.startsWith('//') || fullPath === '/') {
      return ''
    }
    return fullPath
  }

  function handleUnauthorizedSession(event: Event) {
    const isDeveloperRoute =
      route.path.startsWith('/dev') || route.matched.some((record) => Boolean(record.meta.devArea))

    if (isDeveloperRoute) {
      return
    }

    if (handlingUnauthorized) {
      return
    }

    const alreadyShowingLogin = route.name === 'home' && route.query.modal === 'auth'
    if (!auth.token.trim() && alreadyShowingLogin) {
      return
    }

    handlingUnauthorized = true
    const detail = (event as CustomEvent<AuthUnauthorizedEventDetail>).detail
    const redirectTarget = currentRedirectTarget()
    const nextQuery: Record<string, string> = { modal: 'auth', mode: 'login' }
    if (redirectTarget) {
      nextQuery.redirect_to = redirectTarget
    }

    auth.logout()
    TMessage.warning(detail?.message || '未登录或登录已过期，请重新登录')

    void router.replace({ name: 'home', query: nextQuery }).finally(() => {
      window.setTimeout(() => {
        handlingUnauthorized = false
      }, 500)
    })
  }

  onMounted(() => {
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedSession)
    void initializeAuthSession()
  })

  onBeforeUnmount(() => {
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedSession)
  })

  return { auth }
}
