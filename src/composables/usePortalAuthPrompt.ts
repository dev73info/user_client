import { useRoute, useRouter } from 'vue-router'

import { buildAuthModalQuery } from '@/shared/auth/portalAuthQuery'

/**
 * 在当前页面打开登录弹窗，不再先跳回首页。
 *
 * 弹窗本体挂在门户外壳（`PortalAuthModalHost`），这里只负责把 `modal=auth` 写进
 * 当前地址；`redirect_to` 保留当前页地址，登录成功后原地关闭弹窗。
 */
export function usePortalAuthPrompt() {
  const route = useRoute()
  const router = useRouter()

  function openLogin(redirectTo = route.fullPath) {
    return router.push({
      path: route.path,
      query: buildAuthModalQuery(route.query, 'login', redirectTo),
      hash: route.hash,
    })
  }

  return { openLogin }
}
