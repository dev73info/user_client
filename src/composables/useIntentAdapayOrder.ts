import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  createAdapayDeveloperDepositPayment,
  createAdapayPayment,
  type AdapayDeveloperDepositPaymentResponse,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import { isWechatPaymentAuthorizationRequired } from '@/api/auth'
import type { PaymentFlags } from '@/shared/paymentFlags'
import type { PaymentQueryContext } from '@/shared/paymentQuery'
import type { PaymentSession } from '@/composables/usePaymentSession'

type UseIntentAdapayOrderOptions = {
  session: PaymentSession
  ctx: () => PaymentQueryContext
  flags: () => PaymentFlags
  token: () => string
  isWechatBrowser: () => boolean
  /** 静默授权进行中：下单要等授权完成，别并发建两张单 */
  silentAuthWaiting: () => boolean
  startSilentWechatAuth: () => Promise<void>
  adapayPayment: Ref<AdapayPaymentResponse | null>
  developerDepositPayment: Ref<AdapayDeveloperDepositPaymentResponse | null>
}

/**
 * 意图模式下单：query 只带「要付什么」，订单由支付页自己创建。
 *
 * 场景是微信内点「支付」后直接输密码付款：授权（snsapi_base，静默）→ 建 adapay wx_pub 订单 →
 * 回写 `payment_id` 到路由（保证后续查单 / 刷新都能定位到这张单）→ 由页面自动调起 JSAPI。
 *
 * 未绑定微信时后端回「需要授权」，这里就地转静默授权二维码，不让用户回订单页重来。
 */
export function useIntentAdapayOrder(options: UseIntentAdapayOrderOptions) {
  const router = useRouter()
  const creatingIntentOrder = ref(false)
  /** 已尝试过下单：失败后不自动无限重试，只留「重试」按钮 */
  const intentOrderAttempted = ref(false)

  async function createIntentAdapayOrder() {
    const ctx = options.ctx()
    const flags = options.flags()
    if (creatingIntentOrder.value || options.silentAuthWaiting()) {
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
      if (flags.isDeveloperDepositIntentMode) {
        const payment = await createAdapayDeveloperDepositPayment(
          options.token(),
          Number(ctx.amountCny),
          'wechat',
          ctx.clientPlatform,
        )
        options.developerDepositPayment.value = payment
        await router.replace({
          name: 'payment',
          query: {
            adapay: '1',
            developer_deposit: '1',
            payment_id: payment.paymentId,
            channel: payment.payChannel,
            client_platform: ctx.clientPlatform,
            amount_cny: payment.amountCny,
            qr_content: payment.payUrl ?? undefined,
          },
        })
        return
      }

      const payment = await createAdapayPayment(
        options.token(),
        ctx.requirementId,
        ctx.milestone === 'final' ? 'final' : 'deposit',
        'wechat',
        ctx.clientPlatform,
      )
      options.adapayPayment.value = payment
      // 回写为已创建订单地址，便于后续确认 / 轮询
      await router.replace({
        name: 'payment',
        query: {
          adapay: '1',
          payment_id: payment.paymentId,
          requirement_id: payment.requirementId,
          channel: 'wechat',
          client_platform: ctx.clientPlatform,
          amount_cny: payment.amountCny,
          qr_content: payment.payUrl ?? undefined,
        },
      })
    } catch (err) {
      if (isWechatPaymentAuthorizationRequired(err)) {
        // 未绑定微信（缺少 open_id）：展示服务号静默授权二维码，扫码无感知完成后自动继续下单。
        await options.startSilentWechatAuth()
        return
      }
      options.session.wechatPayError.value =
        err instanceof Error ? err.message : '微信订单创建失败，请重试。'
    } finally {
      creatingIntentOrder.value = false
    }
  }

  return { creatingIntentOrder, intentOrderAttempted, createIntentAdapayOrder }
}
