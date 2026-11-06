/**
 * Authenticator 免密登录请求：401 折成统一文案（防账号枚举），403 / 429 原样抛出。
 */
import { describe, expect, it, vi } from 'vitest'

import { requestAuthenticatorLogin } from '@/shared/auth/authenticator'

function buildDeps(error: unknown) {
  return {
    requestJson: vi.fn().mockRejectedValue(error),
    isHttpError: (err: unknown): err is { status: number } =>
      typeof (err as { status?: unknown })?.status === 'number',
  }
}

describe('requestAuthenticatorLogin', () => {
  it('401 折成「登录名或动态码不正确」', async () => {
    const deps = buildDeps(Object.assign(new Error('账号不存在'), { status: 401 }))

    await expect(requestAuthenticatorLogin(deps, 'totp_smoke', '123456')).rejects.toThrow(
      '登录名或动态码不正确',
    )
  })

  it('403 停用 / 429 限流的原始文案透出', async () => {
    for (const [status, message] of [
      [403, '账号已停用'],
      [429, '操作过于频繁，请稍后再试'],
    ] as const) {
      const deps = buildDeps(Object.assign(new Error(message), { status }))

      await expect(requestAuthenticatorLogin(deps, 'totp_smoke', '123456')).rejects.toThrow(
        message,
      )
    }
  })

  it('人机验证 token 只在有值时提交', async () => {
    const requestJson = vi.fn().mockResolvedValue({ token: 'tk' })
    const deps = {
      requestJson,
      isHttpError: (err: unknown): err is { status: number } =>
        typeof (err as { status?: unknown })?.status === 'number',
    }

    await requestAuthenticatorLogin(deps, 'totp_smoke', '123456', 'ts-token')
    await requestAuthenticatorLogin(deps, 'totp_smoke', '123456')

    const withToken = JSON.parse(requestJson.mock.calls[0]![1].body as string)
    const withoutToken = JSON.parse(requestJson.mock.calls[1]![1].body as string)
    expect(withToken).toMatchObject({
      username: 'totp_smoke',
      code: '123456',
      turnstile_token: 'ts-token',
    })
    expect(withoutToken).not.toHaveProperty('turnstile_token')
  })
})
