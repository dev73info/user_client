import { HttpError, authHeaders, requestJson, requestVoid } from '@/api/http'
import {
  createAuthApiClient,
  detectClientPlatform,
  type AgreementAcceptancePayload,
  type AuthPayload,
  type AuthRequestPayload,
  type GiteeAuthUrlResp,
  type GithubAuthUrlResp,
  isTwoFactorRequiredPayload,
} from '@/shared/auth/client'

export type {
  AgreementAcceptancePayload,
  AuthPayload,
  AuthRequestPayload,
  GiteeAuthUrlResp,
  GithubAuthUrlResp,
}
export { detectClientPlatform, isTwoFactorRequiredPayload }

export type WechatPaymentAuthorizeUrlResp = {
  url: string
}

export type WechatPaymentAuthorizationStatusResp = {
  authorized: boolean
}

export type OauthStatusResp = {
  github: boolean
  wechat: boolean
  qq: boolean
  gitee: boolean
}

export async function getOauthStatus(): Promise<OauthStatusResp> {
  return requestJson<OauthStatusResp>(
    '/auth/oauth-status',
    { headers: {} },
    '加载登录方式失败',
  )
}

export type BoundProvidersResp = {
  providers: string[]
}

export async function getBoundProviders(token: string): Promise<BoundProvidersResp> {
  return requestJson<BoundProvidersResp>(
    '/auth/providers',
    { headers: authHeaders(token) },
    '加载已绑定的第三方账号失败',
  )
}

export type OAuthProvider = 'github' | 'gitee' | 'wechat' | 'qq' | 'alipay'

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

export async function unbindProvider(
  token: string,
  provider: OAuthProvider,
): Promise<void> {
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
  poll_secret: string
}

/** PC 端扫码登录：二维码当前所处阶段，由手机端扫码 / 确认 / 取消驱动。 */
export type WechatLoginQrPollStatus =
  /** 二维码已生成，尚未被扫描。 */
  | 'pending'
  /** 已扫码，等待手机端点击「确认登录」。 */
  | 'scanned'
  /** 手机端点了「取消登录」，需要重新生成二维码。 */
  | 'cancelled'
  /** 二维码已过期或状态已失效，需要重新生成二维码。 */
  | 'expired'
  /** 已确认登录，token 即本次登录凭证。 */
  | 'confirmed'

export type WechatLoginQrStatusResp = {
  token?: string | null
  /** 旧后端不带该字段，缺失时按 pending 处理。 */
  status?: WechatLoginQrPollStatus
}

export type WechatBindQrUrlResp = {
  url: string
  state: string
}

export type WechatBindQrStatusResp = {
  done: boolean
  success: boolean
  error?: string | null
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
  pollSecret: string,
): Promise<WechatLoginQrStatusResp> {
  const query = new URLSearchParams({ state })
  return requestJson<WechatLoginQrStatusResp>(
    `/auth/wechat/login/qr/status?${query.toString()}`,
    { headers: { 'X-Wechat-Login-Poll-Secret': pollSecret }, cache: 'no-store' },
    '查询微信扫码登录状态失败',
  )
}

export type QqLoginQrUrlResp = {
  url: string
  state: string
}

export type QqLoginQrStatusResp = {
  token?: string | null
}

export async function getQqLoginQrUrl(
  redirectTo: string,
): Promise<QqLoginQrUrlResp> {
  const query = new URLSearchParams({ redirect_to: redirectTo })
  return requestJson<QqLoginQrUrlResp>(
    `/auth/qq/login/qr/url?${query.toString()}`,
    { headers: {} },
    'QQ扫码登录暂不可用',
  )
}

export async function getQqLoginQrStatus(
  state: string,
): Promise<QqLoginQrStatusResp> {
  const query = new URLSearchParams({ state })
  return requestJson<QqLoginQrStatusResp>(
    `/auth/qq/login/qr/status?${query.toString()}`,
    { headers: {} },
    '查询QQ扫码登录状态失败',
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

export async function getWechatBindQrStatus(
  state: string,
): Promise<WechatBindQrStatusResp> {
  const query = new URLSearchParams({ state })
  return requestJson<WechatBindQrStatusResp>(
    `/auth/wechat/bind/qr/status?${query.toString()}`,
    { headers: {} },
    '查询微信绑定状态失败',
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

export type UserServiceAgreement = {
  code: string
  title: string
  content: string
  version: string
  effective_at: string
}

export async function fetchUserServiceAgreement(): Promise<UserServiceAgreement> {
  return requestJson<UserServiceAgreement>(
    '/auth/user-service-agreement',
    { headers: {} },
    '加载用户服务协议失败',
  )
}

/** 通用协议 / 附件内容（后端 `contract_template` 的一行）。 */
export type AgreementContent = {
  code: string
  title: string
  content: string
  version: string
  effective_at: string
}

/**
 * 读取协议 / 配套附件的正文（公开，无需登录）。
 *
 * 白名单外的 code 后端返回 404（例如 `default_requirement` 不在白名单，
 * 需求合同正文要走合同详情接口）。
 */
export async function fetchAgreementContent(code: string): Promise<AgreementContent> {
  const query = new URLSearchParams({ code })
  return requestJson<AgreementContent>(
    `/auth/agreement-content?${query.toString()}`,
    { headers: {} },
    '加载协议内容失败',
  )
}

export async function requestDevRole(token: string): Promise<{ username: string; role: string }> {
  return requestJson<{ username: string; role: string }>(
    '/auth/request-dev-role',
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '申请开发者权限失败',
  )
}

export type DevAccessStatus = {
  is_dev: boolean
  is_super_admin: boolean
  realname_approved: boolean
  is_adult: boolean
  developer_agreement_signed: boolean
  api_usage_agreement_signed: boolean
}

/**
 * 只读查询当前用户的开发者资格与入驻协议签约状态。
 *
 * 与 `requestDevRole` 不同：本接口不会授予角色，也不会因未签署入驻协议而失败，
 * 前端用它展示签约状态，并在担保接单前提示开发者签署入驻协议。
 */
export async function getDevAccessStatus(token: string): Promise<DevAccessStatus> {
  return requestJson<DevAccessStatus>(
    '/auth/dev-access-status',
    { headers: authHeaders(token) },
    '获取开发者权限状态失败',
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
  getGiteeAuthorizeUrl,
  recordAgreementAcceptance,
} = authClient
