import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { getAdapayPayment, type PaymentOrderResponse } from '@/api/adapay'
import { refreshPaymentOrder } from '@/api/payments'
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

/** 渠道返回的客户端动作（`payment_provider` 的 `ClientAction`）。 */
type ClientAction = {
  redirect_url?: string | null
  qr_code?: string | null
  sdk_payload?: { pay_info?: string | null } | null
}

/**
 * 从订单的 `client_action` 里取支付地址。
 *
 * 后端这个字段是**对象**（`redirect_url` / `qr_code` / `sdk_payload`），不是字符串。
 * 早先这里按字符串读，于是需求单与打赏单进了支付页取不到二维码，只剩「二维码生成失败」，
 * 而同一个字段在充值弹窗里是按对象解析的——两处口径必须一致。
 * 兼容老形态：历史数据里可能存着 JSON 字符串或直接的收银台地址。
 */
function extractPayUrl(action: unknown): string {
  if (typeof action === 'string') {
    const text = action.trim()
    if (!text) {
      return ''
    }
    if (!text.startsWith('{')) {
      return text
    }
    try {
      return extractPayUrl(JSON.parse(text) as unknown)
    } catch {
      return ''
    }
  }

  if (!action || typeof action !== 'object') {
    return ''
  }

  const value = action as ClientAction
  return (value.redirect_url ?? value.qr_code ?? value.sdk_payload?.pay_info ?? '').trim()
}

/**
 * Adapay 订单的加载 / 查单 / 轮询刷新。
 *
 * 首屏通过 `GET /api/payment/orders/{order_no}` 读取本地订单；手动查询与轮询则通过
 * `POST /api/payment/orders/{order_no}/refresh` 向渠道核对真实结果并补记入账。
 * 只有 `status === 'paid'` 才算完成，未到账与查询失败要展示原因。
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
  /** 服务端支付单金额（分）：支付页展示以它为准，query 上的 `amount_cny` 只是入口时的快照 */
  const adapayOrderAmountFen = () => adapayPayment.value?.amount_fen ?? null

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
      const order = await refreshPaymentOrder(options.token(), ctx.paymentId)
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
    adapayOrderAmountFen,
    /** 订单上的支付动作（收银台地址 / 微信支付参数），前端据此跳转或渲二维码 */
    adapayPayUrl: () => extractPayUrl(adapayPayment.value?.client_action),
    confirmPayment,
    refreshPaymentOnReturn,
  }
}
