/**
 * 开发者工作台的全局前置守卫：登录、`/dev` 旧入口与 `devArea` 子路由统一走这里。
 *
 * 从 `router/dev.ts` 原样搬出（判定顺序、返回形态与注释都不变）：先处理跨站传来的
 * `?oauth_*`，再挡未登录、补实名与开发者资格，最后放行。
 */
import type { Router } from 'vue-router'

import { HttpError } from '@/api/http'
import { getMyRealnameVerification } from '@/api/realname'
import { useAuthStore } from '@/stores/auth'
import { DEV_PORTAL_URL, buildUnifiedAuthUrl } from '@/config/runtime'

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
