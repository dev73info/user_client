export type ResourcePayChannelUi = 'alipay' | 'wechat' | 'union' | 'points'

/** 地址参数 `?pay=` 能表达的渠道：只有现金两渠道，积分 / 银联不进深链。 */
export type ResourcePayDeepLinkChannel = Extract<ResourcePayChannelUi, 'wechat' | 'alipay'>

/**
 * 解析资源详情地址上的 `?pay=`。
 *
 * **只认渠道偏好，不认任何身份**：`token` / `user` / `open_id` / `ticket` 这类参数
 * 一律不进白名单，身份只来自当前浏览器的登录会话（见 `useResourcePayDeepLink`）。
 * 非法值 / 数组里的非法首项一律丢弃，不把任意字符串写回地址栏。
 */
export function parseResourcePayChannel(raw: unknown): ResourcePayDeepLinkChannel | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === 'wechat' || value === 'alipay' ? value : null
}

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
