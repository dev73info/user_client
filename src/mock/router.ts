/**
 * mock 的路由表与匹配器。
 *
 * 路由的 key 用的是「后端真实路径」——和 `src/shared/api/url.ts` 归一化之后的写法一致，
 * 例如 src/api 里写的 `/requirements/mine` 会被别名为 `/api/requirement/mine`。
 * 注册时把声明的路径同样过一遍别名规则，所以 handler 里可以直接照抄 src/api 的字面量，
 * 不需要自己推算别名，两边不会漂移。
 */

import { normalizeBackendPath } from '@/shared/api/url'

import type { MockIdentity } from './identity'

export type MockHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type MockRequest = {
  method: MockHttpMethod
  /** 归一化后的后端真实路径（含 /api 前缀），形如 /api/requirement/mine */
  path: string
  /** 去掉 /api 前缀与末尾斜杠的路径，路由表的键 */
  key: string
  query: URLSearchParams
  url: URL
  headers: Headers
  /** Authorization 头里的令牌（已去掉 Bearer 前缀） */
  token: string
  identity: MockIdentity
  /** 请求体：JSON 已解析；FormData 时为 null 并把 isFormData 置真 */
  body: unknown
  rawBody: string
  isFormData: boolean
}

/** 返回 null 表示「这条路由不处理这个请求」，交给后面的路由继续匹配。 */
export type MockReply = Response | null

export type MockHandler = (
  request: MockRequest,
  params: Record<string, string>,
) => MockReply | Promise<MockReply>

export type MockRoute = {
  method: MockHttpMethod | '*'
  /** 路径写法与 src/api 里一致即可（可带 query 作说明用，匹配时会忽略） */
  path: string
  /** 这个接口的用途，出问题时报出来方便定位 */
  note?: string
  handler: MockHandler
}

export type CompiledRoute = {
  method: string
  pattern: readonly string[]
  handler: MockHandler
  note: string
  /** 注册时的原始路径，日志用 */
  source: string
}

/** 把路径归一化成路由表的键：反复过别名规则直到稳定，再剥掉 /api、去掉末尾斜杠。 */
export function canonicalKey(pathOrUrl: string): string {
  const pathOnly = pathOrUrl.split('?')[0]?.split('#')[0] ?? '/'
  let normalized = normalizeBackendPath(pathOnly)

  // 别名会串联：`/public/requirements/x` 先变成 `/requirements/x`，再变成 `/requirement/x`。
  // 请求进来时路径本身已经是后端真实路径，只过一遍就停在中间态，于是与声明的路径匹配不上。
  // 迭代到不动点两边才一致（别名表最长链是两跳，留三跳余量足够）。
  for (let round = 0; round < 3; round += 1) {
    const next = normalizeBackendPath(normalized)
    if (next === normalized) {
      break
    }
    normalized = next
  }

  const withoutApi = normalized === '/api' ? '' : normalized.replace(/^\/api/, '')
  const trimmed = withoutApi.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function splitSegments(path: string): string[] {
  return path.split('/').filter(Boolean)
}

export function compileRoutes(routes: readonly MockRoute[]): CompiledRoute[] {
  return routes.map((route) => ({
    method: route.method.toUpperCase(),
    pattern: splitSegments(canonicalKey(route.path)),
    handler: route.handler,
    note: route.note ?? '',
    source: route.path,
  }))
}

function matchSegments(
  pattern: readonly string[],
  actual: readonly string[],
): Record<string, string> | null {
  if (pattern.length !== actual.length) {
    return null
  }

  const params: Record<string, string> = {}

  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index] ?? ''
    const value = actual[index] ?? ''

    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(value)
      continue
    }

    if (expected !== value) {
      return null
    }
  }

  return params
}

export type RouteMatch = {
  params: Record<string, string>
  route: CompiledRoute
}

export type MockRouteTable = {
  name: string
  routes: readonly CompiledRoute[]
}

/** 把一组路由声明编译成路由表。注册路径会过一遍别名规则（见本文件顶部说明）。 */
export function defineRouteTable(name: string, routes: readonly MockRoute[]): MockRouteTable {
  return { name, routes: compileRoutes(routes) }
}

export function matchRoutes(
  routes: readonly CompiledRoute[],
  request: MockRequest,
): RouteMatch | null {
  const actual = splitSegments(request.key)

  for (const route of routes) {
    if (route.method !== '*' && route.method !== request.method) {
      continue
    }

    const params = matchSegments(route.pattern, actual)
    if (params) {
      return { params, route }
    }
  }

  return null
}
