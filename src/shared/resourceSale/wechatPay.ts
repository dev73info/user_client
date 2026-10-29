/**
 * 微信渠道的支付页地址：扫码 / 跳转都用它。
 *
 * 为什么需要这一层：`wx_pub`（公众号支付）的产物是给 `WeixinJSBridge` 用的参数包
 * `pay_info`，**不是二维码内容**——把它画成二维码，用户扫到只是一段 JSON。
 * 真正能扫的「码」是**支付中间页的地址**：手机微信扫开 → 页面在微信内置浏览器里
 * → `snsapi_base` 静默授权拿 openid（不弹确认框）→ 建单拿 pay_info → 拉起收银台。
 *
 * 这条路的域名是站点自己的（已在公众号「网页授权域名」白名单里），
 * 不依赖渠道收银台的域名，因此不会撞上 `10003 redirect_uri 域名与配置不一致`。
 */

/** 微信渠道标识：后端会回 `wx_pub`（公众号）/ `wx_lite`（小程序）。 */
export function isWechatPayChannel(channel: string | null | undefined): boolean {
  const value = (channel ?? '').trim().toLowerCase()
  return value === 'wx_pub' || value === 'wx_lite'
}

/** 当前是否在微信内置浏览器里（只有这里存在 `WeixinJSBridge`）。 */
export function isWechatBrowser(userAgent: string): boolean {
  return /MicroMessenger/i.test(userAgent)
}

/**
 * 支付中间页的路由参数。
 *
 * `resource_wechat=1` 是中间页的开关位，`order_no` + `token` 缺一不可——
 * 页面靠它们取订单详情与建支付单，`token` 与页面登录态是同一个令牌。
 */
export type WechatMiddleQuery = {
  adapay: '1'
  resource_wechat: '1'
  order_no: string
  token: string
  channel: 'wechat'
  client_platform: 'mobile' | 'desktop'
  amount_cny: string
}

export function wechatMiddleQuery(input: {
  orderNo: string
  token: string
  clientPlatform: 'mobile' | 'desktop'
  amountCny: string
}): WechatMiddleQuery {
  return {
    adapay: '1',
    resource_wechat: '1',
    order_no: input.orderNo,
    token: input.token,
    channel: 'wechat',
    client_platform: input.clientPlatform,
    amount_cny: input.amountCny,
  }
}
