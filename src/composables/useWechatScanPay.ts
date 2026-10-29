import QRCode from 'qrcode'
import type { Router } from 'vue-router'

import { getResourceWechatAuthUrl, type ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { fenToYuanText, isWechatBrowser, wechatMiddleQuery } from '@/shared/resourceSale'

/**
 * 微信渠道的扫码支付准备。
 *
 * 公众号支付（`wx_pub`）的产物是给 `WeixinJSBridge` 的参数包 `pay_info`，
 * **不是二维码内容**——直接画成码，用户扫到只是一段 JSON。
 * 能扫的码是**微信授权地址**（`oauth2/authorize?...snsapi_base`），完整链路：
 *
 *   扫码 → 微信内置浏览器打开 authorize → 静默授权（不弹确认）→ 回调拿 code
 *   → 服务端换 openid 挂到订单 → 支付页调 `wechat-jsapi` 拿 pay_info
 *   → `WeixinJSBridge` 拉起收银台
 *
 * 回调落在支付页（站点自己的域名，已在公众号「网页授权域名」白名单里），
 * 所以不依赖渠道收银台的域名，也就不会撞上 `10003 redirect_uri 域名不一致`。
 */

export type WechatPaySurface = {
  /** 二维码内容：PC 端画成码；微信内不用（直接跳） */
  qrTarget: string
  /** 微信内是否应该直接跳支付页而不是出码 */
  jumpToPayment: boolean
  /** 支付页路由参数，跳转时用 */
  query: ReturnType<typeof wechatMiddleQuery>
}

/**
 * 计算微信渠道该出什么码 / 该不该跳。
 *
 * 拿不到授权地址时退回支付页地址：支付页自己也会再试一次授权，
 * 总比让用户停在「二维码生成失败」强。
 */
export async function buildWechatPaySurface(input: {
  order: ResourcePurchaseOrder
  token: string
  router: Router
  userAgent: string
  clientPlatform: 'mobile' | 'desktop'
}): Promise<WechatPaySurface> {
  const query = wechatMiddleQuery({
    orderNo: input.order.order_no,
    token: input.token,
    clientPlatform: input.clientPlatform,
    amountCny: fenToYuanText(input.order.amount_fen),
  })
  const returnUrl = new URL(
    input.router.resolve({ name: 'payment', query }).href,
    window.location.origin,
  ).toString()

  if (isWechatBrowser(input.userAgent)) {
    // 本来就在微信里，无需扫码，直接进支付页走静默授权
    return { qrTarget: returnUrl, jumpToPayment: true, query }
  }

  let qrTarget = returnUrl
  try {
    const auth = await getResourceWechatAuthUrl(input.order.order_no, input.token, returnUrl)
    // 已经挂过 openid 的单不用再授权，支付页直接就能拉起
    if (!auth.authorized && auth.url.trim()) {
      qrTarget = auth.url
    }
  } catch {
    qrTarget = returnUrl
  }

  return { qrTarget, jumpToPayment: false, query }
}

/** 把二维码内容渲染成 data URL；失败返回空串（调用方据此提示重试）。 */
export async function renderWechatQr(target: string): Promise<string> {
  try {
    return await QRCode.toDataURL(target, { width: 220, margin: 1 })
  } catch {
    return ''
  }
}
