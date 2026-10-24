/**
 * 门户的全局前置守卫：SPA 兜底回跳、主题切换、`?oauth_*` 承接、登录与实名校验。
 *
 * 从 `router/index.ts` 原样搬出（判定顺序、返回形态与注释都不变）。开发者侧的守卫在
 * `router/dev/guard.ts`，两者都装到同一个 router 上，安装顺序不变（门户在前、开发者在后）。
 */
import type { Router } from 'vue-router'
import { applyTheme } from 'ui_73info'

import { HttpError } from '@/api/http'
import { getMyRealnameVerification } from '@/api/realname'
import { useAuthStore } from '@/stores/auth'
import { isResourceWechatMiddlePage, isWechatPaymentHandoff } from '@/utils/wechatPayment'

/** SPA 兜底重定向的参数名：只有 history 模式带它时才生效。 */
const SPA_FALLBACK_REDIRECT_PARAM = '__spa_redirect'

function takeSpaFallbackRedirect(): string {
  if (typeof window === 'undefined' || import.meta.env.VITE_ROUTER_MODE !== 'history') {
    return ''
  }

  const target =
    new URLSearchParams(window.location.search).get(SPA_FALLBACK_REDIRECT_PARAM)?.trim() ?? ''

  if (!target || !target.startsWith('/') || target.startsWith('//')) {
    return ''
  }
  if (target.startsWith('/api/') || target.startsWith('/uploads/')) {
    return ''
  }

  return target
}

/** 模块加载时取一次：地址栏里的兜底参数只在首屏算一次，之后由守卫自己清掉。 */
let pendingSpaFallbackRedirect = takeSpaFallbackRedirect()

export function installPortalRouteGuard(router: Router) {
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
          return next({
            name: 'workbench-realname',
            query: { redirect_to: to.fullPath },
            replace: true,
          })
        }
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          return next({
            name: 'workbench-realname',
            query: { redirect_to: to.fullPath },
            replace: true,
          })
        }
        return next(false)
      }
    }

    return next()
  })
}
