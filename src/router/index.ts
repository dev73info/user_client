import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { devRoutes, devWorkbenchRoutes, installDevRouteGuard } from '@dev/router'

const SPA_FALLBACK_REDIRECT_PARAM = '__spa_redirect'

const routerHistory =
  import.meta.env.VITE_ROUTER_MODE === 'history'
    ? createWebHistory(import.meta.env.BASE_URL)
    : createWebHashHistory(import.meta.env.BASE_URL)

function takeSpaFallbackRedirect(): string {
  if (typeof window === 'undefined' || import.meta.env.VITE_ROUTER_MODE !== 'history') {
    return ''
  }

  const target = new URLSearchParams(window.location.search)
    .get(SPA_FALLBACK_REDIRECT_PARAM)
    ?.trim()
    ?? ''

  if (!target || !target.startsWith('/') || target.startsWith('//')) {
    return ''
  }
  if (target.startsWith('/api/') || target.startsWith('/uploads/')) {
    return ''
  }

  return target
}

let pendingSpaFallbackRedirect = takeSpaFallbackRedirect()

function buildPublicShareRedirectPath(
  shareType: string,
  targetId: string,
  redirectTo: string,
): string {
  if (redirectTo) {
    return redirectTo
  }

  if (shareType === 'requirement' && targetId) {
    return `/requirement-hall?requirement_id=${encodeURIComponent(targetId)}`
  }

  if (['resource', 'portfolio'].includes(shareType) && /^\d+$/.test(targetId)) {
    return `/resources/resource--${targetId}`
  }

  if (shareType === 'community_post' && /^\d+$/.test(targetId)) {
    return `/community/posts/${targetId}`
  }

  return '/'
}

const router = createRouter({
  history: routerHistory,
  routes: [
    ...devRoutes,
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/free-resources',
      name: 'free-resources',
      component: () => import('@/views/FreeResourcesView.vue'),
    },
    {
      path: '/requirement-hall',
      name: 'requirement-hall',
      component: () => import('@/views/RequirementHallView.vue'),
    },
    {
      path: '/community',
      name: 'community',
      component: () => import('@/views/CommunityView.vue'),
    },
    {
      path: '/community/posts/:postId',
      name: 'community-post',
      component: () => import('@/views/CommunityView.vue'),
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/SearchResultsView.vue'),
    },
    {
      path: '/payment',
      name: 'payment',
      component: () => import('@/views/PaymentView.vue'),
    },
    {
      path: '/invite',
      name: 'invite',
      redirect: { name: 'workbench-invite' },
    },
    {
      path: '/invite/leaderboard',
      name: 'invite-leaderboard',
      redirect: { name: 'workbench-invite-leaderboard' },
    },
    {
      path: '/badges',
      name: 'badges',
      redirect: { name: 'workbench-invite', hash: '#badges' },
    },
    {
      path: '/user/:username/badges',
      name: 'user-badges',
      component: () => import('@/views/UserBadgesView.vue'),
    },
    {
      path: '/user/:username/profile',
      name: 'dev-profile',
      component: () => import('@/views/DevProfileView.vue'),
      meta: {
        title: '开发者主页',
        description: '查看开发者的公开资源与徽章',
      },
    },
    {
      path: '/team/:teamId',
      name: 'team-profile',
      component: () => import('@/views/TeamProfileView.vue'),
      meta: {
        title: '团队主页',
        description: '查看团队的公开资源',
      },
    },
    {
      path: '/r/:code',
      name: 'invite-short-link-fallback',
      redirect: (to) => {
        const code = String(to.params.code ?? '').trim()
        const shareType = typeof to.query.share_type === 'string' ? to.query.share_type.trim() : ''
        const targetId = typeof to.query.target_id === 'string' ? to.query.target_id.trim() : ''
        const redirectTo = typeof to.query.redirect_to === 'string' ? to.query.redirect_to.trim() : ''

        if (['requirement', 'portfolio', 'resource', 'community_post'].includes(shareType)) {
          return buildPublicShareRedirectPath(shareType, targetId, redirectTo)
        }

        const query: Record<string, string> = /^[A-Za-z0-9]{1,32}$/.test(code)
          ? { modal: 'auth', mode: 'register', invite_code: code }
          : {}
        if (targetId && /^[A-Za-z0-9_-]{1,64}$/.test(targetId)) {
          query.share_target_id = targetId
        }
        if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
          query.redirect_to = redirectTo
        }
        return { name: 'home', query }
      },
    },
    {
      path: '/profile',
      name: 'profile',
      redirect: { name: 'workbench' },
    },
    {
      path: '/workbench',
      component: () => import('@/views/UserWorkbenchView.vue'),
      meta: {
        hideSiteFooter: true,
      },
      children: [
        {
          path: '',
          name: 'workbench',
          component: () => import('@/views/ProfileView.vue'),
        },
        {
          path: 'requirements',
          name: 'workbench-requirements',
          component: () => import('@/views/MyRequirementsView.vue'),
          meta: {
            title: '我的需求单',
            description: '查看支付、交付与验收进度',
          },
        },
        {
          path: 'account',
          name: 'workbench-account',
          component: () => import('@/views/AccountCouponsView.vue'),
          meta: {
            title: '账户与优惠券',
            description: '管理账户资料、安全设置与优惠券',
          },
        },
        {
          path: 'teams',
          name: 'workbench-teams',
          component: () => import('@/views/TeamsView.vue'),
          meta: {
            title: '我的团队',
            description: '查看和管理团队',
          },
        },
        {
          path: 'teams/:teamId',
          name: 'workbench-team-detail',
          component: () => import('@/views/TeamDetailView.vue'),
          meta: {
            title: '团队详情',
            description: '团队信息、成员管理',
          },
        },
        {
          path: 'team-resources',
          name: 'workbench-team-resources',
          component: () => import('@/views/TeamResourcesView.vue'),
          meta: {
            title: '团队资源项目',
            description: '管理团队共享资源项目',
          },
        },
        {
          path: 'invite',
          name: 'workbench-invite',
          component: () => import('@/views/InviteView.vue'),
          meta: {
            title: '我的邀请',
            description: '邀请码、统计与徽章',
          },
        },
        {
          path: 'invite/leaderboard',
          name: 'workbench-invite-leaderboard',
          component: () => import('@/views/InviteLeaderboardView.vue'),
          meta: {
            title: '邀请排行榜',
            description: '查看周榜与总榜',
          },
        },
        {
          path: 'badges',
          name: 'workbench-badges',
          redirect: { name: 'workbench-invite', hash: '#badges' },
        },
        {
          path: 'messages',
          name: 'workbench-messages',
          component: () => import('@/views/MessagesView.vue'),
        },
        {
          path: 'resources',
          name: 'workbench-resources',
          component: () => import('@/views/MyCustomResourcesView.vue'),
        },
        {
          path: 'tickets',
          name: 'workbench-tickets',
          component: () => import('@/views/TicketCenterView.vue'),
        },
        {
          path: 'realname',
          name: 'workbench-realname',
          component: () => import('@/views/RealnameView.vue'),
        },
        ...devWorkbenchRoutes,
      ],
    },
    {
      path: '/messages',
      name: 'messages',
      component: () => import('@/views/MessagesView.vue'),
      meta: {
        hideSiteFooter: true,
      },
    },
    {
      path: '/my-custom-resources',
      name: 'my-custom-resources',
      redirect: { name: 'workbench-resources' },
    },
    {
      path: '/tickets',
      name: 'tickets',
      redirect: { name: 'workbench-tickets' },
    },
    {
      path: '/realname',
      name: 'realname',
      redirect: { name: 'workbench-realname' },
    },
    {
      path: '/coupon-claim',
      name: 'coupon-claim',
      component: () => import('@/views/CouponClaimView.vue'),
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('@/views/TermsView.vue'),
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('@/views/PrivacyPolicyView.vue'),
    },
    {
      path: '/payment-refund',
      name: 'payment-refund',
      component: () => import('@/views/PaymentRefundView.vue'),
    },
    {
      path: '/contract-sign',
      name: 'contract-sign',
      component: () => import('@/views/ContractSignView.vue'),
    },
    {
      path: '/resources/:resourceSlug',
      name: 'resource-detail-direct',
      component: () => import('@/views/ResourceDetailView.vue'),
    },
    {
      path: '/:rootSlug/:entrySlug?',
      name: 'resource-catalog',
      component: () => import('@/views/ResourceCatalogView.vue'),
    },
    {
      path: '/:rootSlug/:entrySlug/:resourceSlug',
      name: 'resource-detail',
      component: () => import('@/views/ResourceDetailView.vue'),
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  if (pendingSpaFallbackRedirect && to.fullPath !== pendingSpaFallbackRedirect) {
    const target = pendingSpaFallbackRedirect
    pendingSpaFallbackRedirect = ''
    return next(target)
  }

  if (to.path.startsWith('/dev')) {
    return next()
  }

  const auth = useAuthStore()
  auth.hydrate()

  const searchParams = new URLSearchParams(window.location.search)
  const oauthTokenFromSearch = (searchParams.get('oauth_token') ?? '').trim()
  const oauthErrorFromSearch = (searchParams.get('oauth_error') ?? '').trim()
  const oauthTokenFromQuery =
    typeof to.query.oauth_token === 'string' ? to.query.oauth_token.trim() : ''
  const oauthErrorFromQuery =
    typeof to.query.oauth_error === 'string' ? to.query.oauth_error.trim() : ''
  const oauthToken = oauthTokenFromQuery || oauthTokenFromSearch
  const oauthError = oauthErrorFromQuery || oauthErrorFromSearch

  if ((oauthTokenFromSearch || oauthErrorFromSearch) && window.location.search) {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
  }

  if (oauthToken) {
    auth.setToken(oauthToken)
    const nextQuery = { ...to.query }
    delete nextQuery.oauth_token
    delete nextQuery.oauth_error
    return next({ path: to.path, query: nextQuery, replace: true })
  }

  if (oauthError) {
    if (auth.isAuthed) {
      const nextQuery = { ...to.query }
      delete nextQuery.oauth_token
      delete nextQuery.oauth_error
      return next({ path: to.path, query: nextQuery, replace: true })
    }
    // 已经在 home 且带有 auth modal 参数时，直接放行让 HomeView 处理错误提示并清理 query，
    // 否则会因 query 中仍带 oauth_error 再次触发本分支，导致无限重定向。
    if (to.name === 'home' && to.query.modal === 'auth') {
      return next()
    }
    return next({
      name: 'home',
      query: { modal: 'auth', mode: 'login', oauth_error: oauthError },
      replace: true,
    })
  }

  const authRequired =
    to.path.startsWith('/workbench') ||
    to.path.startsWith('/invite') ||
    to.name === 'profile' ||
    to.name === 'messages' ||
    to.name === 'payment' ||
    to.name === 'my-custom-resources' ||
    to.name === 'tickets' ||
    to.name === 'realname'

  if (auth.isAuthed && !auth.profileLoaded) {
    try {
      await auth.initializeSession()
    } catch {
      if (authRequired) {
        return next({ name: 'home' })
      }
    }
  }

  if (authRequired && !auth.isAuthed) {
    return next({ name: 'home' })
  }

  return next()
})

installDevRouteGuard(router)

export default router
