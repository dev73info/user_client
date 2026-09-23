import type { RouteLocationRaw, RouteRecordRaw, Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getMyRealnameVerification } from '@/api/realname'
import { HttpError } from '@/api/http'
import { DEV_PORTAL_URL, buildUnifiedAuthUrl } from '@/config/runtime'

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

export const devWorkbenchRoutes: RouteRecordRaw[] = [
  {
    path: 'developer/overview',
    name: 'dev-overview',
    // 开发概览（DevOverviewView）已废弃：开发者入口统一指向资源初始化。
    redirect: { name: 'dev-plugins' },
    meta: {
      title: '开发概览',
      description: '账户实名、资源、需求和交付入口。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    // 开发者工作台首页：接单收入、保证金、接单与交付概览。
    // 刻意不带 requiresRealname —— 落地页若要求实名，未实名的开发者一进来就被弹去认证，看不到任何概览数据。
    path: 'developer/home',
    name: 'dev-home',
    component: () => import('@/views/DevHomeView.vue'),
    meta: {
      title: '工作台总览',
      description: '接单收入、保证金与交付概览。',
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
    component: () => import('@/views/DevWalletView.vue'),
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
    component: () => import('@/views/DevReleasesView.vue'),
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
    redirect: { name: 'dev-wallet' },
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
    component: () => import('@/views/DevResourceInitView.vue'),
    meta: {
      title: '创建资源',
      description: '创建插件、工具或服务资源并提交审核。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/resources/list',
    name: 'dev-resource-list',
    component: () => import('@/views/DevResourceListView.vue'),
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
    component: () => import('@/views/DevResourceHomepageEditView.vue'),
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
    component: () => import('@/views/DevResourceVersionsView.vue'),
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
    component: () => import('@/views/DevRequirementHallView.vue'),
    meta: {
      title: '需求大厅 / 资源关联',
      description: '浏览可接需求并绑定开发资源。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/requirements/hall/:requirementId',
    name: 'dev-requirement-detail',
    component: () => import('@/views/DevRequirementDetailView.vue'),
    meta: {
      title: '需求大厅 / 接取需求',
      description: '查看需求单详情并关联或初始化开发资源。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/requirements/my',
    name: 'dev-my-requirements',
    component: () => import('@/views/DevMyRequirementsView.vue'),
    meta: {
      title: '需求大厅 / 我的需求单',
      description: '查看已关联需求、签署状态和沟通会话。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  // 团队服务从用户工作台整体移入开发者工作台：侧边栏模式下路由需带 devArea，否则进页会切回用户菜单
  {
    path: 'developer/teams',
    name: 'workbench-teams',
    component: () => import('@/views/TeamsView.vue'),
    meta: {
      title: '我的团队',
      description: '查看和管理团队',
      devArea: true,
    },
  },
  {
    path: 'developer/teams/:teamId',
    name: 'workbench-team-detail',
    component: () => import('@/views/TeamDetailView.vue'),
    meta: {
      title: '团队详情',
      description: '团队信息、成员管理',
      devArea: true,
    },
  },
  {
    path: 'developer/team-resources',
    name: 'workbench-team-resources',
    component: () => import('@/views/TeamResourcesView.vue'),
    meta: {
      title: '团队资源项目',
      description: '管理团队共享资源项目',
      devArea: true,
    },
  },
  // 消息中心用户端也要用，用户端路由留在用户区；这里是开发者工作台的入口，
  // 带上 devArea 才不会被侧边栏当成用户页面、一点就切回用户工作台。
  {
    path: 'developer/messages',
    name: 'dev-messages',
    component: () => import('@/views/MessagesView.vue'),
    meta: {
      title: '消息中心',
      description: '查看需求会话与沟通记录。',
      devArea: true,
    },
  },
  // 工单中心同理：开发者侧边栏也有这一条，带 devArea 才不会把侧边栏切回用户菜单，
  // 页面自身也据此走开发者体系的读数条与卡片（见 TicketCenterView 的 isDevWorkbench）。
  {
    path: 'developer/tickets',
    name: 'dev-tickets',
    component: () => import('@/views/TicketCenterView.vue'),
    meta: {
      title: '工单中心',
      description: '提交问题与查看客服回复。',
      devArea: true,
    },
  },
  {
    path: 'developer/realname',
    redirect: { name: 'workbench-realname' },
  },
  {
    path: 'developer/no-access',
    name: 'dev-no-access',
    component: () => import('@/views/DevNoAccessView.vue'),
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
    redirect: { name: 'dev-plugins' },
  },
  {
    path: '/dev/overview',
    redirect: { name: 'dev-plugins' },
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
    path: '/dev/requirements/hall/:requirementId',
    redirect: redirectToDevWorkbench('dev-requirement-detail'),
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
    redirect: { name: 'dev-plugins' },
  },
  {
    path: '/dev/developer-agreement',
    name: 'developer-agreement',
    component: () => import('@/views/DeveloperAgreementView.vue'),
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

    // 在 hash 路由模式下，跨站传入的 `?oauth_*=...` 位于 `#` 之前，
    // 不会出现在 `to.query` 中，需要额外从 window.location.search 取一次。
    const searchParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const oauthTokenFromSearch = (searchParams?.get('oauth_token') ?? '').trim()
    const oauthErrorFromSearch = (searchParams?.get('oauth_error') ?? '').trim()

    const oauthToken =
      (typeof to.query.oauth_token === 'string' ? to.query.oauth_token.trim() : '') ||
      oauthTokenFromSearch
    const oauthError =
      (typeof to.query.oauth_error === 'string' ? to.query.oauth_error.trim() : '') ||
      oauthErrorFromSearch

    if (
      (oauthTokenFromSearch || oauthErrorFromSearch) &&
      typeof window !== 'undefined' &&
      window.location.search
    ) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
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

    if (auth.isAuthed && !publicPaths.has(to.path) && to.meta.requiresRealname) {
      try {
        const verification = await getMyRealnameVerification(auth.token)
        if (verification.status !== 'approved') {
          return {
            name: 'workbench-realname',
            query: { redirect_to: to.fullPath },
            replace: true,
          }
        }
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          return {
            name: 'workbench-realname',
            query: { redirect_to: to.fullPath },
            replace: true,
          }
        }
        return false
      }
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
    }

    if (auth.isAuthed && to.path === '/dev/login') {
      try {
        const hasAccess = await auth.ensureDevAccess()
        return { name: hasAccess ? 'dev-plugins' : 'dev-no-access', replace: true }
      } catch {
        // 登录页下校验异常时不强制登出，保持当前页即可
        return true
      }
    }

    return true
  })
}
