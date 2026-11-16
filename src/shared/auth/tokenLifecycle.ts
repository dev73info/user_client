import {
  getTokenExpMs,
  isTokenExpired,
  MIN_REFRESH_DELAY_MS,
  REFRESH_BEFORE_EXPIRY_MS,
  RETRY_AFTER_FAILURE_MS,
} from '@/shared/auth/token'

export type TokenRefreshControllerOptions<TokenPayload> = {
  getToken: () => string
  /** 刷新令牌（新会话才有；升级前的老会话只存了访问令牌）。 */
  getRefreshToken?: () => string
  /** 旧接口：用访问令牌换新令牌（`POST /auth/refresh`）。 */
  refreshToken: (token: string) => Promise<TokenPayload>
  /** 新接口：用刷新令牌换新令牌（`POST /auth/refresh-token`）。 */
  refreshSession?: (refreshToken: string) => Promise<TokenPayload>
  applyRefreshedToken: (payload: TokenPayload, sourceToken: string) => void
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

  function hasRefreshToken(): boolean {
    return Boolean(options.refreshSession && options.getRefreshToken?.())
  }

  /**
   * 优先用刷新令牌换票；升级前的老会话没有刷新令牌，回退到旧接口。
   * 刷新令牌被服务端拒绝（401 / 403）但访问令牌还没过期时，也用旧接口兜底一次。
   */
  async function exchangeTokens(): Promise<TokenPayload> {
    const activeToken = options.getToken()
    const storedRefreshToken = options.getRefreshToken?.() ?? ''

    if (storedRefreshToken && options.refreshSession) {
      try {
        return await options.refreshSession(storedRefreshToken)
      } catch (error) {
        if (!options.isAuthRejected?.(error) || !activeToken || isTokenExpired(activeToken)) {
          throw error
        }
      }
    }

    if (!activeToken) {
      throw new Error('缺少可换票的令牌')
    }

    return options.refreshToken(activeToken)
  }

  /** 只有服务端明确拒绝才登出；网络错误留给下面的 30 秒重试。 */
  function shouldLogout(error: unknown): boolean {
    return Boolean(options.isAuthRejected?.(error))
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
        const payload = await exchangeTokens()
        if (options.getToken() !== activeToken) return
        options.applyRefreshedToken(payload, activeToken)
      } catch (error) {
        if (options.getToken() !== activeToken) return
        if (shouldLogout(error)) {
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
      const expired = isTokenExpired(token)
      const nearExpiry =
        Number.isFinite(expMs) && expMs - Date.now() < REFRESH_BEFORE_EXPIRY_MS + 60_000

      if (!expired && !nearExpiry) return

      if (expired && !hasRefreshToken()) {
        // 访问令牌已过期、又没有刷新令牌：旧接口救不回来，静默登出。
        options.logout()
        return
      }

      clear()
      void exchangeTokens()
        .then((payload) => {
          if (options.getToken() !== token) return
          options.applyRefreshedToken(payload, token)
        })
        .catch((error) => {
          if (options.getToken() !== token) return
          if (shouldLogout(error)) {
            options.logout()
          } else if (options.retryOnVisibilityFailure !== false) {
            schedule()
          }
        })
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
