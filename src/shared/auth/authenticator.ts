import { detectClientPlatform } from './clientPlatform'

import type { AuthPayload } from './client'

type RequestJson = <T>(path: string, init: RequestInit, fallbackError?: string) => Promise<T>
type IsHttpError = (err: unknown) => err is { status: number }

/**
 * 身份验证器免密登录：登录名 + Authenticator 动态码，不需要密码。
 *
 * 账号不存在、未绑定身份验证器、动态码错误 / 过期 / 已使用统一回 401；这里把这些
 * 情况都折成同一句提示，不给账号枚举留口子。停用 / 注销账号的 403 与限流 429
 * 原样抛出（后端文案更具体）。
 *
 * 从 `client.ts` 拆出：只依赖请求层与错误判定，不需要整个登录工厂的其余闭包。
 */
export async function requestAuthenticatorLogin(
  deps: { requestJson: RequestJson; isHttpError: IsHttpError },
  username: string,
  code: string,
  turnstileToken?: string,
): Promise<AuthPayload> {
  try {
    return await deps.requestJson<AuthPayload>(
      '/auth/login/authenticator',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': detectClientPlatform(),
        },
        body: JSON.stringify({
          username,
          code,
          ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
        }),
      },
      '登录失败',
    )
  } catch (err) {
    if (deps.isHttpError(err) && err.status === 401) {
      throw new Error('登录名或动态码不正确')
    }
    throw err
  }
}
