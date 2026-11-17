import type { LocationQuery, LocationQueryRaw, RouteLocationRaw } from 'vue-router'

const AUTH_MODAL_QUERY_KEYS = ['modal', 'mode', 'redirect_to'] as const
const AUTH_QUERY_KEYS = [
  ...AUTH_MODAL_QUERY_KEYS,
  'invite_code',
  'share_type',
  'share_target_id',
] as const

/** 登录回跳只接受站内相对地址，与登录弹窗 `redirect_to` 的既有口径一致。 */
export function isSafeAuthRedirect(raw: unknown): raw is string {
  if (typeof raw !== 'string') {
    return false
  }
  const value = raw.trim()
  return value.startsWith('/') && !value.startsWith('//')
}

/** 保留当前页面的业务参数，只替换登录弹窗自己的三个 query。 */
export function buildAuthModalQuery(
  query: LocationQuery,
  mode: 'login' | 'register' | 'reset',
  redirectTo = '',
): LocationQueryRaw {
  const next: LocationQueryRaw = { ...query }
  for (const key of AUTH_MODAL_QUERY_KEYS) {
    delete next[key]
  }
  next.modal = 'auth'
  next.mode = mode
  if (isSafeAuthRedirect(redirectTo)) {
    next.redirect_to = redirectTo.trim()
  }
  return next
}

/** 关闭登录弹窗时只清登录相关参数，保留页面自己的 `resource` / `sale` 等 query。 */
export function stripAuthQuery(query: LocationQuery): LocationQueryRaw {
  const next: LocationQueryRaw = { ...query }
  for (const key of AUTH_QUERY_KEYS) {
    delete next[key]
  }
  return next
}

/** 登录完成后的落点：优先 `redirect_to`，否则回当前页面并清掉登录参数。 */
export function resolveAuthReturn(route: {
  path: string
  query: LocationQuery
  hash: string
}): RouteLocationRaw {
  if (isSafeAuthRedirect(route.query.redirect_to)) {
    return route.query.redirect_to.trim()
  }
  return {
    path: route.path,
    query: stripAuthQuery(route.query),
    hash: route.hash,
  }
}
