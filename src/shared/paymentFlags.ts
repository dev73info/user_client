/**
 * 支付页「这是哪种支付」的判定（纯函数，不依赖 Vue）。
 *
 * 视图里所有 `v-if` 分支都是这组布尔的直接映射，测试也断的是这套语义，
 * 因此判定必须集中且可单独验：`resolvePaymentFlags(ctx, 服务端渠道)` 一个入口，
 * 不允许在组件里再拼第二套条件。
 */

import type { PaymentChannel, PaymentQueryContext } from './paymentQuery'

export type PaymentFlags = {
  /** 保证金 + 无单号 + query 微信 + 金额 > 0：还没下单，先在下单前授权 */
  isDeveloperDepositIntentMode: boolean
  /** 意图模式：adapay 微信单尚未创建，带 requirement_id + milestone 或保证金金额，微信内静默授权后自动下单 */
  isIntentMode: boolean
  /** 资源 / 打赏的本站微信中间页（两者形态一致，仅在订单域与接口上分叉） */
  isWechatMiddlePage: boolean
  isAlipayPage: boolean
  isWechatPayment: boolean
  isWechatMobilePayment: boolean
  isWechatPcPayment: boolean
  isAlipayMobilePayment: boolean
  isUnionPayment: boolean
  isUnionMobilePayment: boolean
  isUnionPcPayment: boolean
}

/**
 * @param ctx 已解析的 query 快照
 * @param resolvedChannel 实际渠道：服务端订单返回的渠道优先于 query（订单建好后以订单为准）
 */
export function resolvePaymentFlags(
  ctx: PaymentQueryContext,
  resolvedChannel: PaymentChannel,
): PaymentFlags {
  const isDeveloperDepositIntentMode =
    ctx.isDeveloperDeposit &&
    !ctx.paymentId &&
    ctx.channel === 'wechat' &&
    Number.isFinite(Number(ctx.amountCny)) &&
    Number(ctx.amountCny) > 0

  const isIntentMode =
    ctx.isAdapay &&
    (isDeveloperDepositIntentMode ||
      (!ctx.paymentId &&
        Boolean(ctx.requirementId && ctx.milestone) &&
        resolvedChannel === 'wechat'))

  // 中间页自带订单域，与需求定金 / 保证金两条主通道互斥。
  const isWechatMiddlePage = ctx.isResourceWechat || ctx.isTipWechat

  const isAlipayPage = resolvedChannel === 'alipay' && !ctx.isAdapay

  const isWechatPayment =
    ctx.isTipWechat || ctx.isResourceWechat || (ctx.isAdapay && resolvedChannel === 'wechat')

  const isWechatMobilePayment =
    ctx.isTipWechat ||
    ctx.isResourceWechat ||
    (isWechatPayment &&
      !ctx.isResourceWechat &&
      !ctx.isTipWechat &&
      ctx.clientPlatform === 'mobile')

  const isWechatPcPayment = isWechatPayment && !isWechatMiddlePage && ctx.clientPlatform === 'pc'

  const isAlipayMobilePayment =
    ctx.isAdapay && resolvedChannel === 'alipay' && ctx.clientPlatform === 'mobile'

  const isUnionPayment = ctx.isAdapay && resolvedChannel === 'union'

  return {
    isDeveloperDepositIntentMode,
    isIntentMode,
    isWechatMiddlePage,
    isAlipayPage,
    isWechatPayment,
    isWechatMobilePayment,
    isWechatPcPayment,
    isAlipayMobilePayment,
    isUnionPayment,
    isUnionMobilePayment: isUnionPayment && ctx.clientPlatform === 'mobile',
    isUnionPcPayment: isUnionPayment && ctx.clientPlatform === 'pc',
  }
}

/** 页面标题：支付结果态优先，其次按渠道给「这是什么支付」 */
export function paymentHeading(flags: PaymentFlags, hasPaymentResult: boolean): string {
  if (hasPaymentResult) return '支付结果'
  if (flags.isWechatMobilePayment) return '微信支付'
  if (flags.isAlipayMobilePayment) return '支付宝支付'
  if (flags.isUnionMobilePayment) return '云闪付'
  return '扫码支付'
}
