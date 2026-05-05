import type { RouteRecordRaw, Router } from 'vue-router'
import { useAuthStore } from '@dev/stores/auth'
import { DEV_PORTAL_URL, buildUnifiedAuthUrl } from '@/config/runtime'
export const devRoutes: RouteRecordRaw[] = [
  {
    path: '/dev',
    redirect: '/dev/overview',
  },
  {
    path: '/dev/overview',
    name: 'dev-overview',
    component: () => import('@dev/views/DevOverviewView.vue'),
    meta: {
      title: '开发概览',
    },
  },
  {
    path: '/dev/wallet',
    redirect: '/dev/wallet/overview',
  },
  {
    path: '/dev/wallet/order-deposit',
    redirect: '/dev/wallet/overview',
  },
  {
    path: '/dev/wallet/overview',
    name: 'dev-wallet',
    component: () => import('@dev/views/DevWalletView.vue'),
    meta: {
      title: '钱包 / 我的余额',
    },
  },
  {
    path: '/dev/wallet/releases',
    name: 'dev-wallet-releases',
    component: () => import('@dev/views/DevReleasesView.vue'),
    meta: {
      title: '钱包 / 交付记录',
    },
  },
  {
    path: '/dev/wallet/withdrawals',
    name: 'dev-wallet-withdrawals',
    component: () => import('@dev/views/DevWithdrawalRecordsView.vue'),
    meta: {
      title: '钱包 / 提现记录',
    },
  },
  {
    path: '/dev/resources',
    redirect: '/dev/resources/plugins-init',
  },
  {
    path: '/dev/resources/plugins-init',
    name: 'dev-plugins',
    component: () => import('@dev/views/DevResourceInitView.vue'),
    meta: {
      title: '资源管理 / 资源初始化',
      requiresRealname: true,
    },
  },
  {
    path: '/dev/resources/list',
    name: 'dev-resource-list',
    component: () => import('@dev/views/DevResourceListView.vue'),
    meta: {
      title: '资源管理 / 资源列表',
      requiresRealname: true,
    },
  },
  {
    path: '/dev/resources/:resourceId/homepage',
    name: 'dev-resource-homepage-edit',
    component: () => import('@dev/views/DevResourceHomepageEditView.vue'),
    meta: {
      title: '资源管理 / 编辑资源主页',
      requiresRealname: true,
    },
  },
  {
    path: '/dev/resources/:resourceId/versions',
    name: 'dev-resource-versions',
    component: () => import('@dev/views/DevResourceVersionsView.vue'),
    meta: {
      title: '资源管理 / 版本管理',
      requiresRealname: true,
    },
  },
  {
    path: '/dev/requirements',
    redirect: '/dev/requirements/hall',
  },
  {
    path: '/dev/requirements/hall',
    name: 'dev-requirement-hall',
    component: () => import('@dev/views/DevRequirementHallView.vue'),
    meta: {
      title: '需求大厅 / 资源关联',
      requiresRealname: true,
    },
  },
  {
    path: '/dev/requirements/my',
    name: 'dev-my-requirements',
    component: () => import('@dev/views/DevMyRequirementsView.vue'),
    meta: {
      title: '需求大厅 / 我的需求单',
      requiresRealname: true,
    },
  },
  {
    path: '/dev/realname',
    name: 'dev-realname',
    component: () => import('@dev/views/DevRealnameView.vue'),
    meta: {
      title: '账号 / 实名认证',
    },
  },
  {
    path: '/dev/login',
    name: 'dev-login',
    component: () => import('@dev/views/DevLoginView.vue'),
    meta: {
      title: '开发者工作台',
    },
  },
  {
    path: '/dev/developer-agreement',
    name: 'developer-agreement',
    component: () => import('@dev/views/DeveloperAgreementView.vue'),
    meta: {
      title: '开发者入驻协议',
    },
  },
  {
    path: '/dev/no-access',
    name: 'dev-no-access',
    component: () => import('@dev/views/DevNoAccessView.vue'),
    meta: {
      title: '开发者权限',
    },
  },
]

export function installDevRouteGuard(router: Router) {
  router.beforeEach(async (to) => {
    if (!to.path.startsWith('/dev')) {
      return true
    }

    const auth = useAuthStore()
    auth.hydrate()

    // 在 hash 路由模式下，跨站传入的 `?sso_token=...`/`?oauth_*=...` 位于 `#` 之前，
    // 不会出现在 `to.query` 中，需要额外从 window.location.search 取一次。
    const searchParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const ssoTokenFromSearch = (searchParams?.get('sso_token') ?? '').trim()
    const oauthTokenFromSearch = (searchParams?.get('oauth_token') ?? '').trim()
    const oauthErrorFromSearch = (searchParams?.get('oauth_error') ?? '').trim()

    const ssoToken =
      (typeof to.query.sso_token === 'string' ? to.query.sso_token.trim() : '') ||
      ssoTokenFromSearch
    const oauthToken =
      (typeof to.query.oauth_token === 'string' ? to.query.oauth_token.trim() : '') ||
      oauthTokenFromSearch
    const oauthError =
      (typeof to.query.oauth_error === 'string' ? to.query.oauth_error.trim() : '') ||
      oauthErrorFromSearch

    if (
      (ssoTokenFromSearch || oauthTokenFromSearch || oauthErrorFromSearch) &&
      typeof window !== 'undefined' &&
      window.location.search
    ) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
    }

    if (ssoToken) {
      auth.setToken(ssoToken)
      const nextQuery = { ...to.query }
      delete nextQuery.sso_token
      return { path: to.path, query: nextQuery, replace: true }
    }

    if (oauthToken) {
      auth.setToken(oauthToken)
      const nextQuery = { ...to.query }
      delete nextQuery.oauth_token
      delete nextQuery.oauth_error
      return { path: to.path, query: nextQuery, replace: true }
    }

    if (oauthError && to.path !== '/dev/login') {
      if (auth.isAuthed) {
        const nextQuery = { ...to.query }
        delete nextQuery.oauth_token
        delete nextQuery.oauth_error
        return { path: to.path, query: nextQuery, replace: true }
      }
      return buildUnifiedAuthUrl('login', to.fullPath || DEV_PORTAL_URL, {
        oauth_error: oauthError,
      })
    }

    if (to.path === '/dev/login' && !auth.isAuthed) {
      return buildUnifiedAuthUrl('login', DEV_PORTAL_URL)
    }

    const publicPaths = new Set(['/dev/login', '/dev/developer-agreement'])

    if (!auth.isAuthed && !publicPaths.has(to.path)) {
      return buildUnifiedAuthUrl('login', to.fullPath || DEV_PORTAL_URL)
    }

    if (auth.isAuthed && !publicPaths.has(to.path)) {
      try {
        const hasAccess = await auth.ensureDevAccess()
        if (!hasAccess) {
          if (to.path !== '/dev/no-access') {
            return { path: '/dev/no-access', replace: true }
          }
          return true
        }
      } catch {
        // 身份校验接口异常时保留登录态，避免误登出
        return false
      }

      if (to.meta.requiresRealname && to.path !== '/dev/realname') {
        try {
          const approved = await auth.ensureRealnameApproved()
          if (!approved) {
            return {
              path: '/dev/realname',
              query: { realname_required: '1', redirect_to: to.fullPath },
              replace: true,
            }
          }
        } catch {
          // 实名校验异常时引导到实名页，不应判定为登录失效
          return {
            path: '/dev/realname',
            query: { realname_required: '1', realname_check_error: '1', redirect_to: to.fullPath },
            replace: true,
          }
        }
      }
    }

    if (auth.isAuthed && to.path === '/dev/login') {
      try {
        const hasAccess = await auth.ensureDevAccess()
        return { path: hasAccess ? '/dev/overview' : '/dev/no-access', replace: true }
      } catch {
        // 登录页下校验异常时不强制登出，保持当前页即可
        return true
      }
    }

    return true
  })
}
