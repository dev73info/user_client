/**
 * mock 层的入口：把 `globalThis.fetch` 换成一个走假数据的实现。
 *
 * 拦截点选在 fetch 而不是统一改 `src/api/*` 里的每个函数，原因是这一层是唯一的出口：
 * 所有请求最终都落到 `src/shared/api/httpClient.ts` 的 `fetch(apiUrl(path))`，
 * 换掉 fetch 就能一次覆盖 JSON、文件流（`src/api/resources.ts` 直读 body）与 SSE
 * （`src/shared/api/sse.ts` 也是 fetch + 读流），不需要动任何业务代码。
 *
 * 调用时机很关键：必须在 `installGlobalFetchLoadingTracker()` **之前**安装，
 * 否则全局加载进度条会把 mock 拦截器当成「原始 fetch」再包一层，导致计数错乱。
 */

import { normalizeBackendPath } from '@/shared/api/url'
import { clearPersistedAuthProfile } from '@/shared/auth/session'
import { AUTH_TOKEN_STORAGE_KEY } from '@/shared/auth/storage'

import { forgetMockEnabled, mockDelay, mockEnabled, mockRequestedInUrl, mockSupported } from './env'
import {
  MOCK_IDENTITIES,
  MOCK_IDENTITY_PROFILES,
  currentMockIdentity,
  currentMockProfile,
  setMockIdentity,
  type MockIdentity,
} from './identity'
import { emptyFallbackResponse, placeholderImageResponse } from './response'
import {
  canonicalKey,
  matchRoutes,
  type MockHttpMethod,
  type MockRequest,
  type MockReply,
} from './router'
import { mockRouteTables } from './routes'
import { createMockToken, parseMockToken } from './token'
import { clearUncoveredEndpoints, recordUncovered, uncoveredEndpoints } from './uncovered'
import { installMockWebSocket } from './websocket'

const DEBUG_HANDLE = '__mock'

export type MockDebugApi = {
  readonly enabled: boolean
  readonly identity: MockIdentity
  readonly identities: readonly MockIdentity[]
  readonly uncovered: readonly string[]
  setIdentity(identity: MockIdentity): void
  switchIdentity(identity?: MockIdentity): void
  disable(): void
  clearUncovered(): void
}

type MockableRuntime = typeof globalThis & {
  fetch: typeof fetch
  __mockFetchInstalled__?: boolean
  __mock?: MockDebugApi
}

function runtime(): MockableRuntime {
  return globalThis as MockableRuntime
}

/* ------------------------------------------------------------------ 会话准备 */

/**
 * 给当前身份准备好登录态。
 *
 * 为什么需要这一步：真实登录要账号密码，而开发者测试账号的明文口令在本机没有留存
 * （见 `.cursor/rules/dev-servers.mdc`）。mock 直接按身份发一个假令牌写进 localStorage，
 * 于是没有 `.env.local` 也能直接进两个工作台。
 *
 * 判定很简单：localStorage 里已经是「当前身份的 mock 令牌」就什么都不做，
 * 其余情况（没有令牌、是真实后端的令牌、是另一个身份的令牌）一律换成当前身份的。
 * 之前这里还额外记了一个「已经发过令牌」的标记用来尊重手动登出，结果踩了坑：
 * 只要有一次页面在 mock 没生效的状态下加载过（自动登录失败会清掉令牌），
 * 之后即使 mock 生效也永远补不回登录态，页面就一直停在未登录。
 * 想测未登录状态：在面板里点「退出当前账号」后不要刷新页面即可。
 */
function prepareMockSession(identity: MockIdentity): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  const existing = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''
  const subject = existing ? parseMockToken(existing) : null

  if (subject?.identity === identity) {
    return
  }

  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, createMockToken(identity))
  clearPersistedAuthProfile()
}

/* ------------------------------------------------------------------ 请求解析 */

type DescribedRequest = {
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
  return MOCK_HTTP_METHODS.includes(upper as MockHttpMethod)
    ? (upper as MockHttpMethod)
    : 'GET'
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

async function describeRequest(
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
function isMockableOrigin(url: URL): boolean {
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
function isApiPathname(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

/* ------------------------------------------------------------------ 分发 */

async function dispatch(request: MockRequest): Promise<MockReply> {
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

function toMockRequest(described: DescribedRequest): MockRequest {
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

/* ------------------------------------------------------------------ 安装 */

export function installMockFetch(): void {
  if (!mockSupported()) {
    // 生产构建（pnpm build / preview）里写 ?mock=1 不会有任何效果，
    // 明确说一句，免得以为是「开关开了但不生效」而去翻代码。
    if (mockRequestedInUrl()) {
      console.warn('[mock] 当前不是 vite dev 模式，mock 不会生效（mock 只在 pnpm dev 下可用）')
    }
    return
  }

  const target = runtime()
  if (target.__mockFetchInstalled__) {
    return
  }

  const identity = currentMockIdentity()
  prepareMockSession(identity)

  const realFetch = target.fetch.bind(globalThis)

  target.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!mockEnabled()) {
      return realFetch(input, init)
    }

    const described = await describeRequest(input, init)
    if (!described || !isMockableOrigin(described.url)) {
      return realFetch(input, init)
    }

    // 图片等上传资源在 mock 下拿不到真实文件，给一张灰色占位图，避免整页红叉。
    if (described.url.pathname.startsWith('/uploads/')) {
      await mockDelay()
      return placeholderImageResponse()
    }

    // 只有接口路径才归 mock 管。注意判断必须用原始 pathname：
    // normalizeBackendPath 会给任何路径（含 Vite 的 /@fs/、/@vite/ 内部路径）补上 /api 前缀，
    // 拿归一化后的结果判断就会把 wasm、源码模块一起拦下来。
    if (!isApiPathname(described.url.pathname)) {
      return realFetch(input, init)
    }

    const request = toMockRequest(described)
    const reply = await dispatch(request)
    if (reply) {
      return reply
    }

    recordUncovered(`${request.method} ${request.key}`)
    await mockDelay()
    return emptyFallbackResponse(request.method)
  }

  target.__mockFetchInstalled__ = true
  target[DEBUG_HANDLE] = createDebugApi()

  // 客服长连接没法用 fetch 拦截，单独换成空壳实现（只拦 /api 下的 ws，放行 Vite 的 HMR）。
  installMockWebSocket()

  // 留一行启动日志：页面出问题时先看控制台有没有这行，就能区分
  // 「mock 没生效（请求打到了真实后端）」与「mock 生效了但某个接口没实现」。
  console.info(
    `[mock] 已启用：所有 /api 请求由假后端接管，当前身份「${currentMockProfile().label}」。` +
      '左上角浮标可切换身份；关闭方式见 user-client/doc/开发指南.md 第七节。',
  )
}

export function isMockInstalled(): boolean {
  return Boolean(runtime().__mockFetchInstalled__)
}

/* ------------------------------------------------------------------ 给界面用的操作 */

/** 换身份：写进 localStorage 后整页刷新（登录态、路由守卫、首屏请求都围绕角色展开，重载最干净）。 */
export function switchMockIdentity(identity?: MockIdentity): void {
  const next = identity ?? currentMockIdentity()
  setMockIdentity(next)

  if (typeof window === 'undefined') {
    return
  }

  // 地址上的 ?mockAs=dev 优先级高于 localStorage，不清掉的话点切换器会「切不动」
  // （写完 localStorage 一刷新又被参数覆盖回去）。
  const search = new URLSearchParams(window.location.search)
  if (search.has('mockAs')) {
    search.delete('mockAs')
    const query = search.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    )
  }

  window.location.reload()
}

/** 关掉 mock，回到真实后端（需要真实后端在 8080 上跑着）。 */
export function disableMock(): void {
  forgetMockEnabled()

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    clearPersistedAuthProfile()
  }

  console.info('[mock] 已关闭，刷新后回到真实后端（需要 8080 上跑着后端）')

  if (typeof window !== 'undefined') {
    window.location.reload()
  }
}

function createDebugApi(): MockDebugApi {
  return {
    get enabled() {
      return mockEnabled()
    },
    get identity() {
      return currentMockIdentity()
    },
    get identities() {
      return MOCK_IDENTITIES
    },
    get uncovered() {
      return uncoveredEndpoints.value
    },
    setIdentity: setMockIdentity,
    switchIdentity: switchMockIdentity,
    disable: disableMock,
    clearUncovered: clearUncoveredEndpoints,
  }
}

/** 身份与用户名信息，供身份切换器展示。 */
export function currentMockIdentityLabel(): string {
  const profile = currentMockProfile()
  return `${profile.label}（${profile.username}）`
}

export { MOCK_IDENTITY_PROFILES }
