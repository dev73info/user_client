import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'

import { getAdapayClientPlatform } from '@/api/adapay'
import { parseWechatPayInfo } from '@/utils/wechatPayment'
import { readPaymentQuery, type PaymentChannel } from '@/shared/paymentQuery'
import { resolvePaymentFlags } from '@/shared/paymentFlags'
import {
  hasPaymentOrder,
  isInvalidAdapayContent,
  isInvalidUnionContent,
  matchAlipayPaymentUrl,
  matchUnionPaymentUrl,
  pickPaymentContent,
  pickQrPayload,
} from '@/shared/paymentContent'
import {
  countdownRemainingMs,
  fenToCny,
  formatCountdownText,
  parseExpiresAtMs,
  pickDisplayAmountCny,
  pickDisplayOrderNo,
  pickSubjectId,
  pickSubjectLabel,
} from '@/shared/paymentDisplay'

/** 中间页 `wechat-status` 回填的订单里，展示只需要这几个字段 */
export type PaymentOrderDetail = {
  order_no: string
  amount_fen: number
  status: string
}

type UsePaymentContextOptions = {
  /** 实际渠道（服务端订单返回的渠道优先，由 `useAdapayOrder` 解析） */
  channel: () => PaymentChannel
  /** 打赏中间页回填的支付参数 */
  tipPayInfo: () => string
  /** 资源中间页回填的支付参数 */
  resourcePayInfo: () => string
  adapayPayUrl: () => string
  /** 服务端支付单的金额（分）；没拿到订单时为 `null` */
  adapayOrderAmountFen: () => number | null
  /** 是否已拿到 Adapay 订单（拿不到时按内容判断「订单不匹配」） */
  hasAdapayPayment: () => boolean
  resourceOrder: () => { order_no: string; amount_fen: number; resource_id: number } | null
  tipOrder: () => { order_no: string; amount_fen: number; developer: string } | null
}

/**
 * 支付页的「这是什么支付」上下文：query 快照 → 渠道判定 → 展示内容 / 二维码 / 剩余时间。
 *
 * 只读，不发请求；服务端订单与中间页回填的内容通过 getter 注入，避免这里反向依赖那些 composable。
 */
export function usePaymentContext(options: UsePaymentContextOptions) {
  const route = useRoute()
  const router = useRouter()

  const query = computed(() => (route.query ?? {}) as Record<string, unknown>)
  const ctx = computed(() => readPaymentQuery(query.value, getAdapayClientPlatform()))

  /** 实际渠道：订单建好后以服务端返回的渠道为准 */
  const resolvedChannel = computed<PaymentChannel>(() => options.channel())

  const flags = computed(() => resolvePaymentFlags(ctx.value, resolvedChannel.value))

  const rawPaymentContent = computed(() =>
    pickPaymentContent({
      tipPayInfo: options.tipPayInfo(),
      resourcePayInfo: options.resourcePayInfo(),
      adapayPayUrl: options.adapayPayUrl(),
      queryQrContent: ctx.value.queryQrContent,
    }),
  )

  const wechatPayInfo = computed(() => parseWechatPayInfo(rawPaymentContent.value))
  const alipayPaymentUrl = computed(() => matchAlipayPaymentUrl(rawPaymentContent.value))
  const unionPaymentUrl = computed(() => matchUnionPaymentUrl(rawPaymentContent.value))

  /** 是否微信内置浏览器：决定能不能本地调起 JSAPI */
  const isWechatBrowser = computed(
    () => typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent),
  )

  /**
   * PC 微信的跨设备跳转链接：手机扫码后带着支付参数落到本页（手机端）再调起 JSAPI。
   * 用 `router.resolve` 生成与当前路由模式（history / hash）匹配的链接，
   * 避免把 query 塞进 hash 导致 history 模式丢参数。
   */
  const wechatHandoffUrl = computed(() => {
    if (!flags.value.isWechatPcPayment || !wechatPayInfo.value || typeof window === 'undefined') {
      return ''
    }

    const resolved = router.resolve({
      name: 'payment',
      query: {
        adapay: '1',
        payment_id: ctx.value.paymentId,
        payment_handoff: '1',
        requirement_id: ctx.value.requirementId,
        channel: 'wechat',
        client_platform: 'mobile',
        amount_cny: ctx.value.amountCny,
        qr_content: rawPaymentContent.value,
      },
    })
    return new URL(resolved.href, window.location.origin).toString()
  })

  const invalidAdapayPaymentContent = computed(() =>
    isInvalidAdapayContent({
      isAdapay: ctx.value.isAdapay,
      hasAdapayPayment: options.hasAdapayPayment(),
      channel: resolvedChannel.value,
      unionUrl: unionPaymentUrl.value,
      isUnionMobilePayment: flags.value.isUnionMobilePayment,
      content: rawPaymentContent.value,
    }),
  )

  /** 二维码里编什么内容（手机端各通道不出码，见 `pickQrPayload`） */
  const qrContent = computed(() =>
    pickQrPayload({
      isWechatMobilePayment: flags.value.isWechatMobilePayment,
      isAlipayMobilePayment: flags.value.isAlipayMobilePayment,
      isUnionMobilePayment: flags.value.isUnionMobilePayment,
      isWechatPcPayment: flags.value.isWechatPcPayment,
      invalidAdapayContent: invalidAdapayPaymentContent.value,
      handoffUrl: wechatHandoffUrl.value,
      content: rawPaymentContent.value,
    }),
  )

  const invalidUnionPaymentContent = computed(() =>
    isInvalidUnionContent({
      isUnion: flags.value.isUnionPayment,
      content: rawPaymentContent.value,
      unionUrl: unionPaymentUrl.value,
      qrPayload: qrContent.value,
    }),
  )

  const qrDataUrl = ref('')

  watchEffect(async () => {
    qrDataUrl.value = ''
    if (!qrContent.value) {
      return
    }

    try {
      qrDataUrl.value = await QRCode.toDataURL(qrContent.value, {
        width: 280,
        margin: 2,
      })
    } catch {
      qrDataUrl.value = ''
    }
  })

  const hasOrder = computed(() =>
    hasPaymentOrder({
      flags: flags.value,
      paymentId: ctx.value.paymentId,
      isAdapay: ctx.value.isAdapay,
      qrPayload: qrContent.value,
    }),
  )

  // ---------------------------------------------------------------------------
  // 剩余支付时间
  // ---------------------------------------------------------------------------

  const nowTick = ref(Date.now())
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  const expiresAtMs = computed(() => parseExpiresAtMs(ctx.value.expiresAt))
  const countdownMs = computed(() => countdownRemainingMs(expiresAtMs.value, nowTick.value))
  const isExpired = computed(() => Number.isFinite(countdownMs.value) && countdownMs.value <= 0)
  const countdownText = computed(() => formatCountdownText(ctx.value.expiresAt, countdownMs.value))

  // ---------------------------------------------------------------------------
  // 支付信息栏
  // ---------------------------------------------------------------------------

  const displayOrderNo = computed(() =>
    pickDisplayOrderNo({
      isWechatMiddlePage: flags.value.isWechatMiddlePage,
      isTipWechat: ctx.value.isTipWechat,
      tipDetailOrderNo: options.tipOrder()?.order_no ?? '',
      resourceDetailOrderNo: options.resourceOrder()?.order_no ?? '',
      tipOrderNo: ctx.value.tipOrderNo,
      resourceOrderNo: ctx.value.resourceOrderNo,
      paymentId: ctx.value.paymentId,
      isIntentMode: flags.value.isIntentMode,
    }),
  )

  const tipAmountCny = computed(() => fenToCny(options.tipOrder()?.amount_fen))
  const resourceAmountCny = computed(() => fenToCny(options.resourceOrder()?.amount_fen))
  /** 服务端支付单金额：刷新页面后 query 上没有 `amount_cny`，以订单为准 */
  const orderAmountCny = computed(() => fenToCny(options.adapayOrderAmountFen()))

  const displayAmountCny = computed(() =>
    pickDisplayAmountCny({
      isTipWechat: ctx.value.isTipWechat,
      isResourceWechat: ctx.value.isResourceWechat,
      tipAmountCny: tipAmountCny.value,
      resourceAmountCny: resourceAmountCny.value,
      orderAmountCny: orderAmountCny.value,
      amountCny: ctx.value.amountCny,
    }),
  )

  const displayRequirementLabel = computed(() =>
    pickSubjectLabel(ctx.value.isTipWechat, ctx.value.isResourceWechat),
  )

  const displayRequirementId = computed(() =>
    pickSubjectId({
      isTipWechat: ctx.value.isTipWechat,
      isResourceWechat: ctx.value.isResourceWechat,
      tipDeveloper: options.tipOrder()?.developer ?? '',
      resourceId: options.resourceOrder()?.resource_id,
      requirementId: ctx.value.requirementId,
    }),
  )

  onMounted(() => {
    countdownTimer = setInterval(() => {
      nowTick.value = Date.now()
    }, 1000)
  })

  onUnmounted(() => {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  })

  return {
    ctx,
    flags,
    resolvedChannel,
    isWechatBrowser,
    rawPaymentContent,
    wechatPayInfo,
    alipayPaymentUrl,
    unionPaymentUrl,
    invalidAdapayPaymentContent,
    invalidUnionPaymentContent,
    qrContent,
    qrDataUrl,
    hasOrder,
    expiresAtMs,
    countdownMs,
    isExpired,
    countdownText,
    displayOrderNo,
    displayAmountCny,
    displayRequirementLabel,
    displayRequirementId,
  }
}

export type PaymentContext = ReturnType<typeof usePaymentContext>
