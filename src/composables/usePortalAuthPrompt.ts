import { useRoute, useRouter } from 'vue-router'

import { buildAuthModalQuery, isSafeAuthRedirect } from '@/shared/auth/portalAuthQuery'

/**
 * 在当前页面打开登录弹窗，不再先跳回首页。
 *
 * 弹窗本体挂在门户外壳（`PortalAuthModalHost`），这里只负责把 `modal=auth` 写进
 * 当前地址；`redirect_to` 保留当前页地址，登录成功后原地关闭弹窗。
 */
export function usePortalAuthPrompt() {
  const route = useRoute()
  const router = useRouter()

  function openAuth(mode: 'login' | 'register' | 'reset' = 'login', redirectTo?: string) {
    const explicitRedirect = redirectTo && isSafeAuthRedirect(redirectTo) ? redirectTo.trim() : ''
    const existingRedirect =
      typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''
    // 首页登录后要重拉押金比例 / 待办需求等数据，不能把 `/` 当成需要回跳的地址。
    const fallbackRedirect = route.name === 'home' ? '' : route.fullPath
    const returnTo =
      explicitRedirect ||
      (isSafeAuthRedirect(existingRedirect) ? existingRedirect : fallbackRedirect)
    return router.push({
      path: route.path,
      query: buildAuthModalQuery(route.query, mode, returnTo),
      hash: route.hash,
    })
  }

  function openLogin(redirectTo?: string) {
    return openAuth('login', redirectTo)
  }

  return { openAuth, openLogin }
}
