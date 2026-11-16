import {
  apiUrl,
  authHeader,
  authHeaders,
  backendFileUrl,
  createHttpClient,
  HttpError,
  normalizeBackendPath,
  readErrorMessage,
  readErrorShape,
  toApiErrorShape,
} from '@/shared/api/httpClient'
import { dispatchAuthUnauthorized } from '@/shared/api/authEvents'
import { requestSessionRefresh } from '@/shared/auth/sessionRefresh'

export {
  apiUrl,
  authHeader,
  authHeaders,
  backendFileUrl,
  HttpError,
  normalizeBackendPath,
  readErrorMessage,
  readErrorShape,
  toApiErrorShape,
}
export type { ApiErrorShape } from '@/shared/api/httpClient'

function shouldRedirectOnUnauthorized(path: string): boolean {
  const normalizedPath = normalizeBackendPath(path).split('?')[0] ?? path
  const authPath = normalizedPath.startsWith('/api/')
    ? normalizedPath.slice('/api'.length)
    : normalizedPath
  // 登录 / 注册 / 重置密码是公开接口，401 是「凭据不对」而不是会话失效。
  // 换票接口的 401 由 token 生命周期自己处理（静默登出或回退旧接口），
  // 广播出去会在回退之前就把用户登出，也会把「刷新令牌过期」误当成页面会话失效。
  return !new Set([
    '/auth/login',
    '/auth/login/authenticator',
    '/auth/register',
    '/auth/reset-password',
    '/auth/refresh',
    '/auth/refresh-token',
  ]).has(authPath)
}

const httpClient = createHttpClient({
  onUnauthorized(resp, path) {
    if (!shouldRedirectOnUnauthorized(path)) {
      return
    }

    const message = '未登录或登录已过期，请重新登录'
    dispatchAuthUnauthorized({ status: resp.status, path, message })
    throw new HttpError(401, message)
  },
  async refreshAccessToken(path) {
    // 公开接口与换票接口的 401 不是会话失效，不触发续期。
    if (!shouldRedirectOnUnauthorized(path)) {
      return null
    }
    return requestSessionRefresh()
  },
})

export const { requestJson, requestText, requestVoid, requestBlob } = httpClient
