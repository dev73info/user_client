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

import { mockDelay, mockEnabled, mockRequestedInUrl, mockSupported } from './env'
import { MOCK_IDENTITY_PROFILES, currentMockIdentity, currentMockProfile } from './identity'
import { createDebugApi, type MockDebugApi } from './controls'
import { prepareMockSession } from './session'
import {
  describeRequest,
  isApiPathname,
  isMockableOrigin,
  toMockRequest,
  dispatch,
} from './request'
import { emptyFallbackResponse, placeholderImageResponse } from './response'
import { recordUncovered } from './uncovered'
import { installMockWebSocket } from './websocket'

const DEBUG_HANDLE = '__mock'

type MockableRuntime = typeof globalThis & {
  fetch: typeof fetch
  __mockFetchInstalled__?: boolean
  __mock?: MockDebugApi
}

function runtime(): MockableRuntime {
  return globalThis as MockableRuntime
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

  // mock 关着就什么都不做：不装 fetch / WebSocket 替身，不写假令牌，也不打「已启用」日志。
  // 以前这里是无条件安装的，于是「关掉 mock」会留下三处副作用：假令牌把真实登录态冲掉
  // （刷新后必 401 并弹出登录框）、后端 ws 长连接被换成空壳、控制台照样打印「已启用」把人误导回去。
  // 需要开的时候整页刷新重跑 main.ts 会再进来一次，不存在「装早了」的问题。
  if (!mockEnabled()) {
    return
  }

  prepareMockSession(currentMockIdentity())

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

  // 后端 ws 长连接没法用 fetch 拦截，单独换成空壳实现（只拦 /api 下的 ws，放行 Vite 的 HMR）。
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

export { currentMockIdentityLabel, disableMock, switchMockIdentity } from './controls'
export type { MockDebugApi } from './controls'
export { MOCK_IDENTITY_PROFILES }
