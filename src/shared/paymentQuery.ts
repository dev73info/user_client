/**
 * 支付页 query 解析（纯函数，不依赖 Vue）。
 *
 * 支付页是 5 条并行通道的公共落地页：Adapay 扫码 / Adapay 微信 JSAPI / 资源购买中间页
 * （`resource_wechat=1&order_no=&token=`）/ 打赏中间页（`tip_wechat=1&order_no=&token=`）/
 * 微信跨设备 handoff（`payment_handoff=1`）。通道差别全在 query 的标志位上，
 * 所以先把 query 收成一份可判定的快照，渠道判定（`paymentFlags`）与文案拼装
 * （`paymentContent`）只读这份快照，避免视图里到处 `String(route.query.x ?? '')`。
 */

import { isWechatPaymentHandoff } from '@/utils/wechatPayment'

export type PaymentChannel = 'alipay' | 'wechat' | 'union'
export type PaymentPlatform = 'mobile' | 'pc'

export type PaymentQueryContext = {
  /** `adapay=1`：这笔单走 Adapay（扫码 / 微信 / 云闪付都算） */
  isAdapay: boolean
  /** `developer_deposit=1`：开发者保证金充值，与需求定金是两套订单域 */
  isDeveloperDeposit: boolean
  paymentId: string
  requirementId: string
  milestone: string
  amountCny: string
  couponCode: string
  expiresAt: string
  /** query 上声明的渠道（默认 alipay）；服务端订单返回的渠道优先，见 `resolvedChannel` */
  channel: PaymentChannel
  clientPlatform: PaymentPlatform
  /** 资源购买 PC 出码 → 手机打开的本站中间页（BUG-010 / R008） */
  isResourceWechat: boolean
  resourceOrderNo: string
  resourceToken: string
  /** R010 打赏 PC 出码 → 手机打开的本站中间页 */
  isTipWechat: boolean
  tipOrderNo: string
  tipToken: string
  /** 微信内扫码后跳到本页的跨设备 handoff（BUG-010），口径与路由守卫的免登录白名单同源 */
  isHandoff: boolean
  /** query 里带的二维码内容（`qr_content` / 老的 `alipay_order_string`） */
  queryQrContent: string
  /** 微信 OAuth 回调带回来的失败原因 */
  wechatOauthError: string
  /** 微信 OAuth 回调刚成功返回（避免重复跳授权造成死循环） */
  wechatOauthReturned: boolean
}

function text(value: unknown): string {
  return String(value ?? '')
}

function trimmed(value: unknown): string {
  return text(value).trim()
}

function isOn(value: unknown): boolean {
  return value === '1'
}

/**
 * 渠道名归一：后端会回 `alipay_qr` / `wx_pub` / `union_qr` 这类细分渠道，
 * 支付页只按三大类展示，认不出的一律返回空串交给调用方兜底。
 */
export function normalizePaymentChannel(value: string): PaymentChannel | '' {
  switch (value.trim().toLowerCase()) {
    case 'alipay':
    case 'alipay_qr':
    case 'alipay_wap':
      return 'alipay'
    case 'wechat':
    case 'wx_pub':
    case 'wx_lite':
      return 'wechat'
    case 'union':
    case 'union_qr':
    case 'union_wap':
      return 'union'
    default:
      return ''
  }
}

/**
 * 客户端平台：query 显式指定时以 query 为准（PC 出码会给一个指向手机页的链接），
 * 否则按浏览器 UA 推断（`fallbackPlatform` 由调用方用 `getAdapayClientPlatform()` 算出）。
 */
export function readPaymentPlatform(
  raw: unknown,
  fallbackPlatform: PaymentPlatform,
): PaymentPlatform {
  const value = trimmed(raw)
  return value === 'mobile' || value === 'pc' ? value : fallbackPlatform
}

export function readPaymentQuery(
  query: Record<string, unknown>,
  fallbackPlatform: PaymentPlatform,
): PaymentQueryContext {
  const orderNo = trimmed(query.order_no)
  const token = trimmed(query.token)

  return {
    isAdapay: isOn(query.adapay),
    isDeveloperDeposit: isOn(query.developer_deposit),
    paymentId: text(query.payment_id),
    requirementId: text(query.requirement_id),
    milestone: text(query.milestone),
    amountCny: text(query.amount_cny),
    couponCode: text(query.coupon_code),
    expiresAt: text(query.expires_at),
    channel: normalizePaymentChannel(text(query.channel) || 'alipay') || 'alipay',
    clientPlatform: readPaymentPlatform(query.client_platform, fallbackPlatform),
    // 中间页两条分支的形态一致：一个标志位 + 订单号 + 订单 token 都齐了才算中间页。
    isResourceWechat: isOn(query.resource_wechat) && Boolean(orderNo) && Boolean(token),
    resourceOrderNo: orderNo,
    resourceToken: token,
    isTipWechat: isOn(query.tip_wechat) && Boolean(orderNo) && Boolean(token),
    tipOrderNo: orderNo,
    tipToken: token,
    isHandoff: isWechatPaymentHandoff(query),
    queryQrContent: text(query.qr_content ?? query.alipay_order_string ?? ''),
    wechatOauthError: text(query.wechat_oauth_error),
    wechatOauthReturned: query.wechat_oauth === 'success',
  }
}
