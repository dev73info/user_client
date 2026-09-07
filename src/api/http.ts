import {
  apiUrl,
  authHeader,
  authHeaders,
  backendFileUrl,
  createHttpClient,
  HttpError,
  normalizeBackendPath,
  readErrorMessage,
} from '@/shared/api/httpClient'
import { dispatchAuthUnauthorized } from '@/shared/api/authEvents'

export {
  apiUrl,
  authHeader,
  authHeaders,
  backendFileUrl,
  HttpError,
  normalizeBackendPath,
  readErrorMessage,
}

function shouldRedirectOnUnauthorized(path: string): boolean {
  const normalizedPath = normalizeBackendPath(path).split('?')[0] ?? path
  const authPath = normalizedPath.startsWith('/api/')
    ? normalizedPath.slice('/api'.length)
    : normalizedPath
  return !new Set(['/auth/login', '/auth/register', '/auth/reset-password']).has(authPath)
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
})

export const { requestJson, requestText, requestVoid } = httpClient
