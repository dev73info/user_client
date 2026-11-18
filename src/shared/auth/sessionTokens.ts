import type { Ref } from 'vue'

import type { AuthPayload } from './client'
import {
  AUTH_TOKEN_STORAGE_KEY,
  clearAuthRefreshToken,
  clearObsoleteAuthTokenStorage,
  readAuthRefreshToken,
  writeAuthRefreshToken,
} from './storage'
import { isTokenExpired } from './token'

export type SessionTokenState = {
  token: Ref<string>
  refreshToken: Ref<string>
}

/** 访问令牌与刷新令牌一起落盘，避免两个 key 出现一半新一半旧的中间态。 */
export function storeSessionTokens(
  state: SessionTokenState,
  newToken: string,
  nextRefreshToken?: string,
): void {
  state.token.value = newToken
  if (nextRefreshToken !== undefined) {
    state.refreshToken.value = nextRefreshToken
    writeAuthRefreshToken(nextRefreshToken)
  }
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, newToken)
  clearObsoleteAuthTokenStorage()
}

/** 启动时恢复一对令牌；没有访问令牌就当作未登录，并清掉孤立的刷新令牌。 */
export function restoreSessionTokens(state: SessionTokenState): boolean {
  clearObsoleteAuthTokenStorage()
  const saved = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (!saved) {
    clearAuthRefreshToken()
    return false
  }

  state.token.value = saved
  state.refreshToken.value = readAuthRefreshToken()
  return true
}

export function clearSessionTokens(state: SessionTokenState): void {
  state.token.value = ''
  state.refreshToken.value = ''
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  clearAuthRefreshToken()
  clearObsoleteAuthTokenStorage()
}

export function setStoredRefreshToken(state: SessionTokenState, value: string): void {
  state.refreshToken.value = value
  writeAuthRefreshToken(value)
}

type ExchangeOptions = {
  getToken: () => string
  getRefreshToken: () => string
  refreshToken: (token: string) => Promise<AuthPayload>
  refreshSession: (refreshToken: string) => Promise<AuthPayload>
  isAuthRejected: (error: unknown) => boolean
}

/**
 * 向服务端换一次票：有刷新令牌优先走 /auth/refresh-token（访问令牌已过期也能换）；
 * 没有刷新令牌，或刷新令牌被拒但访问令牌还有效时，回退旧接口 /auth/refresh。
 */
export function createSessionTokenExchanger(options: ExchangeOptions): () => Promise<AuthPayload> {
  return async () => {
    const sourceToken = options.getToken()
    const storedRefreshToken = options.getRefreshToken()

    if (storedRefreshToken) {
      try {
        return await options.refreshSession(storedRefreshToken)
      } catch (error) {
        if (!options.isAuthRejected(error) || !sourceToken || isTokenExpired(sourceToken)) {
          throw error
        }
      }
    }

    return options.refreshToken(sourceToken)
  }
}

/**
 * 请求层 401 续期：换票成功后落盘并返回新的访问令牌；失败返回 `null`，
 * 请求层沿用原 401。并发 401 由调用方共用同一次换票。
 */
export function createRetryRefresher(
  exchange: () => Promise<AuthPayload>,
  persist: (token: string, refreshToken?: string) => void,
): () => Promise<string | null> {
  return async () => {
    try {
      const payload = await exchange()
      persist(payload.token, payload.refresh_token)
      return payload.token
    } catch {
      return null
    }
  }
}
