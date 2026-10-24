import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { getAdapayPayment, type PaymentOrderResponse } from '@/api/adapay'
import {
  normalizePaymentChannel,
  type PaymentChannel,
  type PaymentQueryContext,
} from '@/shared/paymentQuery'
import type { PaymentSession } from '@/composables/usePaymentSession'

type UseAdapayOrderOptions = {
  /** 只传 query 快照的 getter：服务端渠道反过来依赖本 composable 的订单，不能在这里读整份判定 */
  ctx: () => PaymentQueryContext
  token: () => string
  isAuthed: () => boolean
  hydrate: () => void
  session: PaymentSession
}

/** 已收款（终态）：契约 `PaymentOrderStatus` 只有 `created / pending / paid / failed / canceled`。 */
function isPaidStatus(status: string): boolean {
  return status === 'paid'
}

/**
 * Adapay 订单的加载 / 查单 / 轮询刷新。
 *
 * 契约里**没有「确认支付」接口**：支付结果只有一个来源——`GET /api/payment/orders/{order_no}`
 * （这里的 `order_no` 就是下单回执里的 `payment_id`，也是支付页 query 上的 `payment_id`）。
 * 所以「确认」= 查一次单，`status === 'paid'` 才算完成。
 *
 * 与视图的分工：这里只管「订单现在是什么状态」，要不要停轮询、要不要展示结果页由页面级 composable 决定。
 */
export function useAdapayOrder(options: UseAdapayOrderOptions) {
  const adapayPayment = ref<PaymentOrderResponse | null>(null)
  /** 正在查单（按钮文案与禁用态） */
  const confirming = ref(false)

  /** 实际渠道：订单建好后以服务端返回的渠道为准，没有订单才退回 query 上声明的渠道 */
  const resolvedChannel = computed<PaymentChannel>(
    () => normalizePaymentChannel(adapayPayment.value?.channel ?? '') || options.ctx().channel,
  )

  const hasAdapayPayment = () => Boolean(adapayPayment.value)

  async function loadAdapayPayment(paymentIdValue: string) {
    const ctx = options.ctx()
    if (!ctx.isAdapay || !options.token() || !paymentIdValue) {
      return
    }

    try {
      adapayPayment.value = await getAdapayPayment(options.token(), paymentIdValue)
    } catch {
      adapayPayment.value = null
    }
  }

  watch(
    [() => options.ctx().paymentId, () => options.token(), () => options.ctx().isAdapay],
    async ([id, token, isAdapay]) => {
      if (!id || !token || !isAdapay || options.ctx().isHandoff) {
        adapayPayment.value = null
        return
      }
      await loadAdapayPayment(id)
    },
    {
      immediate: true,
    },
  )

  async function confirmPayment() {
    const ctx = options.ctx()
    if (
      !ctx.isAdapay ||
      !ctx.paymentId ||
      confirming.value ||
      options.session.paid.value ||
      ctx.isHandoff
    ) {
      return
    }

    options.hydrate()
    if (!options.isAuthed()) {
      return
    }

    confirming.value = true
    options.session.confirmationError.value = ''
    try {
      const order = await getAdapayPayment(options.token(), ctx.paymentId)
      adapayPayment.value = order
      if (isPaidStatus(order.status)) {
        options.session.markPaymentPaid()
      }
    } catch (err) {
      options.session.confirmationError.value =
        err instanceof Error ? err.message : '支付结果暂时无法查询，请稍后重试'
    } finally {
      confirming.value = false
    }
  }

  /** 从收银台 / 支付 App 切回本页时补一次查单（切后台期间到账的最常见） */
  function refreshPaymentOnReturn() {
    if (document.visibilityState === 'visible') void confirmPayment()
  }

  // 服务端状态自己变成 paid 时立刻切「支付结果」态（不必等用户点查询）
  watch(
    () => adapayPayment.value?.status,
    (status) => {
      if (status && isPaidStatus(status)) options.session.markPaymentPaid()
    },
  )

  onMounted(() => {
    document.addEventListener('visibilitychange', refreshPaymentOnReturn)
    window.addEventListener('focus', refreshPaymentOnReturn)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', refreshPaymentOnReturn)
    window.removeEventListener('focus', refreshPaymentOnReturn)
  })

  return {
    adapayPayment,
    confirming,
    resolvedChannel,
    hasAdapayPayment,
    /** 订单上的支付动作（收银台地址 / 微信支付参数），前端据此跳转或渲二维码 */
    adapayPayUrl: () =>
      typeof adapayPayment.value?.client_action === 'string'
        ? adapayPayment.value.client_action
        : '',
    confirmPayment,
    refreshPaymentOnReturn,
  }
}
