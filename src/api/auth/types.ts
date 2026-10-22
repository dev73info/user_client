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

export type BoundProvidersResp = {
  providers: string[]
}

export type OAuthProvider = 'github' | 'gitee' | 'wechat' | 'qq' | 'alipay'

export type UnionPaymentAuthorizeUrlResp = {
  url: string
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

export type QqLoginQrUrlResp = {
  url: string
  state: string
}

export type QqLoginQrStatusResp = {
  token?: string | null
}

export type UserServiceAgreement = {
  code: string
  title: string
  content: string
  version: string
  effective_at: string
}

/** 通用协议 / 附件内容（后端 `contract_template` 的一行）。 */
export type AgreementContent = {
  code: string
  title: string
  content: string
  version: string
  effective_at: string
}

export type DevAccessStatus = {
  is_dev: boolean
  is_super_admin: boolean
  realname_approved: boolean
  is_adult: boolean
  developer_agreement_signed: boolean
  api_usage_agreement_signed: boolean
}
