import { authHeaders, requestJson, requestVoid } from '@/api/http'

import type {
  AccountCloseRequestResp,
  AuthorizeUrlResp,
  BoundProvidersResp,
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

/**
 * 取 GitHub / Gitee 的解绑验证授权地址（`GET /auth/{provider}/unbind/url`）。
 *
 * 解绑不再允许直接 `DELETE /auth/{provider}/bind`：必须先回到对应平台重新授权，
 * 回调用授权码换回的账号与当前绑定比对，一致才会真正解绑。
 */
export async function getProviderUnbindUrl(
  token: string,
  provider: 'github' | 'gitee',
  redirectTo: string,
): Promise<AuthorizeUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<AuthorizeUrlResp>(
    `/auth/${provider}/unbind/url?${query.toString()}`,
    { headers: authHeaders(token) },
    `${provider} 解绑验证暂不可用`,
  )
}

/** 发送注销申请验证码到当前主邮箱。 */
export async function sendAccountCloseCode(token: string): Promise<void> {
  return requestVoid(
    '/auth/account/close-code',
    { method: 'POST', headers: authHeaders(token) },
    '发送注销验证码失败',
  )
}

/** 提交注销申请：邮箱验证码校验通过后进入申请期，不会立刻退出登录。 */
export async function requestAccountClose(
  token: string,
  emailCode: string,
): Promise<AccountCloseRequestResp> {
  return requestJson<AccountCloseRequestResp>(
    '/auth/account/close-request',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email_code: emailCode }),
    },
    '提交注销申请失败',
  )
}

/** 读取当前账号的注销申请状态。 */
export async function getAccountCloseRequest(token: string): Promise<AccountCloseRequestResp> {
  return requestJson<AccountCloseRequestResp>(
    '/auth/account/close-request',
    { headers: authHeaders(token), cache: 'no-store' },
    '加载注销申请状态失败',
  )
}

/** 撤销尚未生效的注销申请。 */
export async function cancelAccountClose(token: string): Promise<void> {
  return requestVoid(
    '/auth/account/close-request',
    { method: 'DELETE', headers: authHeaders(token) },
    '撤销注销申请失败',
  )
}
