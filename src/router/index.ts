import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { applyTheme } from 'ui_73info'
import { useAuthStore } from '@/stores/auth'
import { getMyRealnameVerification } from '@/api/realname'
import { HttpError } from '@/api/http'
import { devRoutes, devWorkbenchRoutes, installDevRouteGuard } from '@/router/dev'
import { normalizePromoCode } from '@/shared/resourceSale'
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
  promoCode: string | null = null,
): string {
  if (redirectTo) {
    return redirectTo
  }

  if (shareType === 'requirement' && targetId) {
    return `/requirement-hall?requirement_id=${encodeURIComponent(targetId)}`
  }

  if (['resource', 'portfolio'].includes(shareType) && /^\d+$/.test(targetId)) {
    // R029：分享短链的路径参数就是推广者的邀请码。短链落到资源详情时把它作为 `?promo=` 带下去，
    // 与后端 302 的落地形态一致（`.../resources/resource--<id>?promo=<码>`），两条路都要能归因。
    const promoQuery = promoCode ? `?promo=${encodeURIComponent(promoCode)}` : ''
    return `/resources/resource--${targetId}${promoQuery}`
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
      // 「资源项目」：原来是「免费资源」「付费资源」两个导航项，现在合并成一项，
      // 免费 / 付费在同一页内用分段控件切换（写 `?sale=`，见 ResourceCatalogView）。
      path: '/resources',
      name: 'resources',
      component: () => import('@/views/ResourcesView.vue'),
    },
    {
      // 旧地址兼容：带上对应分区重定向到「资源项目」，不做成 404 / 白屏。
      path: '/free-resources',
      name: 'free-resources',
      redirect: (to) => ({ name: 'resources', query: { ...to.query, sale: 'free' }, hash: to.hash }),
    },
    {
      path: '/paid-resources',
      name: 'paid-resources',
      redirect: (to) => ({ name: 'resources', query: { ...to.query, sale: 'paid' }, hash: to.hash }),
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
      // R034 接口资源收银台：开发者站点带一次性票据跳进来，换票后即为登录态。
      path: '/checkout',
      name: 'api-resource-checkout',
      component: () => import('@/views/ApiResourceCheckoutView.vue'),
      meta: {
        title: '收银台',
        hideSiteFooter: true,
      },
    },
    {
      // R039 OAuth 2.0 授权页：开发者站点把买家带过来，登录 / 注册并同意后回跳。
      path: '/oauth/authorize',
      name: 'oauth-authorize',
      component: () => import('@/views/OAuthAuthorizeView.vue'),
      meta: {
        title: '授权登录',
        hideSiteFooter: true,
      },
    },
    {
      // 「我的邀请」已并入「勋章与邀请」页（`/workbench/badges`）：别名同样落到合并页。
      path: '/invite',
      name: 'invite',
      redirect: { name: 'workbench-badges' },
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
          return buildPublicShareRedirectPath(shareType, targetId, redirectTo, normalizePromoCode(code))
        }

        // 注册分支：不带推广码（推广分成只在下单时归因，与注册落地无关）
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
          // 「我的邀请」已与「我的徽章墙」合并成一页（见下方 badges 路由），本路径保留为跳转：
          // 老书签、站内旧链接与首页「立即邀请」入口都还指着它，不能 404。
          path: 'invite',
          name: 'workbench-invite',
          redirect: { name: 'workbench-badges' },
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
          // 「勋章与邀请」：徽章墙原是从「我的邀请」页底搬出来单独成页的，
          // 现在两件事合成同一页（徽章墙一块 + 邀请一块），菜单也只留这一条入口。
          path: 'badges',
          name: 'workbench-badges',
          component: () => import('@/views/BadgeCenterView.vue'),
          meta: {
            title: '勋章与邀请',
            description: '查看与佩戴徽章、邀请好友并查看邀请记录',
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
      // 独立资源详情页已废弃：详情在资源列表页内就地渲染（`?resource=<id>`，见 ResourceCatalogView）。
      // 这条地址保留为轻量重定向（旧链接 / 站外链接 / sitemap 详情页的 JS 引导），
      // 解析出资源编号后 replace 到页内详情态，任何历史地址都不 404。
      path: '/resources/:resourceSlug',
      name: 'resource-detail-direct',
      component: () => import('@/views/ResourceDetailRedirectView.vue'),
    },
    {
      path: '/:rootSlug/:entrySlug?',
      name: 'resource-catalog',
      component: () => import('@/views/ResourceCatalogView.vue'),
    },
    {
      // 三段式旧详情地址（`/<根分区>/<子分区>/<作者>--<id>`）同样只做重定向：
      // 分类段沿用地址里的，重定向时补上 `?resource=`（售卖类型按资源自身数据推）。
      path: '/:rootSlug/:entrySlug/:resourceSlug',
      name: 'resource-detail',
      component: () => import('@/views/ResourceDetailRedirectView.vue'),
    },
    {
      // 兜底路由：匹配不到任何路由的地址落到这里，渲染「页面不存在」而不是只剩页头页脚的空壳
      // （见 任务/缺陷/BUG-009）。必须放在路由表最后：前面的 `/:rootSlug/:entrySlug?` 与
      // `/:rootSlug/:entrySlug/:resourceSlug` 是按段数贪婪匹配的，放在它们之前会把正常页面一起吃掉。
      //
      // 覆盖范围只有「任何上表路由都匹配不上」的地址，主要是四段及以上的路径（例如沿用了旧式
      // 的四段资源链接）。一至三段的未知路径仍会先被上面两条目录 / 详情路由接走。
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: '页面不存在' },
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

  const hasCheckoutTicket =
    typeof to.query.ticket === 'string' && to.query.ticket.trim().length > 0

  const authRequired =
    to.path.startsWith('/workbench') ||
    to.path.startsWith('/invite') ||
    to.name === 'profile' ||
    to.name === 'messages' ||
    // 支付页默认要登录；微信 handoff / 资源购买中间页（token 在 query）放行
    (to.name === 'payment' &&
      !isWechatPaymentHandoff(to.query) &&
      !isResourceWechatMiddlePage(to.query)) ||
    // R034 收银台：带一次性票据时无需登录（票据换 JWT）；不带票据按普通页面要求登录
    (to.name === 'api-resource-checkout' && !hasCheckoutTicket) ||
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
