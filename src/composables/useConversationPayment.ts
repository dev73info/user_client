import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import {
  createAdapayPayment,
  getAdapayClientPlatform,
  type AdapayBusinessPayChannel,
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

/** 支付弹窗只需需求单的这几个字段。 */
type PayableRequirement = {
  requirement_id: string
  payment_mode: RequirementPaymentMode
  status: RequirementStatus
  budget?: number | null
}

type PaymentSources = {
  token: string
  requirement: PayableRequirement | null
  depositRatioPercent: number
}

/**
 * 会话工具条的支付：定金 / 尾款弹窗与下单跳转。
 *
 * 从 `RequirementConversationActions.vue` 抽出，判断与兜底原样保留：未确认定金规则、非担保模式
 * 都在本地拦下；微信 / 云闪付未授权时按「我的需求」页同一套兜底改道（微信走意图模式静默授权、
 * 云闪付只支持移动端）。
 */
export function useConversationPayment(readSources: () => PaymentSources) {
  const router = useRouter()
  const payVisible = ref(false)
  const payLoading = ref(false)
  const depositPolicyAccepted = ref(false)
  /** 支付弹窗里选中的渠道：与「我的需求」页同一份取值，弹窗关掉即重置回支付宝。 */
  const payChannel = ref<AdapayBusinessPayChannel>('alipay')

  const payStage = computed<'deposit' | 'final'>(() =>
    readSources().requirement?.status === 'pending_final' ? 'final' : 'deposit',
  )
  const payAmount = computed(() => {
    const item = readSources().requirement
    if (!item) {
      return 0.01
    }
    return payStage.value === 'final'
      ? calculateFinalPaymentAmount(item, readSources().depositRatioPercent)
      : calculateFinalDepositAmount(item, readSources().depositRatioPercent)
  })

  function openPayDialog() {
    depositPolicyAccepted.value = false
    payChannel.value = 'alipay'
    payVisible.value = true
  }

  function updatePayChannel(channel: AdapayBusinessPayChannel) {
    if (payChannel.value === channel) {
      return
    }
    payChannel.value = channel
  }

  async function submitPayment() {
    const { token, requirement: item } = readSources()
    if (!item) {
      return
    }

    if (payStage.value === 'deposit' && !depositPolicyAccepted.value) {
      TMessage.warning('请先确认“定金服务费与退款规则”后再支付定金')
      return
    }
    if (item.payment_mode !== 'platform_guarantee') {
      TMessage.warning('无担保订单不通过平台收款，请由双方按约定自行结算')
      return
    }

    const stageLabel = payStage.value === 'final' ? '尾款' : '定金'
    const channel = payChannel.value
    const clientPlatform = getAdapayClientPlatform()
    payLoading.value = true
    try {
      const created = await createAdapayPayment(
        token,
        item.requirement_id,
        payStage.value,
        channel,
        clientPlatform,
      )
      payVisible.value = false
      TMessage.success(`${stageLabel}支付订单已生成，正在跳转支付页`)
      await router.push({
        name: 'payment',
        query: buildAdapayPaymentQuery({
          paymentId: created.paymentId,
          requirementId: created.requirementId,
          channel,
          clientPlatform,
          amountCny: created.amountCny,
          qrContent: created.payUrl,
        }),
      })
    } catch (error) {
      // 微信 / 云闪付要先在支付页拿授权（未绑定 open_id 时渠道会拒单）。
      // 与「我的需求」页同一套兜底：微信直接跳支付页的意图模式，由支付页在微信内
      // 静默授权后自动下单；云闪付只支持移动端，PC 上提示换一种支付方式。
      if (isWechatPaymentAuthorizationRequired(error)) {
        payVisible.value = false
        await router.push({
          name: 'payment',
          query: buildAdapayPaymentQuery({
            requirementId: item.requirement_id,
            milestone: payStage.value,
            channel: 'wechat',
            clientPlatform,
            amountCny: payAmount.value,
            intent: true,
          }),
        })
        return
      }
      if (isUnionPaymentAuthorizationRequired(error)) {
        if (clientPlatform !== 'mobile') {
          TMessage.warning('云闪付授权仅适用于移动端，请重新选择支付方式')
          return
        }
        try {
          const authorization = await getUnionPaymentAuthorizeUrl(token, window.location.href)
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
      }
      TMessage.error(error instanceof Error ? error.message : '支付失败')
    } finally {
      payLoading.value = false
    }
  }

  return {
    payVisible,
    payLoading,
    depositPolicyAccepted,
    payChannel,
    payStage,
    payAmount,
    openPayDialog,
    updatePayChannel,
    submitPayment,
  }
}
