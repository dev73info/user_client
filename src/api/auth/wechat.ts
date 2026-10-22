import { HttpError, authHeaders, requestJson } from '@/api/http'

import type {
  WechatBindQrStatusResp,
  WechatBindQrUrlResp,
  WechatLoginQrStatusResp,
  WechatLoginQrUrlResp,
  WechatPaymentAuthorizeUrlResp,
  WechatPaymentAuthorizationStatusResp,
} from './types'

export function isWechatPaymentAuthorizationRequired(error: unknown): boolean {
  return error instanceof HttpError && error.status === 409 && error.message.includes('open_id')
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

export async function getWechatLoginQrUrl(redirectTo: string): Promise<WechatLoginQrUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<WechatLoginQrUrlResp>(
    `/auth/wechat/login/qr/url?${query.toString()}`,
    { headers: {} },
    '微信扫码登录暂不可用',
  )
}

export async function getWechatLoginQrStatus(
  state: string,
  pollSecret: string,
): Promise<WechatLoginQrStatusResp> {
  const query = new URLSearchParams({ state })
  return requestJson<WechatLoginQrStatusResp>(
    `/auth/wechat/login/qr/status?${query.toString()}`,
    { headers: { 'X-Wechat-Login-Poll-Secret': pollSecret }, cache: 'no-store' },
    '查询微信扫码登录状态失败',
  )
}

export async function getWechatBindQrUrl(
  token: string,
  redirectTo: string,
): Promise<WechatBindQrUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<WechatBindQrUrlResp>(
    `/auth/wechat/bind/qr/url?${query.toString()}`,
    { headers: authHeaders(token) },
    '微信绑定暂不可用',
  )
}

export async function getWechatBindQrStatus(state: string): Promise<WechatBindQrStatusResp> {
  const query = new URLSearchParams({ state })
  return requestJson<WechatBindQrStatusResp>(
    `/auth/wechat/bind/qr/status?${query.toString()}`,
    { headers: {} },
    '查询微信绑定状态失败',
  )
}
