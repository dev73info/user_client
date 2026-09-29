import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMockFetch } from '@/mock/index'

const TOKEN_KEY = 'auth_token_73hub'

type MockRuntime = typeof globalThis & {
  __mockFetchInstalled__?: boolean
  __mockWebSocketInstalled__?: boolean
  __mock?: unknown
}

function mockRuntime(): MockRuntime {
  return globalThis as MockRuntime
}

function clearMockInstallFlags(): void {
  const target = mockRuntime()
  delete target.__mockFetchInstalled__
  delete target.__mockWebSocketInstalled__
  delete target.__mock
}

/**
 * 「关掉 mock」之后必须彻底干净。
 *
 * 踩过的坑：安装曾是无条件的，mock 关着也会写一个 `.mock` 结尾的假令牌进 localStorage，
 * 把真实登录态冲掉（刷新后必 401 并弹出登录框），控制台还会打印「[mock] 已启用」误导排查。
 */
describe('installMockFetch 的安装条件', () => {
  let realFetch: typeof globalThis.fetch
  let realWebSocket: typeof globalThis.WebSocket

  beforeEach(() => {
    realFetch = globalThis.fetch
    realWebSocket = globalThis.WebSocket
    clearMockInstallFlags()
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    globalThis.WebSocket = realWebSocket
    clearMockInstallFlags()
    vi.unstubAllEnvs()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('mock 关着：不装替身、不写假令牌，真实登录态原样保留', () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_MOCK', 'false')
    localStorage.setItem(TOKEN_KEY, 'real.token.value')

    installMockFetch()

    expect(globalThis.fetch).toBe(realFetch)
    expect(globalThis.WebSocket).toBe(realWebSocket)
    expect(mockRuntime().__mockFetchInstalled__).toBeUndefined()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('real.token.value')
  })

  it('mock 关着时，地址上的 ?mock=0 也拦得住 VITE_MOCK=true', () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_MOCK', 'true')
    localStorage.setItem(TOKEN_KEY, 'real.token.value')
    window.history.replaceState({}, '', '/?mock=0')

    installMockFetch()

    expect(mockRuntime().__mockFetchInstalled__).toBeUndefined()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('real.token.value')
  })

  it('mock 开着：装上 fetch 与 WebSocket 替身，并按当前身份写入假令牌', () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_MOCK', 'true')

    installMockFetch()

    expect(mockRuntime().__mockFetchInstalled__).toBe(true)
    expect(mockRuntime().__mockWebSocketInstalled__).toBe(true)
    expect(localStorage.getItem(TOKEN_KEY) ?? '').toMatch(/\.mock$/)
  })

  it('非 dev 构建：什么都不做，真实登录态原样保留', () => {
    vi.stubEnv('MODE', 'test')
    vi.stubEnv('VITE_MOCK', 'true')
    localStorage.setItem(TOKEN_KEY, 'real.token.value')

    installMockFetch()

    expect(globalThis.fetch).toBe(realFetch)
    expect(localStorage.getItem(TOKEN_KEY)).toBe('real.token.value')
  })
})
