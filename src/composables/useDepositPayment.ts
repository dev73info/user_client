import { computed, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import { type AdapayBusinessPayChannel } from '@/api/adapay'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import type { RequirementPaymentMode, RequirementStatus } from '@/api/requirements'
import { getDepositRatio } from '@/api/settings'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { useAuthStore } from '@/stores/auth'

import { useDepositCheckout, type PaymentState } from './useDepositCheckout'
import { useDepositCoupons } from './useDepositCoupons'

/** 首页待办需求（视图侧 `PendingRequirementView` 的子集）：支付域只读这几项。 */
export type DepositRequirement = {
  id: string
  title: string
  status: RequirementStatus
  budget?: number | null
  paymentMode: RequirementPaymentMode
}

export type DepositPaymentOptions = {
  /** 卸载后不再写响应式状态。`isMounted` 只有视图那一份，这一层只读不持。 */
  isMounted: () => boolean
  /** 视图那份待办需求列表：卡片要靠 `requirement_id` 从里面找人。 */
  pendingRequirements: Ref<DepositRequirement[]>
  /** 支付确认成功后重拉待办需求，把状态从「待付定金」推下去。 */
  loadPendingRequirements: () => Promise<void>
}

/**
 * 首页「定金 / 尾款」支付域：卡片状态、支付方式、押金比例、券（转 `useDepositCoupons`）、
 * 拉起 Adapay 与回跳后的确认。
 *
 * 视图那边只在顶层留着 `openDepositCard`（用例直接调它），垫付/驳回分流后把
 * 待付款这一支交给本 composable 的 `openDepositPayment`。
 */
export function useDepositPayment(options: DepositPaymentOptions) {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const depositChannel = ref<AdapayBusinessPayChannel>('alipay')
  const depositPayment = ref<PaymentState | null>(null)
  const depositLoading = ref(false)
  const depositRatioPercent = ref(20)
  const depositPolicyAccepted = ref(false)
  const contractSigningStatus = ref<ContractSigningStatus | null>(null)

  const depositRequirement = computed<DepositRequirement | null>(() => {
    const id = String(route.query.requirement_id || '')
    return options.pendingRequirements.value.find((item) => item.id === id) ?? null
  })

  const isFinalPayment = computed(() => depositRequirement.value?.status === 'pending_final')
  const paymentStageLabel = computed(() => (isFinalPayment.value ? '尾款' : '定金'))

  const {
    availableCoupons,
    amountCouponCode,
    discountCouponCode,
    couponLoading,
    activeCouponCode,
    selectedCoupon,
    couponBaseAmount,
    couponDiscount,
    couponFinalAmount,
    couponSummary,
    selectCoupon,
    resetCoupons,
    loadAvailableCoupons,
  } = useDepositCoupons({
    isMounted: options.isMounted,
    depositRequirement,
    depositRatioPercent,
    isFinalPayment,
  })

  function isAdapayRequirement(item: DepositRequirement) {
    return item.paymentMode === 'platform_guarantee'
  }

  function finalDepositAmount(item: DepositRequirement) {
    return calculateFinalDepositAmount(item, depositRatioPercent.value)
  }

  function finalPaymentAmount(item: DepositRequirement) {
    return calculateFinalPaymentAmount(item, depositRatioPercent.value)
  }

  /** 侧栏 / 精选卡片上「这张需求点得开支付卡片吗」。 */
  function canOpenPayment(item: DepositRequirement) {
    return (
      item.status === 'rejected' || (isAdapayRequirement(item) && item.status === 'pending_final')
    )
  }

  /** 云闪付授权回跳成功后把支付方式切回去（`useHomeAuthQuery` 的回调落到这里）。 */
  function markUnionAuthorized() {
    depositChannel.value = 'union'
  }

  /**
   * 打开定金 / 尾款卡片：只接「待付定金 / 待付尾款」且走平台担保收款的需求，
   * 其余的按拆分前的口径原样拦下（自管订单由双方自行结算）。
   */
  function openDepositPayment(item: DepositRequirement) {
    if (item.status !== 'pending_deposit' && item.status !== 'pending_final') {
      return
    }
    if (!isAdapayRequirement(item)) {
      TMessage.warning('无担保订单不通过平台收款，请由双方按约定自行结算')
      return
    }

    depositPayment.value = null
    depositChannel.value = 'alipay'
    resetCoupons()
    depositPolicyAccepted.value = false
    contractSigningStatus.value = null
    router.push({ name: 'home', query: { modal: 'deposit', requirement_id: item.id } })
    void loadAvailableCoupons()
    void fetchContractSigningStatus(auth.token, item.id)
      .then((s) => {
        contractSigningStatus.value = s
      })
      .catch(() => {
        /* 忽略，不影响支付流程 */
      })
  }

  function updateDepositChannel(channel: AdapayBusinessPayChannel) {
    if (depositChannel.value === channel) {
      return
    }
    depositChannel.value = channel
    depositPayment.value = null
  }

  function closeDepositCard() {
    depositPolicyAccepted.value = false
    router.replace({ name: 'home' })
  }

  async function loadDepositRatio() {
    if (!auth.isAuthed) {
      return
    }

    try {
      const payload = await getDepositRatio(auth.token)
      if (!payload || !options.isMounted()) {
        return
      }

      if (Number.isFinite(payload.deposit_ratio_percent)) {
        depositRatioPercent.value = payload.deposit_ratio_percent
      }
    } catch {
      // Keep default ratio when settings API is unavailable.
    }
  }

  const { submitDepositPayment } = useDepositCheckout({
    depositRequirement,
    depositChannel,
    depositPayment,
    depositLoading,
    depositPolicyAccepted,
    amountCouponCode,
    discountCouponCode,
    depositRatioPercent,
    loadPendingRequirements: options.loadPendingRequirements,
  })

  return {
    depositChannel,
    depositPayment,
    depositLoading,
    depositRatioPercent,
    depositPolicyAccepted,
    contractSigningStatus,
    depositRequirement,
    isFinalPayment,
    paymentStageLabel,
    availableCoupons,
    amountCouponCode,
    discountCouponCode,
    couponLoading,
    activeCouponCode,
    selectedCoupon,
    couponBaseAmount,
    couponDiscount,
    couponFinalAmount,
    couponSummary,
    isAdapayRequirement,
    canOpenPayment,
    selectCoupon,
    updateDepositChannel,
    markUnionAuthorized,
    openDepositPayment,
    closeDepositCard,
    loadDepositRatio,
    loadAvailableCoupons,
    submitDepositPayment,
  }
}
