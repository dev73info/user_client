// 开发者入口：必须是 devArea + requiresDevAccess 路由（/workbench/developer/resources/plugins-init），
// 这样登录后重定向/点击入口会触发 dev 路由守卫中的 ensureDevAccess → requestDevRole，
// 从而授予开发者角色并刷新 profile。
// ⚠️ 不能直接用 /workbench#developer-overview：它只匹配 workbench 路由（个人工作台），
//    不会触发 dev 守卫，开发者角色申请不会执行。
// ⚠️ dev-overview（开发概览）页面已废弃，开发者入口统一指向资源初始化（dev-plugins）。
export const DEV_PORTAL_URL = '/workbench/developer/resources/plugins-init'

const USER_AUTH_TOKEN_KEY = 'auth_token_73hub'

function normalizeInternalPath(path?: string): string {
  const normalized = path?.trim() ?? ''

  if (!normalized || !normalized.startsWith('/') || normalized.startsWith('//')) {
    return ''
  }

  return normalized
}

export function buildUnifiedAuthUrl(
  mode: 'login' | 'register' | 'reset' = 'login',
  redirectTo = DEV_PORTAL_URL,
  extraQuery: Record<string, string | undefined> = {},
): string {
  const query = new URLSearchParams({ modal: 'auth', mode })
  const normalizedRedirect = normalizeInternalPath(redirectTo)

  if (normalizedRedirect) {
    query.set('redirect_to', normalizedRedirect)
  }

  for (const [key, value] of Object.entries(extraQuery)) {
    if (value?.trim()) {
      query.set(key, value.trim())
    }
  }

  return `/?${query.toString()}`
}

export function buildDevPortalUrl(token?: string): string {
  const directToken = token?.trim() ?? ''
  const persistedToken =
    typeof window !== 'undefined'
      ? (window.localStorage.getItem(USER_AUTH_TOKEN_KEY) ?? '').trim()
      : ''
  const activeToken = directToken || persistedToken

  if (!activeToken) {
    return buildUnifiedAuthUrl('login', DEV_PORTAL_URL)
  }

  return DEV_PORTAL_URL
}
