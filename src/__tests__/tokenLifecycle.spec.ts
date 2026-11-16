import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HttpError } from '@/api/http'
import {
  MIN_REFRESH_DELAY_MS,
  REFRESH_BEFORE_EXPIRY_MS,
  RETRY_AFTER_FAILURE_MS,
} from '@/shared/auth/token'
import { createTokenRefreshController } from '@/shared/auth/tokenLifecycle'

function isAuthRejected(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || error.status === 403)
}

function tokenWithExpiry(delayMs: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor((Date.now() + delayMs) / 1000) }))
    .split('+')
    .join('-')
    .split('/')
    .join('_')
    .replace(/=+$/, '')
  return 'header.' + payload + '.signature'
}

function nearExpiryToken(): string {
  return tokenWithExpiry(REFRESH_BEFORE_EXPIRY_MS + 5_000)
}

describe('令牌换票生命周期', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('有刷新令牌时优先用它换票，成功后应用新令牌', async () => {
    const accessToken = nearExpiryToken()
    const apply = vi.fn()
    const logout = vi.fn()
    const legacy = vi.fn()
    const refreshSession = vi
      .fn()
      .mockResolvedValue({ token: 'new-access', refresh_token: 'new-refresh' })

    const controller = createTokenRefreshController({
      getToken: () => accessToken,
      getRefreshToken: () => 'refresh-token',
      refreshToken: legacy,
      refreshSession,
      applyRefreshedToken: apply,
      logout,
      isAuthRejected,
    })

    controller.schedule()
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_DELAY_MS)

    expect(refreshSession).toHaveBeenCalledWith('refresh-token')
    expect(legacy).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledWith(
      { token: 'new-access', refresh_token: 'new-refresh' },
      accessToken,
    )
    expect(logout).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('没有刷新令牌时回退旧接口', async () => {
    const accessToken = nearExpiryToken()
    const apply = vi.fn()
    const legacy = vi.fn().mockResolvedValue({ token: 'new-access' })
    const refreshSession = vi.fn()

    const controller = createTokenRefreshController({
      getToken: () => accessToken,
      getRefreshToken: () => '',
      refreshToken: legacy,
      refreshSession,
      applyRefreshedToken: apply,
      logout: vi.fn(),
      isAuthRejected,
    })

    controller.schedule()
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_DELAY_MS)

    expect(refreshSession).not.toHaveBeenCalled()
    expect(legacy).toHaveBeenCalledWith(accessToken)
    expect(apply).toHaveBeenCalledWith({ token: 'new-access' }, accessToken)
    controller.dispose()
  })

  it('刷新令牌被拒且访问令牌已过期时静默登出，不再重试', async () => {
    const accessToken = tokenWithExpiry(-60_000)
    const logout = vi.fn()
    const legacy = vi.fn()
    const refreshSession = vi.fn().mockRejectedValue(new HttpError(401, '刷新令牌无效'))

    const controller = createTokenRefreshController({
      getToken: () => accessToken,
      getRefreshToken: () => 'refresh-token',
      refreshToken: legacy,
      refreshSession,
      applyRefreshedToken: vi.fn(),
      logout,
      isAuthRejected,
    })

    controller.schedule()
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_DELAY_MS)

    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(legacy).not.toHaveBeenCalled()
    expect(logout).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RETRY_AFTER_FAILURE_MS * 3)
    expect(refreshSession).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('刷新令牌被拒但访问令牌仍有效时用旧接口兜底', async () => {
    const accessToken = nearExpiryToken()
    const apply = vi.fn()
    const logout = vi.fn()
    const refreshSession = vi.fn().mockRejectedValue(new HttpError(401, '刷新令牌无效'))
    const legacy = vi.fn().mockResolvedValue({ token: 'new-access' })

    const controller = createTokenRefreshController({
      getToken: () => accessToken,
      getRefreshToken: () => 'refresh-token',
      refreshToken: legacy,
      refreshSession,
      applyRefreshedToken: apply,
      logout,
      isAuthRejected,
    })

    controller.schedule()
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_DELAY_MS)

    expect(refreshSession).toHaveBeenCalledWith('refresh-token')
    expect(legacy).toHaveBeenCalledWith(accessToken)
    expect(apply).toHaveBeenCalledWith({ token: 'new-access' }, accessToken)
    expect(logout).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('网络错误不登出，按 30 秒策略重试', async () => {
    const accessToken = nearExpiryToken()
    const logout = vi.fn()
    const refreshSession = vi.fn().mockRejectedValue(new Error('网络异常'))

    const controller = createTokenRefreshController({
      getToken: () => accessToken,
      getRefreshToken: () => 'refresh-token',
      refreshToken: vi.fn(),
      refreshSession,
      applyRefreshedToken: vi.fn(),
      logout,
      isAuthRejected,
    })

    controller.schedule()
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_DELAY_MS)
    expect(logout).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(RETRY_AFTER_FAILURE_MS + MIN_REFRESH_DELAY_MS)
    expect(refreshSession).toHaveBeenCalledTimes(2)
    expect(logout).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('页面重新可见时 access 已过期，先用刷新令牌静默恢复', async () => {
    const accessToken = tokenWithExpiry(-60_000)
    const apply = vi.fn()
    const logout = vi.fn()
    const refreshSession = vi
      .fn()
      .mockResolvedValue({ token: 'new-access', refresh_token: 'new-refresh' })

    const controller = createTokenRefreshController({
      getToken: () => accessToken,
      getRefreshToken: () => 'refresh-token',
      refreshToken: vi.fn(),
      refreshSession,
      applyRefreshedToken: apply,
      logout,
      isAuthRejected,
    })

    controller.setupVisibility()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(refreshSession).toHaveBeenCalledWith('refresh-token')
    expect(apply).toHaveBeenCalledWith(
      { token: 'new-access', refresh_token: 'new-refresh' },
      accessToken,
    )
    expect(logout).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('页面重新可见时恢复失败，静默登出', async () => {
    const accessToken = tokenWithExpiry(-60_000)
    const logout = vi.fn()
    const refreshSession = vi.fn().mockRejectedValue(new HttpError(401, '刷新令牌无效'))

    const controller = createTokenRefreshController({
      getToken: () => accessToken,
      getRefreshToken: () => 'refresh-token',
      refreshToken: vi.fn(),
      refreshSession,
      applyRefreshedToken: vi.fn(),
      logout,
      isAuthRejected,
    })

    controller.setupVisibility()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(logout).toHaveBeenCalledTimes(1)
    controller.dispose()
  })
})
