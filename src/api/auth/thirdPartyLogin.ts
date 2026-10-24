import { HttpError, authHeaders, requestJson } from '@/api/http'

import type { QqLoginQrStatusResp, QqLoginQrUrlResp, UnionPaymentAuthorizeUrlResp } from './types'

export function isUnionPaymentAuthorizationRequired(error: unknown): boolean {
  return (
    error instanceof HttpError && error.status === 409 && error.message.includes('user_identity_id')
  )
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

export async function getQqLoginQrUrl(redirectTo: string): Promise<QqLoginQrUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<QqLoginQrUrlResp>(
    `/auth/qq/login/qr/url?${query.toString()}`,
    { headers: {} },
    'QQ扫码登录暂不可用',
  )
}

export async function getQqLoginQrStatus(state: string): Promise<QqLoginQrStatusResp> {
  const query = new URLSearchParams({ state })
  return requestJson<QqLoginQrStatusResp>(
    `/auth/qq/login/qr/status?${query.toString()}`,
    { headers: {} },
    '查询QQ扫码登录状态失败',
  )
}
