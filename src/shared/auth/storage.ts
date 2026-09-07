export const AUTH_TOKEN_STORAGE_KEY = 'auth_token_73hub'

const OBSOLETE_DEV_AUTH_TOKEN_STORAGE_KEY = 'dev_auth_token_73hub'

export function clearObsoleteAuthTokenStorage(): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.removeItem(OBSOLETE_DEV_AUTH_TOKEN_STORAGE_KEY)
}
