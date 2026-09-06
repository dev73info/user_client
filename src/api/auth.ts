import { HttpError, authHeaders, requestJson, requestVoid } from '@/api/http'
import {
  createAuthApiClient,
  type AgreementAcceptancePayload,
  type AuthPayload,
  type AuthRequestPayload,
  type GithubAuthUrlResp,
  isTwoFactorRequiredPayload,
} from '@/shared/auth/client'

export type { AgreementAcceptancePayload, AuthPayload, AuthRequestPayload, GithubAuthUrlResp }
export { isTwoFactorRequiredPayload }

export type WechatPaymentAuthorizeUrlResp = {
  url: string
}

export type WechatPaymentAuthorizationStatusResp = {
  authorized: boolean
}

export type OauthStatusResp = {
  github: boolean
  wechat: boolean
}

export async function getOauthStatus(): Promise<OauthStatusResp> {
  return requestJson<OauthStatusResp>(
    '/auth/oauth-status',
    { headers: {} },
    '加载登录方式失败',
  )
}

export type UnionPaymentAuthorizeUrlResp = {
  url: string
}

export function isWechatPaymentAuthorizationRequired(error: unknown): boolean {
  return error instanceof HttpError && error.status === 409 && error.message.includes('open_id')
}

export function isUnionPaymentAuthorizationRequired(error: unknown): boolean {
  return error instanceof HttpError && error.status === 409 && error.message.includes('user_identity_id')
}

export async function getUnionPaymentAuthorizeUrl(
  token: string,
  redirectTo: string,
): Promise<UnionPaymentAuthorizeUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<UnionPaymentAuthorizeUrlResp>(
    `/adapay/union/payment/url?${query.toString()}`,
    {
      headers: authHeaders(token),
    },
    '云闪付授权暂不可用',
  )
}

export async function getWechatPaymentAuthorizeUrl(
  token: string,
  redirectTo: string,
  presentation: 'qr' | 'redirect' = 'redirect',
): Promise<WechatPaymentAuthorizeUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  if (presentation === 'qr') {
    query.set('presentation', 'qr')
  }
  return requestJson<WechatPaymentAuthorizeUrlResp>(
    `/auth/wechat/payment/url?${query.toString()}`,
    {
      headers: authHeaders(token),
    },
    '微信授权暂不可用',
  )
}

export async function getWechatBindAuthorizeUrl(
  token: string,
  redirectTo: string,
): Promise<WechatPaymentAuthorizeUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<WechatPaymentAuthorizeUrlResp>(
    `/auth/wechat/bind/url?${query.toString()}`,
    {
      headers: authHeaders(token),
    },
    '微信绑定暂不可用',
  )
}

export type WechatLoginQrUrlResp = {
  url: string
  state: string
}

export type WechatLoginQrStatusResp = {
  token?: string | null
}

export async function getWechatLoginQrUrl(
  redirectTo: string,
): Promise<WechatLoginQrUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<WechatLoginQrUrlResp>(
    `/auth/wechat/login/qr/url?${query.toString()}`,
    { headers: {} },
    '微信扫码登录暂不可用',
  )
}

export async function getWechatLoginQrStatus(
  state: string,
): Promise<WechatLoginQrStatusResp> {
  const query = new URLSearchParams({ state })
  return requestJson<WechatLoginQrStatusResp>(
    `/auth/wechat/login/qr/status?${query.toString()}`,
    { headers: {} },
    '查询微信扫码登录状态失败',
  )
}

export async function getWechatPaymentAuthorizationStatus(
  token: string,
): Promise<WechatPaymentAuthorizationStatusResp> {
  return requestJson<WechatPaymentAuthorizationStatusResp>(
    '/auth/wechat/payment/status',
    {
      headers: authHeaders(token),
    },
    '查询微信授权状态失败',
  )
}

const authClient = createAuthApiClient(
  {
    requestJson,
    requestVoid,
    authHeaders,
    isHttpError: (err): err is HttpError => err instanceof HttpError,
  },
  {
    fallbackAgreementAcceptanceOn404: true,
  },
)

export const {
  authRequest,
  sendRegisterEmailCode,
  sendResetPasswordEmailCode,
  resetPassword,
  refreshToken,
  getGithubAuthorizeUrl,
  recordAgreementAcceptance,
} = authClient
