/**
 * 登录与第三方账号域的请求 / 响应类型。
 *
 * 能取生成物的一律取 `components['schemas'][...]`（契约 `src/api/generated/openapi.json`），
 * 手写的只保留契约里确实没有结构的几处，并逐条注明原因。
 * 逐条对照见 `doc/契约类型对照.md`。
 */
import type { components } from '@/api/generated/schema'

/** 生成物里的 schema 集合。 */
type Schemas = components['schemas']

/** 各渠道登录方式的可用性（`GET /auth/oauth-status`）。 */
export type OauthStatusResp = Schemas['OAuthStatusResponse']

/** 已绑定的第三方渠道（`GET /auth/providers`）。 */
export type BoundProvidersResp = Schemas['BoundProvidersResponse']

/**
 * 可绑 / 可解绑的第三方渠道。
 *
 * 契约里没有这个枚举（`/auth/{provider}/bind` 的路径参数是 `string`），本仓自己收窄成五个取值。
 */
export type OAuthProvider = 'github' | 'gitee' | 'wechat' | 'qq' | 'alipay'

/** 第三方授权地址（`/auth/{provider}/url`、`/auth/{provider}/bind/url`）。 */
export type AuthorizeUrlResp = Schemas['AuthorizeUrlResponse']

/** PC 端扫码登录的二维码地址（微信 / QQ 同形）。 */
export type WechatLoginQrUrlResp = Schemas['QrUrlResponse']

/**
 * 服务号「扫码关注即登录」的二维码（`GET /auth/wechat/mp/login/qr/url`）。
 *
 * 三个凭据字段与 `QrUrlResponse` 完全同形；差别只有两点：`url` 是**二维码图片地址**
 * （微信 `showqrcode`，直接放进 `<img src>`），以及多一个 `expires_in`。
 * 生成物里还没有这条契约（后端 spec 尚未重新导出），所以在这里按同形收窄，
 * spec 更新后可以直接换成 `Schemas['MpQrUrlResponse']`。
 */
export type WechatMpLoginQrUrlResp = Schemas['QrUrlResponse'] & { expires_in: number }

/**
 * 扫码登录所处阶段。
 *
 * 契约里的 `status` 只写成 `string`、注释列了 `pending` / `confirmed` / `expired`；
 * 后端实现（`crates/identity/src/api/qr.rs`）还会回 `scanned`，旧二维码弹窗另有一支
 * `cancelled` 分支，所以这里保留五值联合，不做更窄的收窄。
 */
export type WechatLoginQrPollStatus =
  /** 二维码已生成，尚未被扫描。 */
  | 'pending'
  /** 已扫码，等待手机端点击「确认登录」。 */
  | 'scanned'
  /** 手机端点了「取消登录」，需要重新生成二维码。 */
  | 'cancelled'
  /** 二维码已过期、或轮询凭据不对（后端对错凭据一律回过期）。 */
  | 'expired'
  /** 已确认登录，token 即本次登录凭证。 */
  | 'confirmed'

/**
 * 扫码登录轮询结果（`/auth/{provider}/login/qr/status`）。
 *
 * 形状同契约 `QrStatusResponse`，只把 `status` 从 `string` 收窄成上面的联合。
 */
export type WechatLoginQrStatusResp = {
  status?: WechatLoginQrPollStatus
  token?: string | null
  username?: string | null
}

/** 微信扫码绑定地址与轮询凭据。 */
export type WechatBindQrUrlResp = Schemas['QrUrlResponse']

/** 微信扫码绑定结果；`confirmed` 表示已绑定，`message` 是失败原因。 */
export type WechatBindQrStatusResp = Schemas['QrStatusResponse']

/** 用户服务协议与通用协议正文。 */
export type UserServiceAgreement = Schemas['AgreementContentResponse']

/** 开发者资格与入驻协议签约状态。 */
export type DevAccessStatus = Schemas['DevAccessStatusResponse']

/** 当前登录人的角色与生效权限码（`GET /auth/users/privileges`）。 */
export type PrivilegesResponse = Schemas['PrivilegesResponse']

/** 权限码字典条目（`GET /auth/permissions`）。 */
export type PermissionItem = Schemas['PermissionResponse']
