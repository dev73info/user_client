import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpError, requestJson } from '@/api/http'
import {
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
  readAuthRefreshToken,
  writeAuthRefreshToken,
} from '@/shared/auth/storage'
import { useAuthStore } from '@/stores/auth'

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  refreshSession: vi.fn(),
  refreshToken: vi.fn(),
  getPrivileges: vi.fn(),
}))

vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  authRequest: mocks.authRequest,
  refreshSession: mocks.refreshSession,
  refreshToken: mocks.refreshToken,
  getPrivileges: mocks.getPrivileges,
}))

function tokenWithExpiry(delayMs: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor((Date.now() + delayMs) / 1000) }))
    .split('+')
    .join('-')
    .split('/')
    .join('_')
    .replace(/=+$/, '')
  return 'header.' + payload + '.signature'
}

function response(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response
}

const PRIVILEGES = {
  username: 'flow_user',
  role: 'user',
  roles: ['user'],
  permissions: [],
  is_super_admin: false,
}

describe('刷新令牌持久化与会话恢复', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)
    mocks.authRequest.mockReset()
    mocks.refreshSession.mockReset()
    mocks.refreshToken.mockReset()
    mocks.getPrivileges.mockReset()
    mocks.getPrivileges.mockResolvedValue(PRIVILEGES)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('刷新令牌按独立 key 读写与清空', () => {
    writeAuthRefreshToken('refresh-1')
    expect(readAuthRefreshToken()).toBe('refresh-1')
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-1')

    writeAuthRefreshToken('')
    expect(readAuthRefreshToken()).toBe('')
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('登录成功后同时落盘访问令牌与刷新令牌', async () => {
    mocks.authRequest.mockResolvedValue({
      token: 'login-token',
      refresh_token: 'login-refresh',
      username: 'flow_user',
      role: 'user',
      roles: ['user'],
    })

    const auth = useAuthStore()
    await auth.login('flow_user', 'test-password')

    expect(auth.token).toBe('login-token')
    expect(auth.refreshToken).toBe('login-refresh')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('login-token')
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe('login-refresh')
  })

  it('hydrate 恢复刷新令牌，退出登录清掉两个 key', () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenWithExpiry(60_000))
    localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'stored-refresh')

    const auth = useAuthStore()
    auth.hydrate()
    expect(auth.token).not.toBe('')
    expect(auth.refreshToken).toBe('stored-refresh')

    auth.logout()
    expect(auth.token).toBe('')
    expect(auth.refreshToken).toBe('')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('setRefreshToken 同步写入 storage', () => {
    const auth = useAuthStore()
    auth.setRefreshToken('manual-refresh')

    expect(auth.refreshToken).toBe('manual-refresh')
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe('manual-refresh')

    auth.setRefreshToken('')
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('外部登录换令牌时清掉旧刷新令牌，避免账号被旧会话换回去', () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenWithExpiry(60_000))
    localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'other-account-refresh')
    mocks.refreshToken.mockResolvedValue({
      token: 'new-account-access',
      refresh_token: 'new-account-refresh',
      username: 'flow_user',
      role: 'user',
      roles: ['user'],
    })

    const auth = useAuthStore()
    auth.hydrate()
    expect(auth.refreshToken).toBe('other-account-refresh')

    auth.setToken('new-account-access')

    expect(auth.refreshToken).toBe('')
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('initializeSession 优先用刷新令牌换票并更新一对令牌', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenWithExpiry(60_000))
    localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'stored-refresh')
    mocks.refreshSession.mockResolvedValue({
      token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      username: 'flow_user',
      role: 'user',
      roles: ['user'],
    })

    const auth = useAuthStore()
    const profile = await auth.initializeSession()

    expect(mocks.refreshSession).toHaveBeenCalledWith('stored-refresh')
    expect(mocks.refreshToken).not.toHaveBeenCalled()
    expect(profile).toEqual({ username: 'flow_user', role: 'user' })
    expect(auth.token).toBe('fresh-access')
    expect(auth.refreshToken).toBe('fresh-refresh')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('fresh-access')
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe('fresh-refresh')
  })

  it('刷新令牌被拒且访问令牌已过期时静默登出', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenWithExpiry(-60_000))
    localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'stored-refresh')
    mocks.refreshSession.mockRejectedValue(new HttpError(401, '刷新令牌无效'))

    const auth = useAuthStore()
    await expect(auth.initializeSession()).rejects.toMatchObject({ status: 401 })

    expect(auth.token).toBe('')
    expect(auth.refreshToken).toBe('')
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('没有刷新令牌时回退旧接口，并把响应里的刷新令牌落盘', async () => {
    const accessToken = tokenWithExpiry(60_000)
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, accessToken)
    mocks.refreshToken.mockResolvedValue({
      token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      username: 'flow_user',
      role: 'user',
      roles: ['user'],
    })

    const auth = useAuthStore()
    await auth.initializeSession()

    expect(mocks.refreshSession).not.toHaveBeenCalled()
    expect(mocks.refreshToken).toHaveBeenCalledWith(accessToken)
    expect(auth.token).toBe('legacy-access')
    expect(auth.refreshToken).toBe('legacy-refresh')
    expect(localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe('legacy-refresh')
  })

  it('刷新令牌被拒但访问令牌仍有效时用旧接口兜底', async () => {
    const accessToken = tokenWithExpiry(60_000)
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, accessToken)
    localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'stored-refresh')
    mocks.refreshSession.mockRejectedValue(new HttpError(401, '刷新令牌无效'))
    mocks.refreshToken.mockResolvedValue({
      token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      username: 'flow_user',
      role: 'user',
      roles: ['user'],
    })

    const auth = useAuthStore()
    await auth.initializeSession()

    expect(mocks.refreshSession).toHaveBeenCalledWith('stored-refresh')
    expect(mocks.refreshToken).toHaveBeenCalledWith(accessToken)
    expect(auth.token).toBe('legacy-access')
    expect(auth.refreshToken).toBe('legacy-refresh')
  })

  it('业务请求 401 时静默换票并用新令牌重放原请求', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenWithExpiry(60_000))
    localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'stored-refresh')
    mocks.refreshSession.mockResolvedValue({
      token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      username: 'flow_user',
      role: 'user',
      roles: ['user'],
    })

    const auth = useAuthStore()
    auth.hydrate()

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(401, JSON.stringify({ code: 'INVALID_TOKEN', message: '令牌已过期' })),
      )
      .mockResolvedValueOnce(response(200, JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestJson<{ ok: boolean }>('/orders', { headers: auth.authHeaders() })

    expect(result).toEqual({ ok: true })
    expect(mocks.refreshSession).toHaveBeenCalledWith('stored-refresh')
    expect(auth.token).toBe('fresh-access')
    expect(auth.refreshToken).toBe('fresh-refresh')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const replayInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(new Headers(replayInit.headers).get('Authorization')).toBe('Bearer fresh-access')
  })

  it('并发 401 只换一次票', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenWithExpiry(60_000))
    localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'stored-refresh')
    let resolveRefresh!: (payload: unknown) => void
    mocks.refreshSession.mockImplementation(
      () => new Promise((resolve) => (resolveRefresh = resolve)),
    )

    const auth = useAuthStore()
    auth.hydrate()

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401, '{}'))
      .mockResolvedValueOnce(response(401, '{}'))
      .mockResolvedValueOnce(response(200, JSON.stringify({ ok: 1 })))
      .mockResolvedValueOnce(response(200, JSON.stringify({ ok: 2 })))
    vi.stubGlobal('fetch', fetchMock)

    const first = requestJson('/a', { headers: auth.authHeaders() })
    const second = requestJson('/b', { headers: auth.authHeaders() })
    await vi.waitFor(() => expect(mocks.refreshSession).toHaveBeenCalledTimes(1))
    resolveRefresh({
      token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      username: 'flow_user',
      role: 'user',
      roles: ['user'],
    })

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: 1 }, { ok: 2 }])
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1)
  })
})
