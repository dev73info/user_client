export type ResourcePayChannelUi = 'alipay' | 'wechat' | 'union' | 'points'

/** 前端支付渠道 → 后端 pay_channel。 */

export function toResourcePayChannel(channel: ResourcePayChannelUi): string {
  if (channel === 'wechat') {
    return 'wx_pub'
  }
  if (channel === 'union') {
    return 'union'
  }
  if (channel === 'points') {
    return 'points'
  }
  return 'alipay'
}

/** 判定「某渠道的待支付码能否复用」所需的订单字段。 */

export type ReusableCashQrOrderLike = {
  status: string
  pay_channel?: string | null
}

/**
 * 本页是否已有「所选渠道」可复用的待支付码。
 *
 * 三条件同时成立才复用：订单 `pending`、已渲染出二维码、订单渠道与所选渠道一致。
 * 换渠道的旧单一律不复用、不展示（R031：切渠道时旧渠道单的可付款面已被作废）。
 */

export function canReuseCashQrForChannel(
  order: ReusableCashQrOrderLike | null | undefined,
  channel: ResourcePayChannelUi,
  hasQr: boolean,
): boolean {
  if (!order || order.status !== 'pending' || !hasQr) {
    return false
  }
  const orderChannel = (order.pay_channel ?? '').trim().toLowerCase()
  if (channel === 'alipay') {
    return orderChannel === 'alipay'
  }
  if (channel === 'wechat') {
    return orderChannel === 'wx_pub' || orderChannel === 'wechat'
  }
  return orderChannel === channel
}
