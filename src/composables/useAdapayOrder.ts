import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import {
  getAdapayDeveloperDepositPayment,
  getAdapayPayment,
  type AdapayDeveloperDepositPaymentResponse,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import {
  confirmPayment as confirmPaymentApi,
  listPaymentOrders as listPaymentOrdersApi,
  type ConfirmPaymentResp,
} from '@/api/payments'
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

/**
 * Adapay 订单的加载 / 查单 / 轮询刷新。
 *
 * 两条订单域（需求定金、开发者保证金）字段不同但流程一致，所以内部按 `isDeveloperDeposit` 分叉、
 * 对外只暴露「这笔单的 payUrl / 状态 / 是否已拿到订单」。
 *
 * 与视图的分工：这里只管「订单现在是什么状态」，要不要停轮询、要不要展示结果页由页面级 composable 决定。
 */
export function useAdapayOrder(options: UseAdapayOrderOptions) {
  const adapayPayment = ref<AdapayPaymentResponse | null>(null)
  const developerDepositPayment = ref<AdapayDeveloperDepositPaymentResponse | null>(null)
  /** 正在查单（按钮文案与禁用态） */
  const confirming = ref(false)

  const serverChannel = () =>
    adapayPayment.value?.payChannel ?? developerDepositPayment.value?.payChannel ?? ''

  /** 实际渠道：订单建好后以服务端返回的渠道为准，没有订单才退回 query 上声明的渠道 */
  const resolvedChannel = computed<PaymentChannel>(
    () => normalizePaymentChannel(serverChannel()) || options.ctx().channel,
  )

  const hasAdapayPayment = () => Boolean(adapayPayment.value || developerDepositPayment.value)

  async function loadAdapayPayment(paymentIdValue: string) {
    const ctx = options.ctx()
    if (!ctx.isAdapay || !options.token() || !paymentIdValue) {
      return
    }

    try {
      if (ctx.isDeveloperDeposit) {
        developerDepositPayment.value = await getAdapayDeveloperDepositPayment(
          options.token(),
          paymentIdValue,
        )
        adapayPayment.value = null
      } else {
        adapayPayment.value = await getAdapayPayment(options.token(), paymentIdValue)
        developerDepositPayment.value = null
      }
    } catch {
      adapayPayment.value = null
      developerDepositPayment.value = null
    }
  }

  watch(
    [
      () => options.ctx().paymentId,
      () => options.token(),
      () => options.ctx().isAdapay,
      () => options.ctx().isDeveloperDeposit,
    ],
    async ([id, token, isAdapay]) => {
      if (!id || !token || !isAdapay || options.ctx().isHandoff) {
        adapayPayment.value = null
        developerDepositPayment.value = null
        return
      }
      await loadAdapayPayment(id)
    },
    {
      immediate: true,
    },
  )

  /**
   * 409 说明「订单状态已被别处改过」，此时列表里若已是 paid 就按已付处理，
   * 避免确认接口与列表接口口径不一致时把用户卡在「正在确认支付结果」。
   */
  async function checkOrderPaidByList() {
    const rows = await listPaymentOrdersApi(options.token())
    const current = rows.find((item) => item.payment_id === options.ctx().paymentId)
    return current?.status === 'paid'
  }

  async function confirmPayment() {
    const ctx = options.ctx()
    if (!ctx.paymentId || confirming.value || options.session.paid.value || ctx.isHandoff) {
      return
    }

    options.hydrate()
    if (!options.isAuthed()) {
      return
    }

    confirming.value = true
    options.session.confirmationError.value = ''
    try {
      if (ctx.isAdapay) {
        const result = ctx.isDeveloperDeposit
          ? await getAdapayDeveloperDepositPayment(options.token(), ctx.paymentId)
          : await getAdapayPayment(options.token(), ctx.paymentId)
        if (ctx.isDeveloperDeposit) {
          developerDepositPayment.value = result as AdapayDeveloperDepositPaymentResponse
        } else {
          adapayPayment.value = result as AdapayPaymentResponse
        }
        if (result.status !== 'paid' && result.status !== 'confirmed') {
          return
        }

        options.session.markPaymentPaid()
        return
      }

      const channel = resolvedChannel.value === 'wechat' ? 'wechat' : 'alipay'
      const result = await confirmPaymentApi(options.token(), channel, ctx.paymentId)

      if (!result.ok) {
        if (result.status === 409) {
          const isPaid = await checkOrderPaidByList()
          if (isPaid) {
            options.session.markPaymentPaid()
            return
          }
        }
        return
      }

      const payload = result.data as ConfirmPaymentResp | undefined

      if (payload?.status !== 'paid') {
        return
      }

      options.session.markPaymentPaid()
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

  // 服务端状态自己变成 paid / confirmed 时立刻切「支付结果」态（不必等用户点查询）
  watch(
    () => adapayPayment.value?.status ?? developerDepositPayment.value?.status,
    (status) => {
      if (status === 'paid' || status === 'confirmed') options.session.markPaymentPaid()
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
    developerDepositPayment,
    confirming,
    serverChannel,
    resolvedChannel,
    hasAdapayPayment,
    adapayPayUrl: () => adapayPayment.value?.payUrl ?? '',
    developerDepositPayUrl: () => developerDepositPayment.value?.payUrl ?? '',
    confirmPayment,
    refreshPaymentOnReturn,
  }
}
