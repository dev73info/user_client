const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8080'

const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
const API_BASE_URL = (rawBase && rawBase.length > 0 ? rawBase : DEFAULT_API_BASE_URL).replace(
  /\/$/,
  '',
)

export function authHeader(token: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const trimmedToken = token.trim()
  if (trimmedToken) {
    headers.Authorization = `Bearer ${trimmedToken}`
  }
  return headers
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
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
    window.location.href = '/'
    throw new Error('未登录或登录已过期，请重新登录')
  }

  if (!resp.ok) {
    throw new Error(await readErrorMessage(resp, fallbackError))
  }
  return (await resp.json()) as T
}

export async function requestVoid(
  path: string,
  init: RequestInit,
  fallbackError = '请求失败',
): Promise<void> {
  const resp = await fetch(apiUrl(path), init)
  if (resp.status === 401) {
    localStorage.removeItem('auth_token_73hub')
    window.location.href = '/'
    throw new Error('未登录或登录已过期，请重新登录')
  }

  if (!resp.ok) {
    throw new Error(await readErrorMessage(resp, fallbackError))
  }
}
