export type AuthPayload = {
  token: string
  username?: string
  role?: string
}

export type TwoFactorRequiredPayload = {
  requires_two_factor: true
  username: string
  delivery: 'email'
}

export type AuthRequestPayload = AuthPayload | TwoFactorRequiredPayload

export function isTwoFactorRequiredPayload(
  payload: AuthRequestPayload,
): payload is TwoFactorRequiredPayload {
  return 'requires_two_factor' in payload && payload.requires_two_factor === true
}

export type AgreementAcceptancePayload = {
  username: string | null
  role: string | null
  agreement_code: string
  agreement_version: string
  client_platform: string
  agreed_at: string
}

export type GithubAuthUrlResp = {
  url: string
}

export type AuthPath = '/auth/login' | '/auth/register'

type RequestJson = <T>(path: string, init: RequestInit, fallbackError?: string) => Promise<T>
type RequestVoid = (path: string, init: RequestInit, fallbackError?: string) => Promise<void>
type AuthHeaders = (token: string, headers?: HeadersInit) => Headers

type AuthApiDependencies = {
  requestJson: RequestJson
  requestVoid: RequestVoid
  authHeaders: AuthHeaders
  isHttpError: (err: unknown) => err is { status: number }
}

type AuthApiOptions = {
  defaultRequestDevRole?: boolean
  fallbackAgreementAcceptanceOn404?: boolean
}

export function createAuthApiClient(deps: AuthApiDependencies, options: AuthApiOptions = {}) {
  const defaultRequestDevRole = options.defaultRequestDevRole ?? false
  const fallbackAgreementAcceptanceOn404 = options.fallbackAgreementAcceptanceOn404 ?? false

  async function authRequest(
    path: AuthPath,
    username: string,
    password: string,
    email?: string,
    emailCode?: string,
    requestDevRole = defaultRequestDevRole,
    twoFactorCode?: string,
  ): Promise<AuthRequestPayload> {
    try {
      return await deps.requestJson<AuthRequestPayload>(
        path,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username,
            password,
            ...(requestDevRole ? { request_dev_role: true } : {}),
            ...(email ? { email } : {}),
            ...(emailCode ? { email_code: emailCode } : {}),
            ...(twoFactorCode ? { two_factor_code: twoFactorCode } : {}),
          }),
        },
        '请求失败',
      )
    } catch (err) {
      if (path === '/auth/login' && deps.isHttpError(err) && err.status === 401) {
        throw new Error('用户名/邮箱或密码不正确，请检查后重试')
      }

      throw err
    }
  }

  function refreshToken(currentToken: string): Promise<AuthPayload> {
    return deps.requestJson<AuthPayload>(
      '/auth/refresh',
      {
        method: 'POST',
        headers: deps.authHeaders(currentToken),
      },
      '刷新令牌失败',
    )
  }

  async function sendRegisterEmailCode(email: string): Promise<void> {
    try {
      await deps.requestVoid(
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
      if (deps.isHttpError(err) && err.status === 409) {
        throw new Error('该邮箱已被注册，请直接登录或换一个邮箱')
      }
      throw err
    }
  }

  function sendResetPasswordEmailCode(email: string): Promise<void> {
    return deps.requestVoid(
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

  function resetPassword(email: string, password: string, emailCode: string): Promise<AuthPayload> {
    return deps.requestJson<AuthPayload>(
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

  function getGithubAuthorizeUrl(redirectTo: string): Promise<GithubAuthUrlResp> {
    const query = new URLSearchParams({ redirect_to: redirectTo })
    if (defaultRequestDevRole) {
      query.set('request_dev_role', 'true')
    }

    return deps.requestJson<GithubAuthUrlResp>(
      `/auth/github/url?${query.toString()}`,
      {
        method: 'GET',
        credentials: 'include',
      },
      'GitHub 登录暂不可用',
    )
  }

  async function recordAgreementAcceptance(
    token: string,
    agreementCode: string,
    agreementVersion: string,
    clientPlatform: string,
  ): Promise<AgreementAcceptancePayload> {
    try {
      return await deps.requestJson<AgreementAcceptancePayload>(
        '/auth/agreement-acceptances',
        {
          method: 'POST',
          headers: deps.authHeaders(token, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            agreement_code: agreementCode,
            agreement_version: agreementVersion,
            client_platform: clientPlatform,
          }),
        },
        '协议留痕失败',
      )
    } catch (err) {
      if (fallbackAgreementAcceptanceOn404 && deps.isHttpError(err) && err.status === 404) {
        return {
          username: null,
          role: null,
          agreement_code: agreementCode,
          agreement_version: agreementVersion,
          client_platform: clientPlatform,
          agreed_at: new Date().toISOString(),
        }
      }

      throw err
    }
  }

  return {
    authRequest,
    refreshToken,
    sendRegisterEmailCode,
    sendResetPasswordEmailCode,
    resetPassword,
    getGithubAuthorizeUrl,
    recordAgreementAcceptance,
  }
}
