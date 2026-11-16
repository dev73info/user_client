export const AUTH_TOKEN_STORAGE_KEY = 'auth_token_73hub'
/** 刷新令牌：只能用于 `/auth/refresh-token` 换票，不能当访问令牌用。 */
export const AUTH_REFRESH_TOKEN_STORAGE_KEY = 'auth_refresh_token_73hub'

const OBSOLETE_DEV_AUTH_TOKEN_STORAGE_KEY = 'dev_auth_token_73hub'

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readAuthRefreshToken(): string {
  if (!hasStorage()) {
    return ''
  }

  return localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY) ?? ''
}

export function writeAuthRefreshToken(token: string): void {
  if (!hasStorage()) {
    return
  }

  if (!token) {
    localStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)
    return
  }

  localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, token)
}

export function clearAuthRefreshToken(): void {
  if (!hasStorage()) {
    return
  }

  localStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)
}

export function clearObsoleteAuthTokenStorage(): void {
  if (!hasStorage()) {
    return
  }

  localStorage.removeItem(OBSOLETE_DEV_AUTH_TOKEN_STORAGE_KEY)
}
