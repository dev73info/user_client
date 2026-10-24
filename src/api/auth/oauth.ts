import { authHeaders, requestJson, requestVoid } from '@/api/http'
import type { GiteeAuthUrlResp } from '@/shared/auth/client'

import type { BoundProvidersResp, OAuthProvider, OauthStatusResp } from './types'

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

export async function getProviderBindUrl(
  token: string,
  provider: 'github' | 'gitee' | 'qq',
  redirectTo: string,
): Promise<GiteeAuthUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<GiteeAuthUrlResp>(
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
