import { authHeaders, requestJson, requestVoid } from '@/api/http'

import type {
  AuthorizeUrlResp,
  BoundProvidersResp,
  OAuthProvider,
  OauthStatusResp,
} from './types'

export async function getOauthStatus(): Promise<OauthStatusResp> {
  return requestJson<OauthStatusResp>('/auth/oauth-status', { headers: {} }, '加载登录方式失败')
}

export async function getBoundProviders(token: string): Promise<BoundProvidersResp> {
  return requestJson<BoundProvidersResp>(
    '/auth/providers',
    { headers: authHeaders(token) },
    '加载已绑定的第三方账号失败',
  )
}

/**
 * 取绑定某个第三方渠道的授权地址（`GET /auth/{provider}/bind/url`）。
 *
 * 契约支持的渠道是 github / gitee / qq / wechat 四个；`provider` 越界时后端 404。
 * `requestDevRole=true` 时绑定成功顺带申请开发者角色。
 */
export async function getProviderBindUrl(
  token: string,
  provider: 'github' | 'gitee' | 'qq' | 'wechat',
  redirectTo: string,
  requestDevRole = false,
): Promise<AuthorizeUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  if (requestDevRole) {
    query.set('request_dev_role', 'true')
  }
  return requestJson<AuthorizeUrlResp>(
    `/auth/${provider}/bind/url?${query.toString()}`,
    { headers: authHeaders(token) },
    `${provider} 绑定暂不可用`,
  )
}

export async function unbindProvider(token: string, provider: OAuthProvider): Promise<void> {
  return requestVoid(
    `/auth/${provider}/bind`,
    { method: 'DELETE', headers: authHeaders(token) },
    `${provider} 解绑失败`,
  )
}

export async function closeAccount(token: string): Promise<void> {
  return requestVoid(
    '/auth/account',
    { method: 'DELETE', headers: authHeaders(token) },
    '注销账号失败',
  )
}
