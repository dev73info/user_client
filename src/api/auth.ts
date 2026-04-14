import { HttpError, requestJson, requestVoid } from '@/api/http'

export type AuthPayload = {
  token: string
}

export type GithubAuthUrlResp = {
  url: string
}

type AuthPath = '/auth/login' | '/auth/register'

export async function authRequest(
  path: AuthPath,
  username: string,
  password: string,
  email?: string,
  emailCode?: string,
): Promise<AuthPayload> {
  return requestJson<AuthPayload>(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        ...(email ? { email } : {}),
        ...(emailCode ? { email_code: emailCode } : {}),
      }),
    },
    '请求失败',
  )
}

export async function sendRegisterEmailCode(email: string): Promise<void> {
  try {
    await requestVoid(
      '/auth/send-register-email-code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      },
      '发送验证码失败',
    )
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      throw new Error('该邮箱已被注册，请直接登录或换一个邮箱')
    }
    throw err
  }
}

export async function sendResetPasswordEmailCode(email: string): Promise<void> {
  await requestVoid(
    '/auth/send-reset-password-email-code',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    },
    '发送验证码失败',
  )
}

export async function resetPassword(
  email: string,
  password: string,
  emailCode: string,
): Promise<AuthPayload> {
  return requestJson<AuthPayload>(
    '/auth/reset-password',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_code: emailCode }),
    },
    '重置密码失败',
  )
}

export async function refreshToken(currentToken: string): Promise<AuthPayload> {
  return requestJson<AuthPayload>(
    '/auth/refresh',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    },
    '刷新令牌失败',
  )
}

export async function getGithubAuthorizeUrl(redirectTo: string): Promise<GithubAuthUrlResp> {
  const requestUrl = `/auth/github/url?redirect_to=${encodeURIComponent(redirectTo)}`
  return requestJson<GithubAuthUrlResp>(
    requestUrl,
    {
      method: 'GET',
      credentials: 'include',
    },
    'GitHub 登录暂不可用',
  )
}
