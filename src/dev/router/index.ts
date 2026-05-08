import type { RouteLocationRaw, RouteRecordRaw, Router } from 'vue-router'
import { useAuthStore } from '@dev/stores/auth'
import { DEV_PORTAL_URL, buildUnifiedAuthUrl } from '@/config/runtime'

const DEV_OVERVIEW_SECTION_HASH = '#developer-overview'

function redirectToDevWorkbench(
  name: string,
): (to: { params: unknown; query: unknown; hash: string }) => RouteLocationRaw {
  return (to) => ({
    name,
    params: to.params as Record<string, string | string[]>,
    query: to.query as Record<string, string | string[]>,
    hash: to.hash,
  })
}

function redirectToDeveloperOverviewSection(to: { query: unknown }): RouteLocationRaw {
  return {
    name: 'workbench',
    query: to.query as Record<string, string | string[]>,
    hash: DEV_OVERVIEW_SECTION_HASH,
  }
}

export const devWorkbenchRoutes: RouteRecordRaw[] = [
  {
    path: 'developer/overview',
    name: 'dev-overview',
    redirect: redirectToDeveloperOverviewSection,
    meta: {
      title: '开发概览',
      description: '账户实名、资源、需求和交付入口。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    path: 'developer/wallet',
    redirect: { name: 'dev-wallet' },
  },
  {
    path: 'developer/wallet/order-deposit',
    redirect: { name: 'dev-wallet' },
  },
  {
    path: 'developer/wallet/overview',
    name: 'dev-wallet',
    component: () => import('@dev/views/DevWalletView.vue'),
    meta: {
      title: '钱包 / 我的余额',
      description: '查看开发者余额、保证金和结算信息。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    path: 'developer/wallet/releases',
    name: 'dev-wallet-releases',
    component: () => import('@dev/views/DevReleasesView.vue'),
    meta: {
      title: '钱包 / 交付记录',
      description: '查看资源版本交付与收入记录。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    path: 'developer/wallet/withdrawals',
    name: 'dev-wallet-withdrawals',
    component: () => import('@dev/views/DevWithdrawalRecordsView.vue'),
    meta: {
      title: '钱包 / 提现记录',
      description: '查看开发者提现申请和处理状态。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    path: 'developer/resources',
    redirect: { name: 'dev-plugins' },
  },
  {
    path: 'developer/resources/plugins-init',
    name: 'dev-plugins',
    component: () => import('@dev/views/DevResourceInitView.vue'),
    meta: {
      title: '资源管理 / 资源初始化',
      description: '创建插件、工具或服务资源并提交审核。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/resources/list',
    name: 'dev-resource-list',
    component: () => import('@dev/views/DevResourceListView.vue'),
    meta: {
      title: '资源管理 / 资源列表',
      description: '管理已创建资源、主页和版本。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/resources/:resourceId/homepage',
    name: 'dev-resource-homepage-edit',
    component: () => import('@dev/views/DevResourceHomepageEditView.vue'),
    meta: {
      title: '资源管理 / 编辑资源主页',
      description: '维护资源介绍、展示内容和发布信息。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/resources/:resourceId/versions',
    name: 'dev-resource-versions',
    component: () => import('@dev/views/DevResourceVersionsView.vue'),
    meta: {
      title: '资源管理 / 版本管理',
      description: '维护资源版本、文件和交付状态。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/requirements',
    redirect: { name: 'dev-requirement-hall' },
  },
  {
    path: 'developer/requirements/hall',
    name: 'dev-requirement-hall',
    component: () => import('@dev/views/DevRequirementHallView.vue'),
    meta: {
      title: '需求大厅 / 资源关联',
      description: '浏览可接需求并绑定开发资源。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/requirements/my',
    name: 'dev-my-requirements',
    component: () => import('@dev/views/DevMyRequirementsView.vue'),
    meta: {
      title: '需求大厅 / 我的需求单',
      description: '查看已关联需求、签署状态和沟通会话。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/realname',
    redirect: { name: 'workbench-realname' },
  },
  {
    path: 'developer/no-access',
    name: 'dev-no-access',
    component: () => import('@dev/views/DevNoAccessView.vue'),
    meta: {
      title: '开发者权限',
      description: '当前账号还没有开发者访问权限。',
      devArea: true,
    },
  },
]

export const devRoutes: RouteRecordRaw[] = [
  {
    path: '/dev',
    redirect: redirectToDeveloperOverviewSection,
  },
  {
    path: '/dev/overview',
    redirect: redirectToDeveloperOverviewSection,
  },
  {
    path: '/dev/wallet',
    redirect: redirectToDevWorkbench('dev-wallet'),
  },
  {
    path: '/dev/wallet/order-deposit',
    redirect: redirectToDevWorkbench('dev-wallet'),
  },
  {
    path: '/dev/wallet/overview',
    redirect: redirectToDevWorkbench('dev-wallet'),
  },
  {
    path: '/dev/wallet/releases',
    redirect: redirectToDevWorkbench('dev-wallet-releases'),
  },
  {
    path: '/dev/wallet/withdrawals',
    redirect: redirectToDevWorkbench('dev-wallet-withdrawals'),
  },
  {
    path: '/dev/resources',
    redirect: redirectToDevWorkbench('dev-plugins'),
  },
  {
    path: '/dev/resources/plugins-init',
    redirect: redirectToDevWorkbench('dev-plugins'),
  },
  {
    path: '/dev/resources/list',
    redirect: redirectToDevWorkbench('dev-resource-list'),
  },
  {
    path: '/dev/resources/:resourceId/homepage',
    redirect: redirectToDevWorkbench('dev-resource-homepage-edit'),
  },
  {
    path: '/dev/resources/:resourceId/versions',
    redirect: redirectToDevWorkbench('dev-resource-versions'),
  },
  {
    path: '/dev/requirements',
    redirect: redirectToDevWorkbench('dev-requirement-hall'),
  },
  {
    path: '/dev/requirements/hall',
    redirect: redirectToDevWorkbench('dev-requirement-hall'),
  },
  {
    path: '/dev/requirements/my',
    redirect: redirectToDevWorkbench('dev-my-requirements'),
  },
  {
    path: '/dev/realname',
    redirect: redirectToDevWorkbench('workbench-realname'),
  },
  {
    path: '/dev/login',
    redirect: redirectToDeveloperOverviewSection,
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
    redirect: redirectToDevWorkbench('dev-no-access'),
  },
]

export function installDevRouteGuard(router: Router) {
  router.beforeEach(async (to) => {
    const isLegacyDevRoute = to.path.startsWith('/dev')
    const isWorkbenchDevRoute = to.matched.some((record) => Boolean(record.meta.devArea))

    if (!isLegacyDevRoute && !isWorkbenchDevRoute) {
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

    if (auth.isAuthed && !publicPaths.has(to.path) && to.meta.requiresDevAccess) {
      try {
        const hasAccess = await auth.ensureDevAccess()
        if (!hasAccess) {
          if (to.name !== 'dev-no-access') {
            return { name: 'dev-no-access', replace: true }
          }
          return true
        }
      } catch {
        // 身份校验接口异常时保留登录态，避免误登出
        return false
      }

      if (to.meta.requiresRealname) {
        try {
          const approved = await auth.ensureRealnameApproved()
          if (!approved) {
            return {
              name: 'workbench-realname',
              query: { realname_required: '1', redirect_to: to.fullPath },
              replace: true,
            }
          }
        } catch {
          // 实名校验异常时引导到实名页，不应判定为登录失效
          return {
            name: 'workbench-realname',
            query: { realname_required: '1', realname_check_error: '1', redirect_to: to.fullPath },
            replace: true,
          }
        }
      }
    }

    if (auth.isAuthed && to.path === '/dev/login') {
      try {
        const hasAccess = await auth.ensureDevAccess()
        return { name: hasAccess ? 'dev-overview' : 'dev-no-access', replace: true }
      } catch {
        // 登录页下校验异常时不强制登出，保持当前页即可
        return true
      }
    }

    return true
  })
}
