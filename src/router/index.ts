import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { applyTheme } from 'ui_73info'
import { useAuthStore } from '@/stores/auth'
import { getMyRealnameVerification } from '@/api/realname'
import { HttpError } from '@/api/http'
import { devRoutes, devWorkbenchRoutes, installDevRouteGuard } from '@/router/dev'
import { isResourceWechatMiddlePage, isWechatPaymentHandoff } from '@/utils/wechatPayment'

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
      path: '/paid-resources',
      name: 'paid-resources',
      component: () => import('@/views/PaidResourcesView.vue'),
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
      redirect: { name: 'workbench-badges' },
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
            title: '我的需求',
            description: '查看支付、交付与验收进度',
          },
        },
        {
          path: 'invoices',
          name: 'workbench-invoices',
          component: () => import('@/views/InvoiceCenterView.vue'),
          meta: {
            title: '我的发票',
            description: '获取发票、查看与下载发票',
          },
        },
        {
          path: 'signatures',
          name: 'workbench-signatures',
          component: () => import('@/views/MySignaturesView.vue'),
          meta: { title: '我的合同', requiresRealname: true },
        },
        {
          path: 'signatures/:contractId(\\d+)',
          name: 'workbench-signature-detail',
          component: () => import('@/views/ContractSignView.vue'),
          meta: { title: '我的合同 / 合同详情', requiresRealname: true },
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
          // 「我的背包」下的四页：积分中心（余额、打赏、明细）、权益中心、优惠券中心、我的徽章墙。
          // 路径 workbench/points 沿用原「我的背包」那一条，老书签仍然落到积分中心。
          path: 'points',
          name: 'workbench-points',
          component: () => import('@/views/PointsCenterView.vue'),
          meta: {
            title: '积分中心',
            description: '查看积分余额、打赏与明细',
          },
        },
        {
          path: 'perks',
          name: 'workbench-perks',
          component: () => import('@/views/PerksCenterView.vue'),
          meta: {
            title: '权益中心',
            description: '管理已解锁的权益与用户名颜色',
          },
        },
        {
          path: 'coupons',
          name: 'workbench-coupons',
          component: () => import('@/views/CouponCenterView.vue'),
          meta: {
            title: '优惠券中心',
            description: '查看券包并复制券码',
          },
        },
        {
          path: 'favorites',
          name: 'workbench-favorites',
          component: () => import('@/views/MyFavoritesView.vue'),
          meta: {
            title: '我的收藏',
            description: '查看收藏的社区帖子',
          },
        },
        {
          path: 'resource-purchases',
          name: 'workbench-resource-purchases',
          component: () => import('@/views/MyResourcePurchasesView.vue'),
          meta: {
            title: '我的已购资源',
            description: '查看已购数字化资源（退款由卖家或平台发起）',
          },
        },
        // 团队服务已并入开发者工作台（路由见 router/dev.ts 的 devWorkbenchRoutes），旧路径保留重定向
        { path: 'teams', redirect: { name: 'workbench-teams' } },
        {
          path: 'teams/:teamId',
          redirect: (to) => ({
            name: 'workbench-team-detail',
            params: to.params as Record<string, string | string[]>,
          }),
        },
        { path: 'team-resources', redirect: { name: 'workbench-team-resources' } },
        {
          path: 'invite',
          name: 'workbench-invite',
          component: () => import('@/views/InviteView.vue'),
          meta: {
            title: '我的邀请',
            description: '邀请码、邀请记录与排行榜',
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
          // 徽章墙从「我的邀请」页底搬出来独立成页：邀请记录与徽章是两件事，读数条口径也不同。
          path: 'badges',
          name: 'workbench-badges',
          component: () => import('@/views/BadgeCenterView.vue'),
          meta: {
            title: '我的徽章墙',
            description: '查看与佩戴获得的徽章',
          },
        },
        {
          // 系统通知：三类系统消息（评论警告、历史沟通公开申请、平台公告）聚合展示。
          // 开发者工作台另有 dev-notifications（见 router/dev.ts），同一个页面、各自一条路由。
          path: 'notifications',
          name: 'workbench-notifications',
          component: () => import('@/views/NotificationCenterView.vue'),
          meta: {
            title: '系统通知',
            description: '平台公告、评论警告与待确认事项',
          },
        },
        {
          path: 'messages',
          name: 'workbench-messages',
          component: () => import('@/views/MessagesView.vue'),
        },
        {
          // 「我的定制」已并入「我的需求」：旧路径保留为跳转，避免收藏夹与站外链接 404。
          path: 'resources',
          redirect: { name: 'workbench-requirements' },
        },
        {
          path: 'tickets',
          name: 'workbench-tickets',
          component: () => import('@/views/TicketCenterView.vue'),
        },
        {
          path: 'realname',
          name: 'workbench-realname',
          redirect: (to) => ({
            name: 'workbench-account',
            query: to.query,
            hash: to.hash,
          }),
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
      redirect: { name: 'workbench-requirements' },
    },
    {
      path: '/tickets',
      name: 'tickets',
      redirect: { name: 'workbench-tickets' },
    },
    {
      path: '/realname',
      name: 'realname',
      redirect: (to) => ({
        name: 'workbench-account',
        query: to.query,
        hash: to.hash,
      }),
    },
    {
      path: '/coupon-claim',
      name: 'coupon-claim',
      component: () => import('@/views/CouponClaimView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
    },
    {
      path: '/points-mall',
      name: 'points-mall',
      component: () => import('@/views/MallView.vue'),
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

  const isDeveloperRoute =
    to.path.startsWith('/dev') || to.matched.some((record) => Boolean(record.meta.devArea))

  // ui_73info 的主题跟着「这套页面属于哪套视觉体系」走：开发者工作台是 dev、其余是门户
  // （两套体系的划分见 doc/设计规范.md 第一节；判据直接复用上一行，不另立一条规则）。
  //
  // 放在路由守卫里而不是各页面自己调：主题是写在 `<html>` 上的属性，一个页面写错会连累
  // 它下面的所有 `T*` 组件。放在这里还有一个好处——它比页面渲染早，切路由时不会先看到
  // 前一页的主题闪一下。
  applyTheme(isDeveloperRoute ? 'dev' : 'portal')

  if (isDeveloperRoute) {
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
    // 支付页默认要登录；微信 handoff / 资源购买中间页（token 在 query）放行
    (to.name === 'payment' &&
      !isWechatPaymentHandoff(to.query) &&
      !isResourceWechatMiddlePage(to.query)) ||
    to.name === 'tickets' ||
    to.name === 'contract-sign' ||
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

  if (auth.isAuthed && to.meta.requiresRealname) {
    try {
      const verification = await getMyRealnameVerification(auth.token)
      if (verification.status !== 'approved') {
        return next({ name: 'workbench-realname', query: { redirect_to: to.fullPath }, replace: true })
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return next({ name: 'workbench-realname', query: { redirect_to: to.fullPath }, replace: true })
      }
      return next(false)
    }
  }

  return next()
})

installDevRouteGuard(router)

export default router
