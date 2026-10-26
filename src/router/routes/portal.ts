/**
 * 门户主路由：首页、资源、需求大厅、社区、支付与收银台、开发者与团队公开页、
 * `/r/:code` 分享短链，以及 `/profile` 这一条旧地址的跳转。
 *
 * 路由表按域拆分（R047）后各模块只声明自己的条目；先后顺序仍按原 `index.ts` 里的排布，
 * 汇总见 `routes/index.ts`（顺序影响 `getRoutes()` 产出与匹配优先级，不能重排）。
 */
import type { RouteRecordRaw } from 'vue-router'

import { normalizePromoCode } from '@/shared/resourceSale'

/** `/r/:code` 分享短链落到哪一页：只有 `redirect_to` 缺省时才按分享类型推断。 */
export function buildPublicShareRedirectPath(
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

export const portalRoutes: RouteRecordRaw[] = [
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
    redirect: (to) => ({
      name: 'resources',
      query: { ...to.query, sale: 'free' },
      hash: to.hash,
    }),
  },
  {
    path: '/paid-resources',
    name: 'paid-resources',
    redirect: (to) => ({
      name: 'resources',
      query: { ...to.query, sale: 'paid' },
      hash: to.hash,
    }),
  },
  {
    path: '/requirement-hall',
    name: 'requirement-hall',
    component: () => import('@/views/RequirementHallView.vue'),
  },
  {
    // 社区必须留在通用 `/:rootSlug/:entrySlug?` 资源路由之前。
    path: '/community',
    name: 'community',
    component: () => import('@/views/CommunityListView.vue'),
    meta: { title: '社区' },
  },
  {
    path: '/community/posts/:id',
    name: 'community-post',
    component: () => import('@/views/CommunityPostDetailView.vue'),
    meta: { title: '社区帖子' },
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
    path: '/user/:username/profile',
    name: 'dev-profile',
    component: () => import('@/views/DevProfileView.vue'),
    meta: {
      title: '开发者主页',
      description: '查看开发者的公开资源',
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
        return buildPublicShareRedirectPath(
          shareType,
          targetId,
          redirectTo,
          normalizePromoCode(code),
        )
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
]
