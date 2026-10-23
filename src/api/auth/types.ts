/**
 * 登录与第三方账号域的请求 / 响应类型。
 *
 * 后端 2.0 目前只把登录 / 注册 / 权限 / 第三方绑定这批端点写进 OpenAPI 契约
 * （`src/api/generated/openapi.json`），所以这里只有契约覆盖到的那几个结构取生成物；
 * 微信、QQ、云闪付、协议正文与开发者资格这几组端点还没进契约，保持手写并注明原因。
 * 逐条对照见 `doc/契约类型对照.md`。
 */
import type { components } from '@/api/generated/schema'

/** 生成物里的 schema 集合。 */
type Schemas = components['schemas']

/**
 * 微信支付授权地址。
 *
 * 契约未覆盖（后端 utoipa 还没产出 `/auth/wechat/payment/url` 的 schema），保持手写。
 */
export type WechatPaymentAuthorizeUrlResp = {
  url: string
}

/** 微信支付授权状态。契约未覆盖（`/auth/wechat/payment/status`），保持手写。 */
export type WechatPaymentAuthorizationStatusResp = {
  authorized: boolean
}

/**
 * 各渠道登录方式的可用性（`GET /auth/oauth-status`）。
 *
 * 字段同契约 `OAuthStatusResponse`：前端按这四个键决定渲染哪些登录按钮，
 * 微信与 QQ 在 2.0 尚未接管，但键必须保留。
 */
export type OauthStatusResp = Schemas['OAuthStatusResponse']

/** 已绑定的第三方渠道（`GET /auth/providers`），字段同契约 `BoundProvidersResponse`。 */
export type BoundProvidersResp = Schemas['BoundProvidersResponse']

/**
 * 可绑 / 可解绑的第三方渠道。
 *
 * 契约里没有这个枚举（`/auth/{provider}/bind` 的路径参数是 `string`），本仓自己收窄成五个取值。
 */
export type OAuthProvider = 'github' | 'gitee' | 'wechat' | 'qq' | 'alipay'

/** 云闪付授权地址。契约未覆盖（`/adapay/union/payment/url` 不在 identity 域契约里），保持手写。 */
export type UnionPaymentAuthorizeUrlResp = {
  url: string
}

/** PC 端扫码登录地址。契约未覆盖（`/auth/wechat/login/qr/url`），保持手写。 */
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

/** 扫码登录轮询结果。契约未覆盖（`/auth/wechat/login/qr/status`），保持手写。 */
export type WechatLoginQrStatusResp = {
  token?: string | null
  /** 旧后端不带该字段，缺失时按 pending 处理。 */
  status?: WechatLoginQrPollStatus
}

/** 微信绑定二维码地址。契约未覆盖（`/auth/wechat/bind/qr/url`），保持手写。 */
export type WechatBindQrUrlResp = {
  url: string
  state: string
}

/** 微信绑定二维码轮询结果。契约未覆盖（`/auth/wechat/bind/qr/status`），保持手写。 */
export type WechatBindQrStatusResp = {
  done: boolean
  success: boolean
  error?: string | null
}

/** QQ 扫码登录地址。契约未覆盖（`/auth/qq/login/qr/url`），保持手写。 */
export type QqLoginQrUrlResp = {
  url: string
  state: string
}

/** QQ 扫码登录轮询结果。契约未覆盖（`/auth/qq/login/qr/status`），保持手写。 */
export type QqLoginQrStatusResp = {
  token?: string | null
}

/** 用户服务协议正文。契约未覆盖（`/auth/user-service-agreement`），保持手写。 */
export type UserServiceAgreement = {
  code: string
  title: string
  content: string
  version: string
  effective_at: string
}

/**
 * 通用协议 / 附件内容（后端 `contract_template` 的一行）。
 *
 * 契约未覆盖（`/auth/agreement-content`），保持手写。
 */
export type AgreementContent = {
  code: string
  title: string
  content: string
  version: string
  effective_at: string
}

/** 开发者资格与入驻协议签约状态。契约未覆盖（`/auth/dev-access-status`），保持手写。 */
export type DevAccessStatus = {
  is_dev: boolean
  is_super_admin: boolean
  realname_approved: boolean
  is_adult: boolean
  developer_agreement_signed: boolean
  api_usage_agreement_signed: boolean
}
