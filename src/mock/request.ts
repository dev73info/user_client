/** mock 的请求解析与分发：把 fetch 的入参归一成 MockRequest，再按路由表分派。 */

import { normalizeBackendPath } from '@/shared/api/url'

import { currentMockIdentity } from './identity'
import {
  canonicalKey,
  matchRoutes,
  type MockHttpMethod,
  type MockRequest,
  type MockReply,
} from './router'
import { mockRouteTables } from './routes'

/* ------------------------------------------------------------------ 请求解析 */

export type DescribedRequest = {
  url: URL
  method: MockHttpMethod
  headers: Headers
  rawBody: string
  body: unknown
  isFormData: boolean
}

const MOCK_HTTP_METHODS: readonly MockHttpMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']

function toMockMethod(raw: string): MockHttpMethod {
  const upper = raw.toUpperCase()
  return MOCK_HTTP_METHODS.includes(upper as MockHttpMethod) ? (upper as MockHttpMethod) : 'GET'
}

function parseJsonBody(raw: string): unknown {
  if (!raw.trim()) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export async function describeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<DescribedRequest | null> {
  let rawUrl = ''
  let method = init?.method ?? ''
  let headers = new Headers(init?.headers)

  if (typeof input === 'string') {
    rawUrl = input
  } else if (input instanceof URL) {
    rawUrl = input.toString()
  } else if (typeof Request !== 'undefined' && input instanceof Request) {
    rawUrl = input.url
    if (!method) {
      method = input.method
    }
    if (!init?.headers) {
      headers = new Headers(input.headers)
    }
  } else {
    return null
  }

  let url: URL
  try {
    url = new URL(rawUrl, typeof window === 'undefined' ? undefined : window.location.origin)
  } catch {
    return null
  }

  const body = init?.body
  let rawBody = ''
  let parsedBody: unknown = null
  let isFormData = false

  if (typeof body === 'string') {
    rawBody = body
    parsedBody = parseJsonBody(body)
  } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
    isFormData = true
    // 文件上传类接口（资源版本、头像、营业执照）走 multipart，handler 只需要其中的文本字段：
    // 把它摊成普通对象，文件字段丢掉（mock 不存文件）。
    const fields: Record<string, string> = {}
    for (const [key, value] of body.entries()) {
      if (typeof value === 'string') {
        fields[key] = value
      }
    }
    parsedBody = fields
  } else if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    rawBody = body.toString()
    parsedBody = Object.fromEntries(body.entries())
  }

  return {
    url,
    method: toMockMethod(method || 'GET'),
    headers,
    rawBody,
    body: parsedBody,
    isFormData,
  }
}

/** 只接管本站请求：外链、CDN、第三方地址一律放行给真实 fetch。 */
export function isMockableOrigin(url: URL): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  if (url.origin === window.location.origin) {
    return true
  }

  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (!apiBase) {
    return false
  }

  try {
    return url.origin === new URL(apiBase, window.location.origin).origin
  } catch {
    return false
  }
}

function readToken(headers: Headers): string {
  const raw = headers.get('Authorization') ?? ''
  return raw.replace(/^Bearer\s+/i, '').trim()
}

/**
 * 这个原始路径是不是后端接口。
 *
 * 前端所有接口都经 `/api` 前缀发出（见 `src/shared/api/url.ts`），
 * Vite 自己的内部路径（`/@vite/`、`/@fs/`、`/node_modules/`）与静态资源都不带这个前缀。
 */
export function isApiPathname(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

/* ------------------------------------------------------------------ 分发 */

export async function dispatch(request: MockRequest): Promise<MockReply> {
  for (const table of mockRouteTables) {
    const matched = matchRoutes(table.routes, request)
    if (!matched) {
      continue
    }

    const reply = await matched.route.handler(request, matched.params)
    if (reply) {
      return reply
    }
  }

  return null
}

export function toMockRequest(described: DescribedRequest): MockRequest {
  const path = normalizeBackendPath(described.url.pathname)

  return {
    method: described.method,
    path,
    key: canonicalKey(described.url.pathname),
    query: described.url.searchParams,
    url: described.url,
    headers: described.headers,
    token: readToken(described.headers),
    identity: currentMockIdentity(),
    body: described.body,
    rawBody: described.rawBody,
    isFormData: described.isFormData,
  }
}
