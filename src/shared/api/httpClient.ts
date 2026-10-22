import { apiUrl, backendFileUrl, normalizeBackendPath } from './url'
import { HttpError, readErrorShape } from './httpError'

export { apiUrl, backendFileUrl, normalizeBackendPath }
export { HttpError } from './httpError'
export type { ApiErrorShape } from './httpError'
export { readErrorMessage, readErrorShape, toApiErrorShape } from './httpError'

export type UnauthorizedHandler = (response: Response, path: string) => void

export type HttpClientOptions = {
  onUnauthorized?: UnauthorizedHandler
}

function isHtmlResponse(body: string): boolean {
  const trimmed = body.trim().toLowerCase()
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')
}

async function parseJsonResponse<T>(resp: Response, fallbackError: string): Promise<T> {
  const text = await resp.text()
  const contentType = resp.headers.get('content-type')?.toLowerCase() ?? ''

  if (!text) {
    throw new Error(`${fallbackError}：接口未返回内容`)
  }

  if (!contentType.includes('application/json') && isHtmlResponse(text)) {
    throw new Error(`${fallbackError}：接口返回了 HTML 页面，请检查 API 地址或代理配置`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${fallbackError}：接口返回了无效的 JSON`)
  }
}

export function authHeader(token: string): Record<string, string> {
  const trimmedToken = token.trim()
  if (!trimmedToken) {
    return {}
  }

  return {
    Authorization: `Bearer ${trimmedToken}`,
  }
}

export function authHeaders(token: string, headers: HeadersInit = {}): Headers {
  const merged = new Headers(headers)
  const bearer = authHeader(token).Authorization
  if (bearer) {
    merged.set('Authorization', bearer)
  }
  return merged
}

function withoutCredentials(init: RequestInit): RequestInit {
  return {
    ...init,
    credentials: 'omit',
  }
}

export function createHttpClient(options: HttpClientOptions = {}) {
  function handleUnauthorized(resp: Response, path: string) {
    if (resp.status === 401) {
      options.onUnauthorized?.(resp, path)
    }
  }

  /** 失败时按统一错误结构抛：JSON 错误体按 `{code,message,field?}` 取，纯文本按原文 + `HTTP_<status>` 兜底。 */
  async function throwHttpError(resp: Response, fallbackError: string): Promise<never> {
    const shape = await readErrorShape(resp, fallbackError)
    throw new HttpError(resp.status, shape.message, shape.code, shape.field)
  }

  async function requestJson<T>(
    path: string,
    init: RequestInit,
    fallbackError = '请求失败',
  ): Promise<T> {
    const resp = await fetch(apiUrl(path), withoutCredentials(init))
    handleUnauthorized(resp, path)

    if (!resp.ok) {
      await throwHttpError(resp, fallbackError)
    }

    if (resp.status === 204 || resp.status === 205) {
      return undefined as T
    }

    return parseJsonResponse<T>(resp, fallbackError)
  }

  async function requestText(
    path: string,
    init: RequestInit,
    fallbackError = '请求失败',
  ): Promise<string> {
    const resp = await fetch(apiUrl(path), withoutCredentials(init))
    handleUnauthorized(resp, path)

    if (!resp.ok) {
      await throwHttpError(resp, fallbackError)
    }

    return resp.text()
  }

  async function requestVoid(
    path: string,
    init: RequestInit,
    fallbackError = '请求失败',
  ): Promise<void> {
    const resp = await fetch(apiUrl(path), withoutCredentials(init))
    handleUnauthorized(resp, path)

    if (!resp.ok) {
      await throwHttpError(resp, fallbackError)
    }
  }

  /** 文件下载：附件、凭证图这类按二进制取。 */
  async function requestBlob(
    path: string,
    init: RequestInit,
    fallbackError = '请求失败',
  ): Promise<Blob> {
    const resp = await fetch(apiUrl(path), withoutCredentials(init))
    handleUnauthorized(resp, path)

    if (!resp.ok) {
      await throwHttpError(resp, fallbackError)
    }

    return resp.blob()
  }

  return {
    requestJson,
    requestText,
    requestVoid,
    requestBlob,
  }
}
