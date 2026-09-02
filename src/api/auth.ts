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
