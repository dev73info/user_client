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
      redirect: { name: 'workbench-invite' },
    },
    {
      path: '/badges',
      name: 'badges',
      redirect: { name: 'workbench-badges' },
    },
    {
      path: '/user/:username/badges',
      name: 'user-badges',
      component: () => import('@/views/UserBadgesView.vue'),
    },
    {
      path: '/r/:code',
      name: 'invite-short-link-fallback',
      redirect: (to) => {
        const code = String(to.params.code ?? '').trim()
        const query: Record<string, string> = /^[A-Za-z0-9]{1,32}$/.test(code)
          ? { modal: 'auth', mode: 'register', invite_code: code }
          : {}
        const shareType = typeof to.query.share_type === 'string' ? to.query.share_type.trim() : ''
        const targetId = typeof to.query.target_id === 'string' ? to.query.target_id.trim() : ''
        const redirectTo = typeof to.query.redirect_to === 'string' ? to.query.redirect_to.trim() : ''

        if (['requirement', 'portfolio', 'resource', 'community_post'].includes(shareType)) {
          query.share_type = shareType
        }
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
          path: 'invite',
          name: 'workbench-invite',
          component: () => import('@/views/InviteView.vue'),
          meta: {
            title: '邀请成长',
            description: '邀请码、统计与排行',
          },
        },
        {
          path: 'badges',
          name: 'workbench-badges',
          component: () => import('@/views/BadgesView.vue'),
          meta: {
            title: '徽章墙',
            description: '查看徽章收集进度',
          },
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
