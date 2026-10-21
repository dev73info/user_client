/**
 * 支付内容与二维码载荷拼装（纯函数，不依赖 Vue）。
 *
 * 支付页要展示的「支付内容」有 5 个来源，优先级固定：
 * 打赏中间页回填 > 资源中间页回填 > Adapay 订单 payUrl > 保证金订单 payUrl > query 自带。
 * 这里把优先级和 URL 形态识别收成纯函数，视图只负责把 ref 传进来。
 */

import type { PaymentChannel } from './paymentQuery'
import type { PaymentFlags } from './paymentFlags'

export type PaymentContentParts = {
  /** 打赏中间页 `complete` / `status` 回填的支付参数 */
  tipPayInfo: string
  /** 资源中间页回填的支付参数 */
  resourcePayInfo: string
  /** Adapay 需求单返回的 payUrl */
  adapayPayUrl: string
  /** Adapay 保证金单返回的 payUrl */
  developerDepositPayUrl: string
  /** query 里的 `qr_content` / `alipay_order_string` */
  queryQrContent: string
}

/** 支付内容优先级：中间页回填 > 订单 payUrl > query 自带（query 那条保持原样，不做 trim） */
export function pickPaymentContent(parts: PaymentContentParts): string {
  return (
    parts.tipPayInfo.trim() ||
    parts.resourcePayInfo.trim() ||
    parts.adapayPayUrl.trim() ||
    parts.developerDepositPayUrl.trim() ||
    parts.queryQrContent
  )
}

/** 支付宝 App / 网页收银台链接（`https://…` 或 `alipays://`） */
export function matchAlipayPaymentUrl(content: string): string {
  const value = content.trim()
  return /^(https?:\/\/|alipays:\/\/)/i.test(value) ? value : ''
}

/** 云闪付收银台链接：必须是 http(s) 且域名带 95516 / unionpay / cloudpay */
export function matchUnionPaymentUrl(content: string): string {
  const value = content.trim()
  return /^(https?:\/\/).*?(95516|unionpay|cloudpay)/i.test(value) ? value : ''
}

/** 内容看起来是不是支付宝的收银台（用于识别「订单渠道与内容不匹配」） */
export function looksLikeAlipayContent(content: string): boolean {
  const value = content.trim()
  return /^(https?:\/\/|alipays:\/\/).*?(alipay|qr\.alipay\.com)/i.test(value)
}

/**
 * Adapay 订单拿不到 / 内容与渠道不匹配：云闪付要 URL（手机端可直接跳起，例外放行）、
 * 支付宝要 URL。命中时页面展示「支付订单不匹配」而不是一个扫不出来的二维码。
 */
export function isInvalidAdapayContent(input: {
  isAdapay: boolean
  hasAdapayPayment: boolean
  channel: PaymentChannel
  unionUrl: string
  isUnionMobilePayment: boolean
  content: string
}): boolean {
  if (!input.isAdapay || input.hasAdapayPayment) {
    return false
  }
  return (
    (input.channel === 'union' && !input.unionUrl && !input.isUnionMobilePayment) ||
    (input.channel === 'alipay' && !looksLikeAlipayContent(input.content))
  )
}

/** 云闪付订单没拿到云闪付链接、也没二维码载荷 */
export function isInvalidUnionContent(input: {
  isUnion: boolean
  content: string
  unionUrl: string
  qrPayload: string
}): boolean {
  return input.isUnion && Boolean(input.content.trim()) && !input.unionUrl && !input.qrPayload
}

/**
 * 二维码里编什么：
 * - 手机端各通道（微信 / 支付宝 / 云闪付）就地调起，不出码；
 * - PC 微信出的是「本页 handoff 链接」，手机扫码后带走支付参数；
 * - 其余直接编支付内容（支付宝收银台地址 / 订单串）。
 */
export function pickQrPayload(input: {
  isWechatMobilePayment: boolean
  isAlipayMobilePayment: boolean
  isUnionMobilePayment: boolean
  isWechatPcPayment: boolean
  invalidAdapayContent: boolean
  handoffUrl: string
  content: string
}): string {
  if (
    input.isWechatMobilePayment ||
    input.isAlipayMobilePayment ||
    input.isUnionMobilePayment ||
    input.invalidAdapayContent
  ) {
    return ''
  }
  if (input.isWechatPcPayment) {
    return input.handoffUrl
  }
  return input.content
}

/** 有没有「可展示的支付入口」：中间页与意图模式始终有（虽然订单还在创建中） */
export function hasPaymentOrder(input: {
  flags: PaymentFlags
  paymentId: string
  isAdapay: boolean
  qrPayload: string
}): boolean {
  if (input.flags.isWechatMiddlePage || input.flags.isIntentMode) {
    return true
  }
  return Boolean(input.paymentId && (input.isAdapay || input.qrPayload || input.flags.isAlipayPage))
}
