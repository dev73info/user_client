<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AcceptanceDialog from '@/components/AcceptanceDialog.vue'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import {
  createAdapayPayment,
  getAdapayBreachCase,
  getAdapayClientPlatform,
  reportAdapayTermination,
  requestAdapayPlatformReview,
  submitAdapayBreachDecision,
  withdrawAdapayBreach,
  type AdapayAcceptanceResult,
  type AdapayBreachCase,
  type AdapayBreachDecisionValue,
  type AdapayBreachVerdictParty,
  type AdapayBusinessPayChannel,
} from '@/api/adapay'
import {
  getUnionPaymentAuthorizeUrl,
  isUnionPaymentAuthorizationRequired,
  isWechatPaymentAuthorizationRequired,
} from '@/api/auth'
import {
  createRequirementContract,
  fetchAsignRequirementPreviewUrl,
  fetchContractSigningStatus,
  fetchDevContractSigningStatus,
  type ContractSigningStatus,
} from '@/api/contracts'
import {
  listMyRequirements,
  type RequirementItem as DevRequirementItem,
} from '@/api/devRequirements'
import {
  listRequirements,
  requestRequirementFinalPayCure,
  requestRequirementFinalPayment,
  type RequirementItem,
  type RequirementPaymentMode,
  type RequirementStatus,
} from '@/api/requirements'
import DeliverySubmitDialog from '@/components/DeliverySubmitDialog.vue'
import { getDepositRatio } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import { breachStatusLabel } from '@/shared/breachStatus'


import { TButton, TDialog } from 'ui_73info'
type ViewerRole = 'customer' | 'developer'

/** 会话中当前用户在需求上的身份：甲方（需求方）/ 乙方（开发者）。 */
const props = defineProps<{
  token: string
  requirementId: string
  role: ViewerRole
}>()

/** 会话卡片要跟着工具条的能力开关走；用事件推出去，父组件才能响应式更新。 */
export type ActionCapabilities = {
  canAcceptDelivery: boolean
  canDeliver: boolean
  canPay: boolean
}

const emit = defineEmits<{
  changed: []
  capabilities: [caps: ActionCapabilities]
}>()

/** 动作栏只读需求单的这几个字段，需求方与开发者的列表结构合并成同一份。 */
type ActionRequirement = {
  requirement_id: string
  title: string
  status: RequirementStatus
  budget?: number | null
  payment_mode: RequirementPaymentMode
  bound_resource_id?: number | null
  bound_resource_version_count?: number | null
}

/**
 * chip 的三种视觉重量：
 *   - `default`：普通入口（如「查看合同」），白底描边；
 *   - `primary`：**当前该做的那一步**（如「支付定金」「发起合同」），实心主色；
 *   - `accent`：值得留意、但不是人人都要走的一步（如结单后的「解除合作」），浅色描边突出；
 *   - `danger`：危险类动作（如「解除合作」），红色描边。
 */
type ActionTone = 'default' | 'primary' | 'danger' | 'accent'

type ActionChip = {
  key: string
  label: string
  tone: ActionTone
  run: () => void
}

/** 已结束的案件不再提供入口，只需要能重新申报时给出表单。 */
const BREACH_CLOSED_STATUSES = ['withdrawn', 'rejected', 'succeeded']

/** 已结案 / 已驳回：结论定案不可翻案，新一轮申报会新建一条案件。 */
const SETTLED_BREACH_STATUSES = ['rejected', 'succeeded']

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const requirement = ref<ActionRequirement | null>(null)
const signing = ref<ContractSigningStatus | null>(null)
const breachCase = ref<AdapayBreachCase | null>(null)
const depositRatioPercent = ref(20)
const loadFailed = ref(false)
const actingKey = ref('')

const payVisible = ref(false)
const payLoading = ref(false)
const depositPolicyAccepted = ref(false)
/** 支付弹窗里选中的渠道：与「我的需求」页同一份取值，弹窗关掉即重置回支付宝。 */
const payChannel = ref<AdapayBusinessPayChannel>('alipay')

const deliveryVisible = ref(false)
const acceptanceVisible = ref(false)

const breachVisible = ref(false)
const breachReason = ref('')
const breachDecisionNote = ref('')
const breachRejectPanel = ref(false)
const breachSubmitting = ref(false)
const breachActing = ref(false)

const isDeveloper = computed(() => props.role === 'developer')
const isSelfManaged = computed(() => requirement.value?.payment_mode === 'self_managed')
const status = computed<RequirementStatus | null>(() => requirement.value?.status ?? null)
const hasContract = computed(() => Boolean(signing.value?.has_contract))
const contractSigned = computed(() =>
  Boolean(signing.value?.party_a_signed && signing.value?.party_b_signed),
)
const myPartySigned = computed(() =>
  isDeveloper.value ? Boolean(signing.value?.party_b_signed) : Boolean(signing.value?.party_a_signed),
)
const hasBoundResource = computed(() => requirement.value?.bound_resource_id != null)
const publishedVersionCount = computed(() => requirement.value?.bound_resource_version_count ?? 0)

const canCreateContract = computed(
  () =>
    !isSelfManaged.value &&
    hasBoundResource.value &&
    (status.value === 'pending_deposit' || status.value === 'deposit_paid') &&
    !hasContract.value,
)
const canOpenContract = computed(() => !isSelfManaged.value && hasContract.value)
// 定金与尾款只能由甲方（需求方）缴纳：后端 adapay service 会校验付款人必须是合同甲方，
// 开发者点了只会拿到 403，因此这两个入口对开发者一律不展示。
const canPayDeposit = computed(
  () =>
    !isDeveloper.value &&
    !isSelfManaged.value &&
    contractSigned.value &&
    status.value === 'pending_deposit',
)
const canPayFinal = computed(
  () =>
    !isDeveloper.value &&
    !isSelfManaged.value &&
    contractSigned.value &&
    status.value === 'pending_final',
)
/**
 * 当前是否有可缴的款（定金或尾款）。
 *
 * 与上面两个分开：工具条按阶段分开给「支付定金 / 支付尾款」两枚 chip，而会话卡片只需要知道
 * 「现在有没有款可缴」——卡片自己已经按需求状态决定按钮写「支付定金」还是「支付尾款」，
 * 弹窗打开后按阶段算该付的金额。两个条件都从这里过，卡片与工具条不会各写一套而走偏。
 */
const canPay = computed(() => canPayDeposit.value || canPayFinal.value)
/**
 * 无担保模式的「确认完成」：没有合同也没有尾款，确认即结单。
 *
 * 担保模式不能走这里：它的验收与尾款是两个动作，分别由「验收」和「支付尾款」承担。
 * 后端 `request-final-payment` 在担保模式下除状态外还要求已存在一条「验收通过」留档，
 * 而验收通过本身就会把状态推到 `pending_final`——所以在 `in_development` 上放一个调该接口
 * 的入口必然被拒（曾经就是这样：按钮写着「确认验收并支付尾款」，点下去只报
 * `only in-development requirements may request final payment`）。
 */
const canRequestFinal = computed(
  () =>
    !isDeveloper.value &&
    isSelfManaged.value &&
    hasBoundResource.value &&
    status.value === 'in_development' &&
    publishedVersionCount.value > 0,
)
/**
 * 担保模式的验收入口：开发中与待付尾款都能提交，与「我的需求」页的 `canOpenAcceptance` 同口径。
 *
 * 验收可反复提交——不通过会留档并通知开发者整改：「开发中」留在原状态；
 * 「待付尾款」会退回「开发中」并挡住宿尾款（后端 `accept_delivery` 的 rolling_back 分支），
 * 所以要给到待付尾款这一步。
 */
const canAcceptDelivery = computed(
  () =>
    !isDeveloper.value &&
    !isSelfManaged.value &&
    contractSigned.value &&
    hasBoundResource.value &&
    publishedVersionCount.value > 0 &&
    (status.value === 'in_development' || status.value === 'pending_final'),
)
const canDeliver = computed(
  () =>
    isDeveloper.value &&
    hasBoundResource.value &&
    (status.value === 'in_development' || status.value === 'pending_final'),
)
/** 未结束的解除合作案件（已撤回 / 已驳回 / 已结案不再提供入口）。 */
const hasLiveBreachCase = computed(
  () => breachCase.value != null && !BREACH_CLOSED_STATUSES.includes(breachCase.value.status),
)
/** 开发者在待付尾款阶段可催告付款（只通知，不动钱）。 */
const canCureFinalPay = computed(
  () =>
    isDeveloper.value &&
    !isSelfManaged.value &&
    contractSigned.value &&
    status.value === 'pending_final' &&
    !hasLiveBreachCase.value,
)

const canUseBreach = computed(
  () =>
    hasLiveBreachCase.value ||
    (!isSelfManaged.value &&
      (status.value === 'deposit_paid' ||
        status.value === 'in_development' ||
        status.value === 'pending_final' ||
        // 已签约未缴定金：甲方拒缴定金同样是违约，可以在这一阶段申报——那种案件没有支付单，
        // 只作责任认定，不动钱。合同还没生效时没有可裁决的对象，入口不给。
        (status.value === 'pending_deposit' && contractSigned.value) ||
        // 待分账时尾款已缴、排队分账尚未执行，解除合作仍能取消排队（与需求卡片同口径）。
        status.value === 'pending_settlement')),
)

/**
 * 结单后的唯一业务入口：解除合作（与需求列表页的 `canOpenAfterSales` 同一口径）。
 *
 * 只在担保模式、需求 `completed` 时给：结单之前的问题走「解除合作」，结单之后资金已分账出账，
 * 只有解除合作这一条线能退尾款、扣接单保证金；无担保模式没有托管资金，也没有可裁决的对象。
 * 两侧都能看到这个入口（乙方要在这里表态接受或不接受），但发起只有需求方，见 `canOpenCase`。
 */
const canUseAfterSales = computed(() => status.value === 'completed' && !isSelfManaged.value)

/** 解除合作弹窗的开关：案件列表、表态与发起都在 `AfterSalesModal` 里，这里只负责入口。 */
const afterSalesVisible = ref(false)

/** 已撤回 / 已驳回 / 已结案的案件不再展示明细，回到申报表单（与需求列表页一致）。 */
const activeBreachCase = computed(() => (hasLiveBreachCase.value ? breachCase.value : null))
/** 已结案 / 已驳回的案件：结论在表单上方只读展示，入口回到「新一轮申报」。 */
const settledBreachCase = computed(() =>
  breachCase.value && SETTLED_BREACH_STATUSES.includes(breachCase.value.status)
    ? breachCase.value
    : null,
)
/**
 * 上一轮已撤回的案件：撤回不等于没有案件，表单上方要把上一轮交代清楚，
 * 否则用户看到「重新申报」也不知道自己重的是什么。
 */
const withdrawnBreachCase = computed(() =>
  breachCase.value?.status === 'withdrawn' ? breachCase.value : null,
)
/** 撤回方是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
const breachWithdrawnByMe = computed(
  () => withdrawnBreachCase.value?.reportedBy === auth.username,
)
const canDecideBreach = computed(
  () =>
    activeBreachCase.value?.status === 'ai_judged' &&
    (isDeveloper.value
      ? activeBreachCase.value.developerDecision == null
      : activeBreachCase.value.customerDecision == null),
)
/**
 * 协商阶段（解除合作的第一步）是否仍在等表态：案件在 `submitted` 且双方都没就「解除合作」表态。
 *
 * 表态用同一枚接口（`submitBreachDecision`）承担两段语义：协商阶段传 `accepted` = 同意解除、
 * `rejected` = 不同意；判定阶段（`ai_judged`）传 `accepted` / `rejected` = 对 AI 判定的表态。
 */
const terminationNegotiating = computed(
  () =>
    activeBreachCase.value?.status === 'submitted' &&
    !activeBreachCase.value.mutualAgreedAt &&
    !activeBreachCase.value.mutualRejectedAt,
)
/** 能不能由本人对「解除合作」表态：当事人里**不是发起人**的那一位。 */
const canRespondTermination = computed(
  () =>
    terminationNegotiating.value &&
    activeBreachCase.value?.reportedBy !== auth.username,
)
const canRequestPlatformReview = computed(() => activeBreachCase.value?.status === 'submitted')
/** 撤回是申请人的单方动作：待判定期间（还没有结论）只有本人能撤回自己的申请，与需求列表页一致。 */
const canWithdrawBreach = computed(
  () =>
    activeBreachCase.value != null &&
    ['submitted', 'ai_reviewing'].includes(activeBreachCase.value.status) &&
    activeBreachCase.value.reportedBy === auth.username,
)

const payStage = computed<'deposit' | 'final'>(() =>
  status.value === 'pending_final' ? 'final' : 'deposit',
)
const payAmount = computed(() => {
  const item = requirement.value
  if (!item) {
    return 0.01
  }
  return payStage.value === 'final'
    ? calculateFinalPaymentAmount(item, depositRatioPercent.value)
    : calculateFinalDepositAmount(item, depositRatioPercent.value)
})

const breachDialogTitle = computed(() => {
  if (activeBreachCase.value) {
    return '解除合作进展'
  }
  if (settledBreachCase.value) {
    return '发起新的解除合作'
  }
  return breachWithdrawnByMe.value ? '重新发起解除合作' : '解除合作'
})

/**
 * 申请表单上方的「上一轮」说明：把歧义点讲清楚——结案 / 驳回的结论不能翻案、新一轮会新建案件，
 * 撤回则是沿用同一案件重新提交（案件编号不变，申请人与理由以本次提交为准）。
 */
const breachRoundHint = computed(() => {
  const settled = settledBreachCase.value
  if (settled) {
    // 结案（`succeeded`）会按「结案即自动解除」作废合同、把需求退回大厅：同一需求上已经没有
    // 可裁决的合同，新一轮不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。
    // 驳回不动合同，结论不能翻案，但需求仍在履约中，可以就新发生的事实再申报。
    return settled.status === 'succeeded'
      ? '上一轮案件已结案，需求已退回大厅、原合同已作废；需重新接单并签约后才能再次发起解除合作。'
      : '上一轮案件已驳回，结论不能翻案；下面提交的是新一轮申请，会新建一条案件，只针对驳回之后新发生的事实。'
  }
  if (withdrawnBreachCase.value) {
    return breachWithdrawnByMe.value
      ? '上一轮由你撤回，本次提交沿用同一条案件（案件编号不变），申请人与理由以本次提交为准，双方继续跟踪这一条。'
      : '上一轮由对方申请后撤回，本次提交沿用同一条案件（案件编号不变），按你本次提交的事实与依据重新判定。'
  }
  return ''
})

/** 按当前身份与需求状态给出可用操作；顺序即业务流程顺序。 */
const chips = computed<ActionChip[]>(() => {
  if (!requirement.value) {
    return []
  }

  const list: ActionChip[] = []

  if (canCreateContract.value) {
    list.push({ key: 'create-contract', label: '发起合同', tone: 'primary', run: () => void createContract() })
  }
  if (canOpenContract.value) {
    list.push({
      key: 'contract',
      label: myPartySigned.value ? '查看合同' : '签署合同',
      tone: myPartySigned.value ? 'default' : 'primary',
      run: () => void openContract(),
    })
  }
  if (canPayDeposit.value) {
    list.push({ key: 'pay', label: '支付定金', tone: 'primary', run: openPayDialog })
  }
  if (canPayFinal.value) {
    list.push({ key: 'pay', label: '支付尾款', tone: 'primary', run: openPayDialog })
  }
  if (canCureFinalPay.value) {
    list.push({
      key: 'final-pay-cure',
      label: '催告付款',
      tone: 'default',
      run: () => void cureFinalPayment(),
    })
  }
  if (canRequestFinal.value) {
    list.push({
      key: 'request-final',
      label: '确认完成',
      tone: 'primary',
      run: () => void requestFinalPayment(),
    })
  }
  if (canAcceptDelivery.value) {
    list.push({
      key: 'acceptance',
      label: '验收',
      // 待付尾款时当前该做的是「支付尾款」，验收退成次要入口；开发中则验收正是那一步。
      tone: canPayFinal.value ? 'default' : 'primary',
      run: openAcceptanceDialog,
    })
  }
  if (canDeliver.value) {
    list.push({ key: 'deliver', label: '交付版本', tone: 'primary', run: openDeliveryDialog })
  }
  if (canUseBreach.value) {
    list.push({ key: 'termination', label: '解除合作', tone: 'danger', run: () => void openBreachDialog() })
  }
  if (canUseAfterSales.value) {
    // 用 `accent` 而不是 `primary`：实心主色是「现在该做这一步」的意思（支付定金、发起合同），
    // 而结单后并不总有事要做——没有在办案件时它只是一个入口，占了主色会把「查看合同」压下去，
    // 也和这一排其它入口不是一套语言。
    list.push({ key: 'after-sales', label: '解除合作', tone: 'accent', run: openAfterSalesDialog })
  }
  return list
})

watch(
  () => [props.token, props.requirementId, props.role] as const,
  () => {
    void loadActions()
  },
  { immediate: true },
)

/** 能力一变就通知会话容器：卡片上的「验收 / 去交付 / 支付」靠这份快照，不能只读 expose 的 computed（父组件不会跟踪子组件内部依赖）。 */
watch(
  [canAcceptDelivery, canDeliver, canPay],
  () => {
    emit('capabilities', {
      canAcceptDelivery: canAcceptDelivery.value,
      canDeliver: canDeliver.value,
      canPay: canPay.value,
    })
  },
  { immediate: true },
)

/**
 * 下载交付产物时已经确认过版本列表：列表接口偶发仍给 `bound_resource_version_count = 0`，
 * 会把「验收」卡住。用刚查到的真实版本数兜底抬一下，再触发 capabilities 重算。
 */
function applyPublishedVersionCount(count: number) {
  const item = requirement.value
  if (!item || count <= 0) {
    return
  }
  const current = item.bound_resource_version_count ?? 0
  if (count <= current) {
    return
  }
  requirement.value = { ...item, bound_resource_version_count: count }
}

function toActionRequirement(row: RequirementItem | DevRequirementItem): ActionRequirement {
  return {
    requirement_id: row.requirement_id,
    title: row.title,
    status: row.status,
    budget: row.budget,
    payment_mode: row.payment_mode,
    bound_resource_id: row.bound_resource_id,
    bound_resource_version_count: row.bound_resource_version_count,
  }
}

async function loadActions() {
  const { token, requirementId, role } = props
  if (!token || !requirementId) {
    requirement.value = null
    return
  }

  try {
    const rows = role === 'developer' ? await listMyRequirements(token) : await listRequirements(token)
    const matched = rows.find((row) => row.requirement_id === requirementId)
    requirement.value = matched ? toActionRequirement(matched) : null
    loadFailed.value = false
  } catch {
    // 需求单加载失败时整条操作栏不展示：涉及资金与合同的入口宁可少给，不能给错。
    requirement.value = null
    loadFailed.value = true
    return
  }

  const item = requirement.value
  const [statusResult, ratioResult, breachResult] = await Promise.all([
    (role === 'developer'
      ? fetchDevContractSigningStatus(token, requirementId)
      : fetchContractSigningStatus(token, requirementId)
    ).catch(() => null),
    getDepositRatio(token).catch(() => null),
    item && item.payment_mode === 'platform_guarantee'
      ? getAdapayBreachCase(token, requirementId).catch(() => null)
      : Promise.resolve(null),
  ])

  signing.value = statusResult
  if (ratioResult && Number.isFinite(ratioResult.deposit_ratio_percent)) {
    depositRatioPercent.value = ratioResult.deposit_ratio_percent
  }
  breachCase.value = breachResult
}

async function createContract() {
  const item = requirement.value
  if (!item) {
    return
  }

  actingKey.value = 'create-contract'
  try {
    await createRequirementContract(props.token, item.requirement_id)
    showToast('合同已发起，等待双方签署', 'success')
    await loadActions()
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发起合同失败', 'error')
  } finally {
    actingKey.value = ''
  }
}

async function openContract() {
  const item = requirement.value
  if (!item) {
    return
  }

  const signRoute = {
    name: 'contract-sign',
    query: { requirement_id: item.requirement_id, from: isDeveloper.value ? 'dev' : 'user' },
  }

  if (!myPartySigned.value) {
    await router.push(signRoute)
    return
  }

  // 已签署时优先进爱签预览页，爱签不可用再回退本地合同页（与需求列表页一致）。
  try {
    const previewUrl = await fetchAsignRequirementPreviewUrl(props.token, item.requirement_id)
    if (previewUrl) {
      window.location.href = previewUrl
      return
    }
  } catch {
    // 忽略，回退本地合同页
  }
  await router.push(signRoute)
}

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
  const item = requirement.value
  if (!item) {
    return
  }

  if (payStage.value === 'deposit' && !depositPolicyAccepted.value) {
    showToast('请先确认“定金服务费与退款规则”后再支付定金', 'warning')
    return
  }
  if (item.payment_mode !== 'platform_guarantee') {
    showToast('无担保订单不通过平台收款，请由双方按约定自行结算', 'warning')
    return
  }

  const stageLabel = payStage.value === 'final' ? '尾款' : '定金'
  const channel = payChannel.value
  const clientPlatform = getAdapayClientPlatform()
  payLoading.value = true
  try {
    const created = await createAdapayPayment(
      props.token,
      item.requirement_id,
      payStage.value,
      channel,
      clientPlatform,
    )
    payVisible.value = false
    showToast(`${stageLabel}支付订单已生成，正在跳转支付页`, 'success')
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
        showToast('云闪付授权仅适用于移动端，请重新选择支付方式', 'warning')
        return
      }
      try {
        const authorization = await getUnionPaymentAuthorizeUrl(props.token, window.location.href)
        if (!authorization.url.trim()) {
          throw new Error('云闪付授权地址为空')
        }
        window.location.assign(authorization.url)
        return
      } catch (authorizationError) {
        showToast(
          authorizationError instanceof Error ? authorizationError.message : '发起云闪付授权失败',
          'error',
        )
        return
      }
    }
    showToast(error instanceof Error ? error.message : '支付失败', 'error')
  } finally {
    payLoading.value = false
  }
}

function openAcceptanceDialog() {
  if (!requirement.value) {
    return
  }

  acceptanceVisible.value = true
}

function closeAcceptanceDialog() {
  acceptanceVisible.value = false
}

/**
 * 验收提交成功后的收尾：刷新动作栏，让按钮组跟着新状态走。
 *
 * 验收通过会把需求推到「待付尾款」，此时该出现的是「支付尾款」；与「我的需求」页一致，
 * 顺手把支付弹窗打开，用户不必再回列表找入口。
 */
async function handleAcceptanceSubmitted(result: AdapayAcceptanceResult) {
  await loadActions()
  emit('changed')
  if (result === 'passed' && canPayFinal.value) {
    openPayDialog()
  }
}

async function requestFinalPayment() {
  const item = requirement.value
  if (!item) {
    return
  }

  actingKey.value = 'request-final'
  try {
    const updated = await requestRequirementFinalPayment(props.token, item.requirement_id)
    // 先用返回值推进本地状态，避免依赖列表刷新的时序再去判断支付阶段。
    requirement.value = { ...item, status: updated.status }
    if (item.payment_mode === 'self_managed') {
      showToast('需求已确认完成', 'success')
    } else {
      showToast('请支付尾款', 'success')
      openPayDialog()
    }
    emit('changed')
    void loadActions()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '结束开发失败', 'error')
  } finally {
    actingKey.value = ''
  }
}

async function cureFinalPayment() {
  const item = requirement.value
  if (!item) {
    return
  }
  actingKey.value = 'final-pay-cure'
  try {
    await requestRequirementFinalPayCure(props.token, item.requirement_id)
    showToast('已催告客户支付尾款', 'success')
    emit('changed')
    void loadActions()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '催告付款失败', 'error')
  } finally {
    actingKey.value = ''
  }
}

function openDeliveryDialog() {
  if (!hasBoundResource.value) {
    showToast('当前需求还没有关联资源项目', 'warning')
    return
  }

  deliveryVisible.value = true
}

/** 交付版本提交成功后刷新会话动作：需求的交付版本与可用入口会一起变化。 */
async function handleDeliverySubmitted() {
  await loadActions()
  emit('changed')
}

/**
 * 打开解除合作弹窗：案件列表、诉求与双方表态都在弹窗内，由它自己在打开时拉取（`visible` 一变就刷新），
 * 这里不预加载——缓存一份反而会显示上一轮的结果。
 */
function openAfterSalesDialog() {
  afterSalesVisible.value = true
}

async function openBreachDialog() {
  breachReason.value = ''
  breachDecisionNote.value = ''
  breachRejectPanel.value = false
  breachVisible.value = true

  const item = requirement.value
  if (item) {
    breachCase.value = await getAdapayBreachCase(props.token, item.requirement_id).catch(() => null)
  }
}

async function submitBreachReport() {
  const item = requirement.value
  if (!item) {
    return
  }

  const reason = breachReason.value.trim()
  if (!reason) {
    showToast('请填写解除合作的事实与依据', 'warning')
    return
  }

  breachSubmitting.value = true
  try {
    breachCase.value = await reportAdapayTermination(props.token, item.requirement_id, reason)
    showToast('解除合作申请已提交，等待对方回应', 'success')
    breachVisible.value = false
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交解除合作申请失败', 'error')
  } finally {
    breachSubmitting.value = false
  }
}

async function submitBreachDecision(decision: AdapayBreachDecisionValue) {
  const current = activeBreachCase.value
  if (!current) {
    return
  }

  breachActing.value = true
  try {
    breachCase.value = await submitAdapayBreachDecision(
      props.token,
      current.id,
      decision,
      breachDecisionNote.value.trim(),
    )
    breachRejectPanel.value = false
    breachDecisionNote.value = ''
    showToast(decision === 'accepted' ? '已接受 AI 判定' : '已提交不接受，案件转客服人工判定', 'success')
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交解除合作案件表态失败', 'error')
  } finally {
    breachActing.value = false
  }
}

async function submitPlatformReview() {
  const current = activeBreachCase.value
  if (!current) {
    return
  }

  breachActing.value = true
  try {
    breachCase.value = await requestAdapayPlatformReview(props.token, current.id)
    showToast('已申请平台介入，等待平台判定', 'success')
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '申请平台介入失败', 'error')
  } finally {
    breachActing.value = false
  }
}

async function submitBreachWithdraw() {
  const current = activeBreachCase.value
  if (!current) {
    return
  }

  breachActing.value = true
  try {
    breachCase.value = await withdrawAdapayBreach(props.token, current.id)
    showToast('已撤回解除合作申请，如仍有争议可重新发起', 'success')
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '撤回解除合作申请失败', 'error')
  } finally {
    breachActing.value = false
  }
}

function chipClass(chip: ActionChip) {
  return `conversation-actions__chip--${chip.tone}`
}

function formatBudget(value?: number | null) {
  if (value == null) {
    return '待议价'
  }
  return `¥${value.toFixed(2)}`
}

function breachLiablePartyLabel(party: AdapayBreachVerdictParty) {
  if (party === 'customer') return '客户（需求方）违约'
  if (party === 'mutual') return '双方协商一致（无责退出）'
  return '开发者违约'
}

/**
 * 给会话容器用的入口。会话卡片（「合同已签署完成」「验收已通过」「收到交付版本」等）也要
 * 挂「支付定金 / 支付尾款」「验收」「去交付」，但能不能做、以及弹窗归谁管，都以工具条
 * 这份判断为准——卡片那边只负责把入口摆在卡片上。两处共用同一组 computed 与同一组弹窗，
 * 条件不会各写一套而走偏。
 */
defineExpose({
  canAcceptDelivery,
  openAcceptanceDialog,
  canDeliver,
  openDeliveryDialog,
  canPay,
  openPayDialog,
  loadActions,
  applyPublishedVersionCount,
})
</script>

<template>
  <div v-if="chips.length > 0" class="conversation-actions" role="group" aria-label="需求快捷操作">
    <button v-for="chip in chips" :key="chip.key" type="button" class="conversation-actions__chip"
      :class="chipClass(chip)" :disabled="Boolean(actingKey)" @click="chip.run()">
      {{ actingKey === chip.key ? '处理中...' : chip.label }}
    </button>
  </div>

  <!-- 结单后的解除合作：入口只在担保模式且需求已完成时出现，弹窗自己负责案件列表、诉求与表态。 -->
  <AfterSalesModal v-if="requirement" :visible="afterSalesVisible" :token="token"
    :current-username="auth.username" :requirement-id="requirement.requirement_id"
    :requirement-title="requirement.title" :requirement-budget="requirement.budget"
    :can-open-case="!isDeveloper" @close="afterSalesVisible = false" />

  <DepositModal v-if="payVisible && requirement" :visible="payVisible"
    :deposit-requirement="{ title: requirement.title, id: requirement.requirement_id, budget: requirement.budget }"
    :formatted-budget="formatBudget(requirement.budget)"
    :payment-stage-label="payStage === 'final' ? '尾款' : '定金'" :deposit-channel="payChannel"
    :is-final-payment="payStage === 'final'" :is-escrow-payment="true"
    :deposit-ratio-percent="depositRatioPercent" :coupon-final-amount="payAmount" :deposit-loading="payLoading"
    :deposit-policy-accepted="depositPolicyAccepted" :contract-signing-status="signing" @close="payVisible = false"
    @submit="submitPayment" @update:depositChannel="updatePayChannel"
    @update:depositPolicyAccepted="depositPolicyAccepted = $event" />

  <DeliverySubmitDialog v-model:visible="deliveryVisible" :token="token"
    :bound-resource-id="requirement?.bound_resource_id ?? null" @submitted="handleDeliverySubmitted" />

  <AcceptanceDialog :visible="acceptanceVisible" :token="token"
    :requirement-id="requirement?.requirement_id ?? ''" :requirement-title="requirement?.title ?? ''"
    @close="closeAcceptanceDialog" @submitted="handleAcceptanceSubmitted" />

  <TDialog v-model:open="breachVisible" :title="breachDialogTitle" width="560px">
    <p class="conversation-actions__meta">{{ requirement?.title }} · {{ requirementId }}</p>

    <template v-if="activeBreachCase">
      <p class="conversation-actions__line"><strong>案件编号：</strong>{{ activeBreachCase.caseNo }}</p>
      <p class="conversation-actions__line"><strong>当前状态：</strong>{{ breachStatusLabel(activeBreachCase.status) }}</p>
      <p v-if="activeBreachCase.liableParty" class="conversation-actions__line">
        <strong>责任认定：</strong>{{ breachLiablePartyLabel(activeBreachCase.liableParty) }}
      </p>
      <p class="conversation-actions__line"><strong>申请理由：</strong>{{ activeBreachCase.reason }}</p>
      <p v-if="activeBreachCase.aiJudgedAt || activeBreachCase.aiReasoning" class="conversation-actions__line">
        <strong>AI 判定：</strong>{{ activeBreachCase.aiLiableParty ?
          breachLiablePartyLabel(activeBreachCase.aiLiableParty) : '无法判定，已转客服人工判定' }}
      </p>
      <p v-if="activeBreachCase.aiReasoning" class="conversation-actions__line">
        <strong>判定理由：</strong>{{ activeBreachCase.aiReasoning }}
      </p>
      <p v-if="activeBreachCase.decisionDeadlineAt" class="conversation-actions__line">
        <strong>表态截止：</strong>{{ formatCnDateTime(activeBreachCase.decisionDeadlineAt) }}
      </p>
      <p class="conversation-actions__line">
        <strong>资金处理：</strong>定金 ¥{{ activeBreachCase.depositAmountCny }} · 已退尾款 ¥{{
          activeBreachCase.refundAmountCny }} · 赔付 ¥{{ activeBreachCase.compensationAmountCny }}
      </p>

      <!-- 协商阶段（解除合作的第一步）：对方同意即按协商一致无责退出，不同意才申请平台介入。
           这一步不预设走向，所以当事人看到的不是「协商还是追责」的选择，而是「同意 / 不同意」。 -->
      <template v-if="terminationNegotiating">
        <p class="conversation-actions__tip">
          先协商：对方同意即按协商一致处理——无责退出，定金全额原路退还需求方、无违约金、双方都不担责。
          协商一致**协商不出赔付**（赔付只有平台判责才有依据）；对方不同意或超时未回应，任一方可申请平台介入，
          由平台认定责任方后按责任执行。
        </p>
        <template v-if="canRespondTermination">
          <label class="conversation-actions__field">
            <span>同意或不同意的说明（可选）</span>
            <textarea v-model="breachDecisionNote" rows="3" maxlength="1000"
              placeholder="说明你的立场，双方与客服都会看到"></textarea>
          </label>
        </template>
        <p v-else class="conversation-actions__tip">已提交申请，等待对方回应。</p>
      </template>
      <p v-else-if="activeBreachCase.mutualAgreedAt" class="conversation-actions__line">
        <strong>协商结果：</strong>双方协商一致（无责退出），{{ formatCnDateTime(activeBreachCase.mutualAgreedAt) }}
      </p>
      <p v-else-if="activeBreachCase.mutualRejectedAt" class="conversation-actions__line">
        <strong>协商结果：</strong>对方不同意解除合作（{{ formatCnDateTime(activeBreachCase.mutualRejectedAt) }}），
        任一方可申请平台介入
      </p>

      <template v-if="canDecideBreach">
        <p class="conversation-actions__tip">
          双方都接受 AI 判定后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。
        </p>
        <label v-if="breachRejectPanel" class="conversation-actions__field">
          <span>不接受的原因（可选）</span>
          <textarea v-model="breachDecisionNote" rows="3" maxlength="1000"
            placeholder="说明不接受该判定的理由，便于客服人工复核"></textarea>
        </label>
      </template>
      <p v-else-if="activeBreachCase.status === 'submitted' || activeBreachCase.status === 'ai_reviewing'"
        class="conversation-actions__tip">
        平台按 AI 判定 + 客服人工审核认定责任方，AI 判定完成后由双方各自选择是否接受；
        任一方不接受或逾期未全部表态，案件转客服人工判定。
      </p>
    </template>

    <template v-else>
      <template v-if="settledBreachCase">
        <p class="conversation-actions__line"><strong>上一轮案件编号：</strong>{{ settledBreachCase.caseNo }}</p>
        <p v-if="settledBreachCase.liableParty" class="conversation-actions__line">
          <strong>责任认定：</strong>{{ breachLiablePartyLabel(settledBreachCase.liableParty) }}
        </p>
        <p v-if="settledBreachCase.resolutionNote" class="conversation-actions__line">
          <strong>处理结论：</strong>{{ settledBreachCase.resolutionNote }}
        </p>
        <p class="conversation-actions__line">
          <strong>资金处理：</strong>定金 ¥{{ settledBreachCase.depositAmountCny }} · 已退尾款 ¥{{
            settledBreachCase.refundAmountCny }} · 赔付 ¥{{ settledBreachCase.compensationAmountCny }}
        </p>
        <p v-if="settledBreachCase.resolvedAt" class="conversation-actions__line">
          <strong>处理时间：</strong>{{ formatCnDateTime(settledBreachCase.resolvedAt) }}
        </p>
      </template>
      <template v-if="withdrawnBreachCase">
        <p class="conversation-actions__line"><strong>上一轮案件编号：</strong>{{ withdrawnBreachCase.caseNo }}</p>
        <p class="conversation-actions__line">
          <strong>上一轮申请人：</strong>{{ breachWithdrawnByMe ? '我方' : '对方' }}
        </p>
        <p class="conversation-actions__line"><strong>上一轮申请理由：</strong>{{ withdrawnBreachCase.reason }}</p>
        <p v-if="withdrawnBreachCase.resolvedAt" class="conversation-actions__line">
          <strong>撤回时间：</strong>{{ formatCnDateTime(withdrawnBreachCase.resolvedAt) }}
        </p>
      </template>
      <p v-if="breachRoundHint" class="conversation-actions__tip">{{ breachRoundHint }}</p>
      <label class="conversation-actions__field">
        <span>事实与依据</span>
        <textarea v-model="breachReason" rows="6" maxlength="2000"
          placeholder="请描述合作终止的事实、时间与相关证据说明"></textarea>
      </label>
      <p class="conversation-actions__tip">
        提交后案件先进入**协商阶段**：对方同意即按协商一致处理（无责退出，定金全额原路退还需求方、
        无违约金）；对方不同意或超时未回应，任一方可申请平台介入，由平台核对合同、支付、交付与沟通
        记录判定责任方，客服人工复核后按结论执行退款／赔付并解除需求绑定。协商一致协商不出赔付
        （赔付只有判责才有依据）。恶意申报会影响账号信用。
      </p>
    </template>

    <template #footer>
      <TButton @click="breachVisible = false">关闭</TButton>
      <template v-if="activeBreachCase">
        <TButton v-if="canWithdrawBreach" :loading="breachActing" @click="submitBreachWithdraw">撤回申请</TButton>
        <TButton v-if="canRequestPlatformReview" :loading="breachActing" @click="submitPlatformReview">申请平台介入</TButton>
        <template v-if="canRespondTermination">
          <TButton variant="outline" tone="danger" :loading="breachActing" @click="submitBreachDecision('rejected')">
            不同意
          </TButton>
          <TButton variant="solid" tone="accent" :loading="breachActing" @click="submitBreachDecision('accepted')">
            同意解除
          </TButton>
        </template>
        <template v-if="canDecideBreach">
          <template v-if="breachRejectPanel">
            <TButton :loading="breachActing" @click="breachRejectPanel = false">取消</TButton>
            <TButton variant="solid" tone="danger" :loading="breachActing" @click="submitBreachDecision('rejected')">确认不接受</TButton>
          </template>
          <template v-else>
            <TButton variant="outline" tone="danger" :loading="breachActing" @click="breachRejectPanel = true">不接受</TButton>
            <TButton variant="solid" tone="accent" :loading="breachActing" @click="submitBreachDecision('accepted')">接受判定</TButton>
          </template>
        </template>
      </template>
      <TButton
        variant="solid"
        tone="danger"
        v-else
        :loading="breachSubmitting"
        :disabled="Boolean(settledBreachCase) && !hasContract"
        @click="submitBreachReport"
      >
        {{ settledBreachCase ? '发起新一轮解除合作' : breachWithdrawnByMe ? '重新发起' : '提交解除合作申请' }}
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.conversation-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* 覆盖全局 button 默认样式，做成与工具按钮同色系的小胶囊 */
.conversation-actions .conversation-actions__chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(185, 204, 190, 0.72);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #3f5f49;
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.conversation-actions .conversation-actions__chip:hover:not(:disabled) {
  border-color: rgba(125, 165, 138, 0.9);
  background: #ffffff;
}

.conversation-actions .conversation-actions__chip:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.conversation-actions .conversation-actions__chip--primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.conversation-actions .conversation-actions__chip--primary:hover:not(:disabled) {
  border-color: #1d4ed8;
  background: #1d4ed8;
  color: #ffffff;
}

.conversation-actions .conversation-actions__chip--danger {
  border-color: rgba(203, 120, 110, 0.7);
  color: #b4402f;
}

.conversation-actions .conversation-actions__chip--danger:hover:not(:disabled) {
  border-color: rgba(180, 64, 47, 0.9);
  background: #fff7f6;
}

/* 值得留意的入口（结单后的「解除合作」）：浅蓝描边 + 淡蓝底，与这一排的白色小胶囊同重量，
   不抢发送按钮那一块实心主色；配色取会话本身用的那支蓝，不另起一套色。 */
.conversation-actions .conversation-actions__chip--accent {
  border-color: rgba(37, 99, 235, 0.38);
  background: rgba(37, 99, 235, 0.07);
  color: #1d4ed8;
}

.conversation-actions .conversation-actions__chip--accent:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.62);
  background: rgba(37, 99, 235, 0.12);
}

.conversation-actions__hint {
  margin: 0;
  padding-left: 2px;
  color: #7a8b80;
  font-size: 12.5px;
}

.conversation-actions__meta {
  margin: 0 0 8px;
  color: #475569;
  font-size: 13px;
}

.conversation-actions__line {
  margin: 0 0 6px;
  color: #334155;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}

.conversation-actions__tip {
  margin: 0 0 10px;
  color: #64748b;
  font-size: 12.5px;
  line-height: 1.7;
}

.conversation-actions__field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  color: #334155;
  font-size: 13px;
}

.conversation-actions__field input[type='text'],
.conversation-actions__field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 8px;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

@media (max-width: 640px) {
  .conversation-actions .conversation-actions__chip {
    min-height: 32px;
    padding: 0 9px;
    font-size: 12px;
  }
}
</style>
