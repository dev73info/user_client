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
import {
  getUnionPaymentAuthorizeUrl,
  isUnionPaymentAuthorizationRequired,
  isWechatPaymentAuthorizationRequired,
} from '@/api/auth'
import type { RequirementPaymentMode, RequirementStatus } from '@/api/requirements'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { useAuthStore } from '@/stores/auth'

/** 拉起 Adapay 后前端留着的这一单（真正的状态以后端查询为准）。 */
export type PaymentState = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  alipay_order_string?: string
  expires_at: string
  adapay?: boolean
}

/** 结账只用得到待付需求的这几项（视图侧 `PendingRequirementView` 的子集）。 */
export type CheckoutRequirement = {
  id: string
  status: RequirementStatus
  budget?: number | null
  paymentMode: RequirementPaymentMode
}

/**
 * 后端「先签合同再付定金」的三种报错。文案是后端英文原话，**不能按中文提示匹配**：
 * 这一支只负责认出来并给用户一句人话，判定口径与拆分前一致。
 */
const CONTRACT_SIGN_HINTS = [
  'developer must sign first and user must sign after that before paying deposit',
  'requirement contract must be signed by developer before paying deposit',
  'contract must be created before paying deposit',
]

export type DepositCheckoutOptions = {
  depositRequirement: Ref<CheckoutRequirement | null>
  depositChannel: Ref<AdapayBusinessPayChannel>
  depositPayment: Ref<PaymentState | null>
  depositLoading: Ref<boolean>
  depositPolicyAccepted: Ref<boolean>
  amountCouponCode: Ref<string>
  discountCouponCode: Ref<string>
  depositRatioPercent: Ref<number>
  loadPendingRequirements: () => Promise<void>
}

/**
 * 定金 / 尾款的「发起 — 跳转 — 回来确认」这一支：Adapay 下单、微信未绑 open_id 的意图模式跳转、
 * 云闪付授权、合同未签的拦截，以及支付确认成功后回写卡片状态并重拉待办需求。
 *
 * 与 `useDepositPayment` 是同一条依赖线上的一段：支付域持状态，本 composable 只拿 ref 去驱动，
 * 失败分支一律走 `TMessage` 与路由，不写视觉。
 */
export function useDepositCheckout(options: DepositCheckoutOptions) {
  const auth = useAuthStore()
  const router = useRouter()

  function finalDepositAmount(item: CheckoutRequirement) {
    return calculateFinalDepositAmount(item, options.depositRatioPercent.value)
  }

  function finalPaymentAmount(item: CheckoutRequirement) {
    return calculateFinalPaymentAmount(item, options.depositRatioPercent.value)
  }

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
        // 定金可带券（P6 / BUG-025）：金额券与折扣券互斥，取了哪张就传哪张；尾款不接券。
        const couponCode =
          currentStage === '定金'
            ? options.amountCouponCode.value || options.discountCouponCode.value || undefined
            : undefined
        const adapayPayment: AdapayPaymentResponse = await createAdapayPayment(
          auth.token,
          options.depositRequirement.value.id,
          currentStage === '定金' ? 'deposit' : 'final',
          channel,
          clientPlatform,
          couponCode,
        )
        options.depositPayment.value = {
          payment_id: adapayPayment.paymentId,
          requirement_id: adapayPayment.requirementId,
          channel,
          amount_cny: Number(adapayPayment.amountCny),
          status: adapayPayment.status,
          alipay_order_string: adapayPayment.payUrl ?? '',
          expires_at: '',
          adapay: true,
        }
        TMessage.success(`${currentStage}支付订单已生成，正在跳转支付页`)
        router.push({
          name: 'payment',
          query: buildAdapayPaymentQuery({
            paymentId: options.depositPayment.value.payment_id,
            requirementId: adapayPayment.requirementId,
            channel,
            clientPlatform,
            amountCny: adapayPayment.amountCny,
            qrContent: adapayPayment.payUrl,
          }),
        })
        return
      }

      if (options.depositPayment.value.adapay) {
        const adapayPayment = await getAdapayPayment(
          auth.token,
          options.depositPayment.value.payment_id,
        )
        if (adapayPayment.status !== 'paid' && adapayPayment.status !== 'confirmed') {
          TMessage.warning('支付尚未完成，请先完成 Adapay 支付')
          return
        }
        TMessage.success(`${currentStage}支付确认成功`)
        options.depositPayment.value = null
        void router.replace({ name: 'home' })
        await options.loadPendingRequirements()
        return
      }

      throw new Error('支付订单状态无效，请重新发起 Adapay 支付')
    } catch (err) {
      const message = err instanceof Error ? err.message : '支付失败'
      if (isWechatPaymentAuthorizationRequired(err)) {
        // 尚未绑定 open_id：直接跳转到支付页（意图模式），由支付页在微信内自动静默授权并下单，
        // 避免在 PC 侧先弹授权二维码、再点一次支付的额外步骤。
        if (!options.depositRequirement.value) {
          return
        }
        const expectedAmount =
          currentStage === '定金'
            ? finalDepositAmount(options.depositRequirement.value)
            : finalPaymentAmount(options.depositRequirement.value)
        router.push({
          name: 'payment',
          query: buildAdapayPaymentQuery({
            requirementId: options.depositRequirement.value.id,
            milestone: currentStage === '定金' ? 'deposit' : 'final',
            channel: 'wechat',
            clientPlatform,
            amountCny: expectedAmount,
            intent: true,
          }),
        })
        return
      } else if (isUnionPaymentAuthorizationRequired(err)) {
        if (clientPlatform !== 'mobile') {
          TMessage.warning('云闪付授权仅适用于移动端，请重新选择支付方式')
          return
        }
        try {
          const authorization = await getUnionPaymentAuthorizeUrl(auth.token, window.location.href)
          if (!authorization.url.trim()) {
            throw new Error('云闪付授权地址为空')
          }
          window.location.assign(authorization.url)
          return
        } catch (authorizationError) {
          TMessage.error(
            authorizationError instanceof Error ? authorizationError.message : '发起云闪付授权失败',
          )
          return
        }
      } else if (CONTRACT_SIGN_HINTS.some((hint) => message.includes(hint))) {
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
