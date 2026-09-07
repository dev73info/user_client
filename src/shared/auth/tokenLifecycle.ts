import {
  getTokenExpMs,
  isTokenExpired,
  MIN_REFRESH_DELAY_MS,
  REFRESH_BEFORE_EXPIRY_MS,
  RETRY_AFTER_FAILURE_MS,
} from '@/shared/auth/token'

export type TokenRefreshControllerOptions<TokenPayload> = {
  getToken: () => string
  refreshToken: (token: string) => Promise<TokenPayload>
  applyRefreshedToken: (payload: TokenPayload) => void
  logout: () => void
  isAuthRejected?: (error: unknown) => boolean
  retryOnVisibilityFailure?: boolean
}

export function createTokenRefreshController<TokenPayload>(
  options: TokenRefreshControllerOptions<TokenPayload>,
) {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let visibilityHandler: (() => void) | null = null

  function clear() {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function shouldLogout(error: unknown, token: string): boolean {
    return isTokenExpired(token) || Boolean(options.isAuthRejected?.(error))
  }

  function schedule(currentToken?: string) {
    clear()
    const token = currentToken ?? options.getToken()
    if (!token) return

    const expMs = getTokenExpMs(token)
    const delay = Number.isFinite(expMs)
      ? Math.max(MIN_REFRESH_DELAY_MS, expMs - Date.now() - REFRESH_BEFORE_EXPIRY_MS)
      : 5 * 60 * 1000

    refreshTimer = setTimeout(async () => {
      const activeToken = options.getToken()
      if (!activeToken) return

      try {
        const payload = await options.refreshToken(activeToken)
        options.applyRefreshedToken(payload)
      } catch (error) {
        if (shouldLogout(error, activeToken)) {
          options.logout()
          return
        }

        refreshTimer = setTimeout(() => schedule(), RETRY_AFTER_FAILURE_MS)
      }
    }, delay)
  }

  function setupVisibility() {
    if (visibilityHandler || typeof document === 'undefined') return

    visibilityHandler = () => {
      const token = options.getToken()
      if (document.visibilityState !== 'visible' || !token) return

      const expMs = getTokenExpMs(token)
      if (isTokenExpired(token)) {
        options.logout()
        return
      }

      if (Number.isFinite(expMs) && expMs - Date.now() < REFRESH_BEFORE_EXPIRY_MS + 60_000) {
        clear()
        void options.refreshToken(token)
          .then((payload) => {
            options.applyRefreshedToken(payload)
          })
          .catch((error) => {
            if (shouldLogout(error, token)) {
              options.logout()
            } else if (options.retryOnVisibilityFailure !== false) {
              schedule()
            }
          })
      }
    }

    document.addEventListener('visibilitychange', visibilityHandler)
  }

  function dispose() {
    clear()
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  return {
    clear,
    schedule,
    setupVisibility,
    dispose,
  }
}
