export const DEV_PORTAL_URL = '/dev/overview'

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

  return `/dev/overview?sso_token=${encodeURIComponent(activeToken)}`
}
