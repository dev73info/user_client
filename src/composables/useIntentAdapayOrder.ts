import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { createAdapayPayment, getAdapayPayment, type PaymentOrderResponse } from '@/api/adapay'
import type { PaymentFlags } from '@/shared/paymentFlags'
import type { PaymentQueryContext } from '@/shared/paymentQuery'
import type { PaymentSession } from '@/composables/usePaymentSession'

type UseIntentAdapayOrderOptions = {
  session: PaymentSession
  ctx: () => PaymentQueryContext
  flags: () => PaymentFlags
  token: () => string
  isWechatBrowser: () => boolean
  adapayPayment: Ref<PaymentOrderResponse | null>
}

/**
 * 意图模式下单：query 只带「要付什么」，订单由支付页自己创建。
 *
 * 场景是微信内点「支付」后直接输密码付款：授权（snsapi_base，静默）→ 建 Adapay 微信订单 →
 * 回写 `payment_id` 到路由（保证后续查单 / 刷新都能定位到这张单）→ 由页面自动调起 JSAPI。
 *
 * 下单只有一条契约：`POST /api/adapay/requirements/{requirement_id}/deposit|final-payment`，
 * 请求体只发 `pay_channel=wechat` 与 `client_platform`；金额由服务端按合同快照算，
 * 所以回写的 `amount_cny` 一律取回执里的值，不用前端估算的那个。
 *
 * 下单失败原话提示（契约里没有微信「授权地址」端点，`/auth/wechat/payment/url` 已不存在，
 * 所以这里不再有「未绑定 open_id → 转静默授权」的兜底）。
 */
export function useIntentAdapayOrder(options: UseIntentAdapayOrderOptions) {
  const router = useRouter()
  const creatingIntentOrder = ref(false)
  /** 已尝试过下单：失败后不自动无限重试，只留「重试」按钮 */
  const intentOrderAttempted = ref(false)

  async function createIntentAdapayOrder() {
    const ctx = options.ctx()
    const flags = options.flags()
    if (creatingIntentOrder.value) {
      return
    }
    if (
      !flags.isIntentMode ||
      !flags.isWechatPayment ||
      !options.token() ||
      ctx.isHandoff ||
      (!flags.isWechatPcPayment && !options.isWechatBrowser())
    ) {
      return
    }
    intentOrderAttempted.value = true
    creatingIntentOrder.value = true
    options.session.wechatPayError.value = ''
    try {
      const payment = await createAdapayPayment(
        options.token(),
        ctx.requirementId,
        ctx.milestone === 'final' ? 'final' : 'deposit',
        'wechat',
        ctx.clientPlatform,
      )
      options.adapayPayment.value = await getAdapayPayment(options.token(), payment.payment_id)
      // 回写为已创建订单地址，便于后续确认 / 轮询
      await router.replace({
        name: 'payment',
        query: {
          adapay: '1',
          payment_id: payment.payment_id,
          requirement_id: payment.requirement_id,
          channel: payment.pay_channel,
          client_platform: ctx.clientPlatform,
          amount_cny: payment.amount_cny,
          qr_content: payment.pay_url ?? undefined,
        },
      })
    } catch (err) {
      options.session.wechatPayError.value =
        err instanceof Error ? err.message : '微信订单创建失败，请重试。'
    } finally {
      creatingIntentOrder.value = false
    }
  }

  return { creatingIntentOrder, intentOrderAttempted, createIntentAdapayOrder }
}
