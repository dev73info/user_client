import { computed, ref, type Ref } from 'vue'

import { TMessage } from 'ui_73info'

import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import type { RequirementPaymentMode, RequirementStatus } from '@/api/requirements'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { useAuthStore } from '@/stores/auth'

/** 支付卡片算价用到的几项（视图侧 `PendingRequirementView` 的子集）。 */
export type CouponRequirement = {
  status: RequirementStatus
  budget?: number | null
  paymentMode: RequirementPaymentMode
}

export type DepositCouponOptions = {
  /** 卸载后不再写响应式状态。`isMounted` 只有视图那一份，这一层只读不持。 */
  isMounted: () => boolean
  depositRequirement: Ref<CouponRequirement | null>
  depositRatioPercent: Ref<number>
  isFinalPayment: Ref<boolean>
}

/**
 * 定金 / 尾款卡片上的优惠券这一支：金额券与折扣券互斥选择、抵扣上限、文案，以及可用券列表。
 *
 * 单独成一支是因为 `useDepositPayment` 已经贴着 300 行模块预算；依赖方向只有一条
 * 「支付域 → 本 composable」，券这边不反向读支付域的提交态。
 *
 * 口径与拆分前逐行一致：尾款不接券（`activeCouponCode` 在尾款恒为空）；担保订单
 * （`platform_guarantee`）走平台收款，实付即基数，券只作展示不减金额。
 */
export function useDepositCoupons(options: DepositCouponOptions) {
  const auth = useAuthStore()

  const availableCoupons = ref<CouponItem[]>([])
  const amountCouponCode = ref('')
  const discountCouponCode = ref('')
  const couponLoading = ref(false)

  const activeCouponCode = computed(() => {
    if (options.isFinalPayment.value) {
      return ''
    }
    return amountCouponCode.value.trim() || discountCouponCode.value.trim()
  })

  const selectedCoupon = computed(() => {
    const code = activeCouponCode.value
    if (!code) {
      return undefined
    }
    return availableCoupons.value.find((item) => item.code === code)
  })

  function finalDepositAmount(item: CouponRequirement) {
    return calculateFinalDepositAmount(item, options.depositRatioPercent.value)
  }

  function finalPaymentAmount(item: CouponRequirement) {
    return calculateFinalPaymentAmount(item, options.depositRatioPercent.value)
  }

  const couponBaseAmount = computed(() => {
    if (!options.depositRequirement.value) {
      return 0
    }
    if (options.depositRequirement.value.status === 'pending_final') {
      return finalPaymentAmount(options.depositRequirement.value)
    }
    return finalDepositAmount(options.depositRequirement.value)
  })

  const couponDiscount = computed(() =>
    computeCouponDiscount(couponBaseAmount.value, selectedCoupon.value),
  )

  const couponFinalAmount = computed(() => {
    const requirement = options.depositRequirement.value
    if (requirement && requirement.paymentMode === 'platform_guarantee') {
      return couponBaseAmount.value
    }
    if (couponDiscount.value <= 0) {
      return couponBaseAmount.value
    }
    return Number((couponBaseAmount.value - couponDiscount.value).toFixed(2))
  })

  const couponSummary = computed(() => {
    if (options.isFinalPayment.value) {
      return '尾款支付不支持使用优惠券或打折券。'
    }
    if (!activeCouponCode.value) {
      return ''
    }
    if (!selectedCoupon.value) {
      return '请选择下方可用优惠券。'
    }
    if (couponBaseAmount.value < selectedCoupon.value.min_amount_cny) {
      return `该券需满 ¥${selectedCoupon.value.min_amount_cny.toFixed(2)} 可用`
    }
    if (couponDiscount.value <= 0) {
      return '该优惠券暂无法抵扣更多金额。'
    }
    return `当前可抵扣 ¥${couponDiscount.value.toFixed(2)}, 实付 ¥${couponFinalAmount.value.toFixed(2)}`
  })

  function computeCouponDiscount(amount: number, coupon?: CouponItem) {
    if (!coupon) {
      return 0
    }

    if (amount < coupon.min_amount_cny) {
      return 0
    }

    const rawDiscount =
      coupon.discount_type === 'amount'
        ? coupon.discount_value
        : (amount * coupon.discount_value) / 100

    const cappedDiscount =
      coupon.max_discount_cny != null ? Math.min(rawDiscount, coupon.max_discount_cny) : rawDiscount

    const discount = Math.max(0, Math.min(cappedDiscount, amount - 0.01))
    return Number(discount.toFixed(2))
  }

  /** 金额券与折扣券互斥：点同一张即取消，点另一类即清空另一类。 */
  function selectCoupon(code: string, type: 'amount' | 'percent') {
    if (type === 'amount') {
      if (amountCouponCode.value === code) {
        amountCouponCode.value = ''
        return
      }
      amountCouponCode.value = code
      discountCouponCode.value = ''
      return
    }

    if (discountCouponCode.value === code) {
      discountCouponCode.value = ''
      return
    }

    discountCouponCode.value = code
    amountCouponCode.value = ''
  }

  /** 打开新一张支付卡片时把两张券的选择清空（拆分前写在 `openDepositCard` 里）。 */
  function resetCoupons() {
    amountCouponCode.value = ''
    discountCouponCode.value = ''
  }

  async function loadAvailableCoupons() {
    if (!auth.isAuthed) {
      availableCoupons.value = []
      return
    }

    couponLoading.value = true
    try {
      const coupons = await listAvailableCoupons(auth.token)
      if (!options.isMounted()) {
        return
      }
      availableCoupons.value = coupons
    } catch (err) {
      if (options.isMounted()) {
        TMessage.error(err instanceof Error ? err.message : '加载优惠券失败')
      }
    } finally {
      if (options.isMounted()) {
        couponLoading.value = false
      }
    }
  }

  return {
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
  }
}
