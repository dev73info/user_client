const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''
const API_BASE_URL = rawBase.replace(/\/$/, '')
let unauthorizedRedirecting = false

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

  if (!contentType.includes('application/json')) {
    if (isHtmlResponse(text)) {
      throw new Error(`${fallbackError}：接口返回了 HTML 页面，请检查 API 地址或代理配置`)
    }
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${fallbackError}：接口返回了无效的 JSON`)
  }
}

export function authHeader(token: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const trimmedToken = token.trim()
  if (trimmedToken) {
    headers.Authorization = `Bearer ${trimmedToken}`
  }
  return headers
}

export function authHeaders(token: string, headers: HeadersInit = {}): Headers {
  const merged = new Headers(headers)
  const bearer = authHeader(token).Authorization
  if (bearer) {
    merged.set('Authorization', bearer)
  }
  return merged
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export async function readErrorMessage(resp: Response, fallback: string): Promise<string> {
  try {
    const text = await resp.text()
    return text || fallback
  } catch {
    return fallback
  }
}

export async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackError = '请求失败',
): Promise<T> {
  const resp = await fetch(apiUrl(path), init)
  if (resp.status === 401) {
    localStorage.removeItem('auth_token_73hub')
    if (!unauthorizedRedirecting) {
      unauthorizedRedirecting = true
      const isHistoryMode = import.meta.env.VITE_ROUTER_MODE === 'history'
      const normalizedPath = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : `${window.location.pathname}/`
      const target = isHistoryMode ? normalizedPath : `${normalizedPath}#/`
      window.location.replace(target)
    }
    throw new HttpError(401, '未登录或登录已过期，请重新登录')
  }

  if (!resp.ok) {
    throw new HttpError(resp.status, await readErrorMessage(resp, fallbackError))
  }
  return parseJsonResponse<T>(resp, fallbackError)
}

export async function requestVoid(
  path: string,
  init: RequestInit,
  fallbackError = '请求失败',
): Promise<void> {
  const resp = await fetch(apiUrl(path), init)
  if (resp.status === 401) {
    localStorage.removeItem('auth_token_73hub')
    if (!unauthorizedRedirecting) {
      unauthorizedRedirecting = true
      const isHistoryMode = import.meta.env.VITE_ROUTER_MODE === 'history'
      const normalizedPath = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : `${window.location.pathname}/`
      const target = isHistoryMode ? normalizedPath : `${normalizedPath}#/`
      window.location.replace(target)
    }
    throw new HttpError(401, '未登录或登录已过期，请重新登录')
  }

  if (!resp.ok) {
    throw new HttpError(resp.status, await readErrorMessage(resp, fallbackError))
  }
}
