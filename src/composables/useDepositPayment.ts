import { computed, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import { type AdapayBusinessPayChannel } from '@/api/adapay'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import { getDepositRatio } from '@/api/settings'
import {
  getRequirementFeeTerms,
  isFeeTermsPending,
  type RequirementFeeTerms,
} from '@/api/requirementFee'
import type { RequirementPaymentMode, RequirementStatus } from '@/api/requirements'
import { formatBpsPercent, stagePlatformFeeFen } from '@/shared/requirementFee'
import { requirementPayFen, requirementPayFenFromTerms } from '@/shared/requirementPayment'
import { useAuthStore } from '@/stores/auth'

import { useDepositCheckout, type PaymentState } from './useDepositCheckout'

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
 * 首页「定金 / 尾款」支付域：卡片状态、支付方式、定金比例、应付金额预估、拉起 Adapay
 * 与回跳后的确认。
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
  /** 本单费用快照：弹窗展示本阶段平台服务费。自管单没有费率，不请求。 */
  const depositFeeTerms = ref<RequirementFeeTerms | null>(null)

  const depositRequirement = computed<DepositRequirement | null>(() => {
    const id = String(route.query.requirement_id || '')
    return options.pendingRequirements.value.find((item) => item.id === id) ?? null
  })

  const isFinalPayment = computed(() => depositRequirement.value?.status === 'pending_final')
  const paymentStageLabel = computed(() => (isFinalPayment.value ? '尾款' : '定金'))

  /**
   * 本次应付金额（整数分）：拿到快照时与平台服务费同源（定金 `deposit_fen` /
   * 尾款 `total_fen - deposit_fen`）；只有 404（自管单 / 旧合同）才回落到当前 settings 估算。
   * 后端真正扣款也按快照走，避免弹窗显示 20% 而后端按 10% 收。
   */
  const payableFen = computed(() => {
    if (!depositRequirement.value) {
      return 0
    }
    if (depositFeeTerms.value) {
      return requirementPayFenFromTerms(
        depositFeeTerms.value,
        isFinalPayment.value ? 'final' : 'deposit',
      )
    }
    return requirementPayFen(depositRequirement.value, depositRatioPercent.value)
  })

  /** 本阶段平台服务费（分）：定金用定金快照，尾款用尾款快照；无快照为空。 */
  const depositPlatformFeeFen = computed(() =>
    depositFeeTerms.value
      ? stagePlatformFeeFen(depositFeeTerms.value, isFinalPayment.value ? 'final' : 'deposit')
      : null,
  )
  const depositPlatformFeePercent = computed(() =>
    depositFeeTerms.value ? formatBpsPercent(depositFeeTerms.value.platform_fee_bps) : '',
  )
  /** 弹窗展示的定金占比：有快照时用快照比例，404 才回落到当前 settings。 */
  const depositRatioPercentForDisplay = computed(() =>
    depositFeeTerms.value
      ? depositFeeTerms.value.deposit_ratio_bps / 100
      : depositRatioPercent.value,
  )

  /**
   * 担保单读一次费率快照；404（旧合同）按「不展示该行」处理，不挡支付。
   * 同一需求只请求一次：点击打开与深链挂载都会调到这里。
   */
  let feeRequestFor = ''
  async function loadDepositFeeTerms(requirementId: string) {
    if (!requirementId || feeRequestFor === requirementId) {
      return
    }
    feeRequestFor = requirementId
    depositFeeTerms.value = null
    try {
      const terms = await getRequirementFeeTerms(auth.token, requirementId)
      if (depositRequirement.value?.id === requirementId) {
        depositFeeTerms.value = terms
      }
    } catch (error) {
      if (!isFeeTermsPending(error)) {
        depositFeeTerms.value = null
        // 非 404 失败允许下次重试，不要把「当时没网」当成永久没有费率。
        feeRequestFor = ''
      }
    }
  }

  // 深链 / 刷新时弹窗由 URL 直接挂载，不经过 openDepositPayment：这里按当前需求补载一次。
  watch(
    depositRequirement,
    (item) => {
      if (item && isAdapayRequirement(item)) {
        void loadDepositFeeTerms(item.id)
      }
    },
    { immediate: true },
  )

  function isAdapayRequirement(item: DepositRequirement) {
    return item.paymentMode === 'platform_guarantee'
  }

  /** 侧栏 / 精选卡片上「这张需求点得开支付卡片吗」。 */
  function canOpenPayment(item: DepositRequirement) {
    return (
      item.status === 'rejected' || (isAdapayRequirement(item) && item.status === 'pending_final')
    )
  }

  /** 云闪付授权回跳成功后把支付方式切回去（`useHomeAuthQuery` 的回调落到这里）。 */
  function markUnionAuthorized() {
    depositChannel.value = 'alipay'
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
    depositPolicyAccepted.value = false
    contractSigningStatus.value = null
    depositFeeTerms.value = null
    router.push({ name: 'home', query: { modal: 'deposit', requirement_id: item.id } })
    void loadDepositFeeTerms(item.id)
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
    depositFeeTerms.value = null
    feeRequestFor = ''
    router.replace({ name: 'home' })
  }

  /**
   * 定金比例：契约字段是 `deposit_ratio_bps`（万分之几），这里换成百分比给弹窗展示。
   *
   * 取不到时保留默认比例——它只用于「本次应付」的**预估**，真正扣多少由服务端按合同快照算，
   * 回执里的 `amount_fen` 才是准数。
   */
  async function loadDepositRatio() {
    if (!auth.isAuthed) {
      return
    }

    try {
      const payload = await getDepositRatio(auth.token)
      if (!options.isMounted()) {
        return
      }

      const percent = payload.deposit_ratio_percent
      if (Number.isFinite(percent) && percent > 0) {
        depositRatioPercent.value = percent
      }
    } catch {
      /* 比例取不到时保留默认值，页面上展示的是预估金额 */
    }
  }

  const { submitDepositPayment } = useDepositCheckout({
    depositRequirement,
    depositChannel,
    depositPayment,
    depositLoading,
    depositPolicyAccepted,
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
    payableFen,
    depositPlatformFeeFen,
    depositPlatformFeePercent,
    depositRatioPercentForDisplay,
    isAdapayRequirement,
    canOpenPayment,
    updateDepositChannel,
    markUnionAuthorized,
    openDepositPayment,
    closeDepositCard,
    loadDepositRatio,
    submitDepositPayment,
  }
}
