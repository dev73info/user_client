import { md5Hex } from './md5'
import { buildAuthBody, type AuthPath } from './requestBody'

/**
 * 登录 / 注册 / 刷新的响应（契约 `AuthResponse`）。
 *
 * `role` 是主角色、`roles` 是全部角色；**权限判定不要用它们**——生效权限一律以
 * `GET /auth/users/privileges` 的 `permissions` 为准（角色只是展示用的快照）。
 */
export type AuthPayload = {
  token: string
  username?: string
  role?: string
  roles?: string[]
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

/** 协议同意留痕的落库结果（契约 `AgreementAcceptanceResponse`）。 */
export type AgreementAcceptancePayload = {
  username: string
  role: string
  agreement_code: string
  /** 落库的协议版本是**自增整数**（1.x 这里是日期串）。 */
  agreement_version: number
  client_platform: string
  source: string
  agreed_at: string
}

export type GithubAuthUrlResp = {
  url: string
}

export type GiteeAuthUrlResp = {
  url: string
}

export type { AuthPath } from './requestBody'

/**
 * 客户端平台标识（协议同意留痕用）。
 *
 * 判定口径必须各处一致：留痕要能证明"用户在哪台设备上同意的"，
 * 协议页、登录弹窗、签署页各写一套就会对不上，所以只留这一份。
 */
export function detectClientPlatform(): string {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent
  if (/MicroMessenger/i.test(ua)) return 'wechat'
  if (/windows/i.test(ua)) return 'web-windows'
  if (/macintosh|Mac OS/i.test(ua)) return 'web-macos'
  if (/android/i.test(ua)) return 'web-android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'web-ios'
  return 'web'
}

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
}

export function createAuthApiClient(deps: AuthApiDependencies, options: AuthApiOptions = {}) {
  const defaultRequestDevRole = options.defaultRequestDevRole ?? false

  async function authRequest(
    path: AuthPath,
    username: string,
    password: string,
    email?: string,
    emailCode?: string,
    requestDevRole = defaultRequestDevRole,
    twoFactorCode?: string,
    inviteCode?: string,
    shareType?: string,
    shareTargetId?: string,
    turnstileToken?: string,
  ): Promise<AuthRequestPayload> {
    try {
      return await deps.requestJson<AuthRequestPayload>(
        path,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Platform': detectClientPlatform(),
          },
          body: JSON.stringify(
            buildAuthBody(path, {
              username,
              password,
              email,
              emailCode,
              requestDevRole,
              twoFactorCode,
              inviteCode,
              shareType,
              shareTargetId,
              turnstileToken,
            }),
          ),
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

  async function sendRegisterEmailCode(email: string, turnstileToken?: string): Promise<void> {
    try {
      await deps.requestVoid(
        '/auth/send-register-email-code',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
          }),
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

  function sendResetPasswordEmailCode(email: string, turnstileToken?: string): Promise<void> {
    return deps.requestVoid(
      '/auth/send-reset-password-email-code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
        }),
      },
      '发送验证码失败',
    )
  }

  function resetPassword(
    email: string,
    password: string,
    emailCode: string,
    turnstileToken?: string,
  ): Promise<AuthPayload> {
    return deps.requestJson<AuthPayload>(
      '/auth/reset-password',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          // 同登录：契约 ResetPasswordRequest 要求 md5(明文密码)
          password: md5Hex(password),
          email_code: emailCode,
          ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
        }),
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
        credentials: 'omit',
      },
      'GitHub 登录暂不可用',
    )
  }

  function getGiteeAuthorizeUrl(redirectTo: string): Promise<GiteeAuthUrlResp> {
    const query = new URLSearchParams({ redirect_to: redirectTo })
    if (defaultRequestDevRole) {
      query.set('request_dev_role', 'true')
    }

    return deps.requestJson<GiteeAuthUrlResp>(
      `/auth/gitee/url?${query.toString()}`,
      {
        method: 'GET',
        credentials: 'omit',
      },
      'Gitee 登录暂不可用',
    )
  }

  /**
   * 记录一次协议同意留痕（`POST /auth/agreement-acceptances`）。
   *
   * 请求体只有契约上的四个字段：`agreement_code` / `agreement_version` /
   * `client_platform` / `source`。**`agreement_version` 留空表示「按模板当前版本落库」**，
   * 所以读不到版本时干脆不传这个键，不要传空串充当版本。
   *
   * 契约里没有「重要条款提示的确认时间 / 提示版本」这两个字段，它们只留在本次会话
   * （`components/legal/legalNotice.ts`），不进留痕表。
   */
  function recordAgreementAcceptance(
    token: string,
    agreementCode: string,
    agreementVersion: string | number,
    clientPlatform: string,
    source = '',
  ): Promise<AgreementAcceptancePayload> {
    const version = String(agreementVersion).trim()
    return deps.requestJson<AgreementAcceptancePayload>(
      '/auth/agreement-acceptances',
      {
        method: 'POST',
        headers: deps.authHeaders(token, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          agreement_code: agreementCode,
          ...(version ? { agreement_version: version } : {}),
          ...(clientPlatform ? { client_platform: clientPlatform } : {}),
          ...(source ? { source } : {}),
        }),
      },
      '协议留痕失败',
    )
  }

  return {
    authRequest,
    refreshToken,
    sendRegisterEmailCode,
    sendResetPasswordEmailCode,
    resetPassword,
    getGithubAuthorizeUrl,
    getGiteeAuthorizeUrl,
    recordAgreementAcceptance,
  }
}
