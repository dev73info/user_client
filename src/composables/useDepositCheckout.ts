import { type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import {
  createAdapayPayment,
  getAdapayClientPlatform,
  getAdapayPayment,
  type AdapayBusinessPayChannel,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import type { RequirementPaymentMode, RequirementStatus } from '@/api/requirements'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import { isRequirementContractNotSigned } from '@/shared/requirementPaymentError'
import { useAuthStore } from '@/stores/auth'

/** 拉起 Adapay 后前端留着的这一单（字段取契约，真正的状态以后端查询为准）。 */
export type PaymentState = {
  order_no: string
  requirement_id: string
  channel: string
  amount_fen: number
  status: string
  pay_url?: string | null
}

/** 结账只用得到待付需求的这几项（视图侧 `PendingRequirementView` 的子集）。 */
export type CheckoutRequirement = {
  id: string
  status: RequirementStatus
  budget?: number | null
  paymentMode: RequirementPaymentMode
}

export type DepositCheckoutOptions = {
  depositRequirement: Ref<CheckoutRequirement | null>
  depositChannel: Ref<AdapayBusinessPayChannel>
  depositPayment: Ref<PaymentState | null>
  depositLoading: Ref<boolean>
  depositPolicyAccepted: Ref<boolean>
  loadPendingRequirements: () => Promise<void>
}

/**
 * 定金 / 尾款的「发起 — 跳转 — 回来确认」这一支：Adapay 下单、合同未签的拦截，
 * 以及支付确认成功后回写卡片状态并重拉待办需求。
 *
 * 金额**不由前端传**：`POST /api/adapay/requirements/{id}/deposit|final-payment` 的请求体只有
 * `pay_channel` 与 `client_platform`，扣多少由服务端按合同快照算，回执里的 `amount_fen` 才是准数。
 *
 * 与 `useDepositPayment` 是同一条依赖线上的一段：支付域持状态，本 composable 只拿 ref 去驱动，
 * 失败分支一律走 `TMessage` 与路由，不写视觉。
 */
export function useDepositCheckout(options: DepositCheckoutOptions) {
  const auth = useAuthStore()
  const router = useRouter()

  async function submitDepositPayment() {
    if (!options.depositRequirement.value) {
      return
    }

    if (
      options.depositRequirement.value.status === 'pending_deposit' &&
      !options.depositPolicyAccepted.value
    ) {
      TMessage.warning('请先确认“定金服务费与退款规则”后再支付定金')
      return
    }

    const currentStage =
      options.depositRequirement.value.status === 'pending_final' ? '尾款' : '定金'
    const channel = options.depositChannel.value
    const clientPlatform = getAdapayClientPlatform()
    if (options.depositRequirement.value.paymentMode !== 'platform_guarantee') {
      TMessage.warning('无担保订单不通过平台收款，请由双方按约定自行结算')
      return
    }

    options.depositLoading.value = true
    try {
      if (!options.depositPayment.value) {
        const payment: AdapayPaymentResponse = await createAdapayPayment(
          auth.token,
          options.depositRequirement.value.id,
          currentStage === '定金' ? 'deposit' : 'final',
          channel,
          clientPlatform,
        )
        options.depositPayment.value = {
          order_no: payment.payment_id,
          requirement_id: payment.requirement_id,
          channel: payment.pay_channel,
          amount_fen: payment.amount_fen,
          status: payment.status,
          pay_url: payment.pay_url,
        }
        TMessage.success(`${currentStage}支付订单已生成，正在跳转支付页`)
        router.push({
          name: 'payment',
          query: buildAdapayPaymentQuery({
            paymentId: payment.payment_id,
            requirementId: payment.requirement_id,
            channel,
            clientPlatform,
            amountCny: payment.amount_cny,
            qrContent: payment.pay_url,
          }),
        })
        return
      }

      const current = await getAdapayPayment(auth.token, options.depositPayment.value.order_no)
      if (current.status !== 'paid') {
        options.depositPayment.value = {
          ...options.depositPayment.value,
          status: current.status,
        }
        TMessage.warning('支付尚未完成，请先完成 Adapay 支付')
        return
      }
      TMessage.success(`${currentStage}支付确认成功`)
      options.depositPayment.value = null
      void router.replace({ name: 'home' })
      await options.loadPendingRequirements()
    } catch (err) {
      const message = err instanceof Error ? err.message : '支付失败'
      if (isRequirementContractNotSigned(err)) {
        // 按后端业务错误码分支（`REQUIREMENT_CONTRACT_NOT_SIGNED`），不拿文案做匹配：
        // 文案会改、错误码不会。
        TMessage.warning('当前需求需先由开发者（乙方）签署，再由您（甲方）签署协议后，才能支付定金')
      } else {
        TMessage.error(message)
      }
    } finally {
      options.depositLoading.value = false
    }
  }

  return { submitDepositPayment }
}
