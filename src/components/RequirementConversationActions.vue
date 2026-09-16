<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import DepositModal from '@/components/DepositModal.vue'
import {
  createAdapayPayment,
  getAdapayBreachCase,
  getAdapayClientPlatform,
  proposeAdapayBreachNegotiation,
  reportAdapayBreach,
  requestAdapayPlatformReview,
  respondAdapayBreachNegotiation,
  submitAdapayBreachDecision,
  withdrawAdapayBreach,
  type AdapayBreachCase,
  type AdapayBreachDecisionValue,
  type AdapayBreachVerdictParty,
} from '@/api/adapay'
import {
  createRequirementContract,
  fetchAsignRequirementPreviewUrl,
  fetchContractSigningStatus,
  fetchDevContractSigningStatus,
  type ContractSigningStatus,
} from '@/api/contracts'
import {
  listMyRequirements,
  requestUnbindRequirement as requestDevUnbindRequirement,
  respondUnbindRequirement as respondDevUnbindRequirement,
  type RequirementItem as DevRequirementItem,
} from '@/api/devRequirements'
import {
  listRequirements,
  requestRequirementFinalPayment,
  requestUnbindRequirement,
  respondUnbindRequirement,
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

type ViewerRole = 'customer' | 'developer'

/** 会话中当前用户在需求上的身份：甲方（需求方）/ 乙方（开发者）。 */
const props = defineProps<{
  token: string
  requirementId: string
  role: ViewerRole
}>()

const emit = defineEmits<{
  changed: []
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
  pending_unbind_request?: RequirementItem['pending_unbind_request']
}

type ActionTone = 'default' | 'primary' | 'danger'

type ActionChip = {
  key: string
  label: string
  tone: ActionTone
  run: () => void
}

const BREACH_STATUS_LABELS: Record<string, string> = {
  submitted: '协商中',
  ai_reviewing: 'AI 审核中',
  ai_judged: 'AI 已判定，待双方确认',
  support_reviewing: '客服人工判定中',
  withdrawn: '申请人已撤回',
  processing: '资金处理中',
  manual_required: '资金执行待处理',
  succeeded: '已结案',
  rejected: '已驳回',
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

const deliveryVisible = ref(false)

const unbindVisible = ref(false)
const unbindReason = ref('')
const unbindRespondNote = ref('')
const unbindSubmitting = ref(false)

const breachVisible = ref(false)
const breachReason = ref('')
const breachDecisionNote = ref('')
const breachRejectPanel = ref(false)
const breachSubmitting = ref(false)
const breachActing = ref(false)

const negotiationDepositYuan = ref('')
const negotiationFinalYuan = ref('')
const negotiationNote = ref('')
const negotiationActing = ref(false)

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
const pendingUnbindRequest = computed(() =>
  requirement.value?.pending_unbind_request?.status === 'pending'
    ? requirement.value.pending_unbind_request
    : null,
)
/** 担保模式的退出入口只有「终止合作」：解绑申请对担保模式一律拒绝（后端同样会拒绝）。 */
const unbindBlockedByPaymentMode = computed(() => !isSelfManaged.value)

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
const canRequestFinal = computed(
  () =>
    !isDeveloper.value &&
    hasBoundResource.value &&
    status.value === 'in_development' &&
    publishedVersionCount.value > 0 &&
    (isSelfManaged.value || contractSigned.value),
)
const canDeliver = computed(
  () =>
    isDeveloper.value &&
    hasBoundResource.value &&
    (status.value === 'in_development' || status.value === 'pending_final'),
)
const canRequestUnbind = computed(
  () =>
    (isDeveloper.value || hasBoundResource.value) &&
    (status.value === 'pending_deposit' ||
      status.value === 'deposit_paid' ||
      status.value === 'in_development') &&
    !pendingUnbindRequest.value &&
    !unbindBlockedByPaymentMode.value,
)
const canRespondUnbind = computed(
  () => pendingUnbindRequest.value?.initiator === (isDeveloper.value ? 'creator' : 'developer'),
)
/** 未结束的违约案件（已撤回 / 已驳回 / 已结案不再提供入口）。 */
const hasLiveBreachCase = computed(
  () => breachCase.value != null && !BREACH_CLOSED_STATUSES.includes(breachCase.value.status),
)

const canUseBreach = computed(
  () =>
    hasLiveBreachCase.value ||
    (!isSelfManaged.value &&
      (status.value === 'deposit_paid' ||
        status.value === 'in_development' ||
        status.value === 'pending_final')),
)

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
const canRequestPlatformReview = computed(() => activeBreachCase.value?.status === 'submitted')
/** 撤回是申请人的单方动作：待判定期间（还没有结论）只有本人能撤回自己的申请，与需求列表页一致。 */
const canWithdrawBreach = computed(
  () =>
    activeBreachCase.value != null &&
    ['submitted', 'ai_reviewing'].includes(activeBreachCase.value.status) &&
    activeBreachCase.value.reportedBy === auth.username,
)

/** 可以协商的案件状态：与后端一致的「案件存活」集合（资金开始执行或结案后不再协商）。 */
const NEGOTIATION_OPEN_STATUSES = ['submitted', 'ai_reviewing', 'ai_judged', 'support_reviewing']

/** 待对方表态的协商提议；为空表示还没有未决提议，可以发起。 */
const pendingNegotiation = computed(() => {
  const negotiation = activeBreachCase.value?.negotiation
  return negotiation?.status === 'pending' ? negotiation : null
})

const canProposeNegotiation = computed(
  () =>
    activeBreachCase.value != null &&
    NEGOTIATION_OPEN_STATUSES.includes(activeBreachCase.value.status) &&
    pendingNegotiation.value == null,
)
/** 承诺方是对方：未决提议由对方发起时才轮到我同意 / 拒绝（自己不能替对方拍板）。 */
const canRespondNegotiation = computed(
  () => pendingNegotiation.value != null && pendingNegotiation.value.initiatedBy !== props.role,
)
/** 尾款只有缴过才退得出来：`pending_final` 是「待付尾款」，此时尾款额度只能是 0（后端同样会拒绝）。 */
const finalRefundable = computed(() => status.value === 'completed')
const negotiationDepositCapYuan = computed(() => (activeBreachCase.value?.depositAmountFen ?? 0) / 100)
const negotiationFinalCapYuan = computed(() => {
  const item = requirement.value
  return item && finalRefundable.value
    ? calculateFinalPaymentAmount(item, depositRatioPercent.value)
    : 0
})

const negotiationHint = computed(() => {
  if (canRespondNegotiation.value) {
    return '对方已发起协商终止合作，同意后即按该额度退款结案'
  }
  if (pendingNegotiation.value) {
    return '协商提议已提交，等待对方同意或拒绝；被拒绝后可重新发起'
  }
  return ''
})

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

const unbindHint = computed(() => {
  if (pendingUnbindRequest.value && !canRespondUnbind.value) {
    return `${pendingUnbindRequest.value.initiator === 'creator' ? '需求方' : '开发者'}已提交解除申请，等待对方处理`
  }
  if (!unbindBlockedByPaymentMode.value) {
    return ''
  }
  // 担保模式的退出入口只有「终止合作」，而案件必须挂在一张已完成的定金支付单上（定金未缴时
  // 建不了案）；这段死角由缴款期限到期后的系统兜底终止，不能把用户指去「终止合作」。
  if (!canUseBreach.value) {
    return '担保模式不支持协商解除；请先完成签约与定金支付，逾期未缴定金将由系统自动终止合作并释放接单保证金'
  }
  return '担保模式不支持协商解除；如需结束合作请使用「终止合作」'
})

const breachDialogTitle = computed(() => {
  if (activeBreachCase.value) {
    return '终止合作进展'
  }
  if (settledBreachCase.value) {
    return '发起新的终止合作'
  }
  return breachWithdrawnByMe.value ? '重新发起终止合作' : '终止合作'
})

/**
 * 申请表单上方的「上一轮」说明：把歧义点讲清楚——结案 / 驳回的结论不能翻案、新一轮会新建案件，
 * 撤回则是沿用同一案件重新提交（案件编号不变，申请人与理由以本次提交为准）。
 */
const breachRoundHint = computed(() => {
  const settled = settledBreachCase.value
  if (settled) {
    return `上一轮案件已${settled.status === 'succeeded' ? '结案' : '驳回'}，结论不能翻案；下面提交的是新一轮申请，会新建一条案件，只针对结案之后新发生的事实。`
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
  if (canRequestFinal.value) {
    list.push({
      key: 'request-final',
      label: isSelfManaged.value ? '确认完成' : '确认验收并支付尾款',
      tone: 'primary',
      run: () => void requestFinalPayment(),
    })
  }
  if (canDeliver.value) {
    list.push({ key: 'deliver', label: '提交交付版本', tone: 'primary', run: openDeliveryDialog })
  }
  if (canRequestUnbind.value) {
    list.push({ key: 'unbind', label: '申请解除', tone: 'default', run: openUnbindDialog })
  } else if (canRespondUnbind.value) {
    list.push({ key: 'unbind', label: '处理解除申请', tone: 'primary', run: openUnbindDialog })
  }
  if (canUseBreach.value) {
    list.push({ key: 'breach', label: '终止合作', tone: 'danger', run: () => void openBreachDialog() })
  }
  // 协商终止不另设入口：`canProposeNegotiation` / `canRespondNegotiation` 成立的前提是存在存活案件，
  // 而存活案件本身就已经让上面的「终止合作」成立，两个 chip 会打开同一个弹窗。协商状态与
  // 提议 / 同意 / 拒绝都在弹窗内展示（弹窗已是协商优先），所以这里再放一个入口纯属重复。
  return list
})

watch(
  () => [props.token, props.requirementId, props.role] as const,
  () => {
    void loadActions()
  },
  { immediate: true },
)

function toActionRequirement(row: RequirementItem | DevRequirementItem): ActionRequirement {
  return {
    requirement_id: row.requirement_id,
    title: row.title,
    status: row.status,
    budget: row.budget,
    payment_mode: row.payment_mode,
    bound_resource_id: row.bound_resource_id,
    bound_resource_version_count: row.bound_resource_version_count,
    pending_unbind_request: row.pending_unbind_request ?? null,
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
  payVisible.value = true
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
  const clientPlatform = getAdapayClientPlatform()
  payLoading.value = true
  try {
    const created = await createAdapayPayment(
      props.token,
      item.requirement_id,
      payStage.value,
      'alipay',
      clientPlatform,
    )
    payVisible.value = false
    showToast(`${stageLabel}支付订单已生成，正在跳转支付页`, 'success')
    await router.push({
      name: 'payment',
      query: buildAdapayPaymentQuery({
        paymentId: created.paymentId,
        requirementId: created.requirementId,
        channel: 'alipay',
        clientPlatform,
        amountCny: created.amountCny,
        qrContent: created.payUrl,
      }),
    })
  } catch (error) {
    showToast(error instanceof Error ? error.message : '支付失败', 'error')
  } finally {
    payLoading.value = false
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

function openUnbindDialog() {
  unbindReason.value = ''
  unbindRespondNote.value = ''
  unbindVisible.value = true
}

async function submitUnbindRequest() {
  const item = requirement.value
  if (!item) {
    return
  }

  const reason = unbindReason.value.trim()
  if (!reason) {
    showToast('请填写解除原因', 'warning')
    return
  }

  unbindSubmitting.value = true
  try {
    const request = isDeveloper.value ? requestDevUnbindRequirement : requestUnbindRequirement
    await request(props.token, item.requirement_id, reason)
    showToast('解除申请已提交，等待对方处理', 'success')
    unbindVisible.value = false
    await loadActions()
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交解除申请失败', 'error')
  } finally {
    unbindSubmitting.value = false
  }
}

async function submitUnbindRespond(action: 'approve' | 'reject') {
  const item = requirement.value
  if (!item) {
    return
  }

  unbindSubmitting.value = true
  try {
    const respond = isDeveloper.value ? respondDevUnbindRequirement : respondUnbindRequirement
    await respond(props.token, item.requirement_id, action, unbindRespondNote.value.trim() || undefined)
    showToast(action === 'approve' ? '已同意解除申请' : '已拒绝解除申请', 'success')
    unbindVisible.value = false
    await loadActions()
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '处理解除申请失败', 'error')
  } finally {
    unbindSubmitting.value = false
  }
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
  resetNegotiationForm()
}

/** 协商表单以「全额退还甲方」为默认值，与后端缺省口径一致；费用上限随案件与需求状态变化。 */
function resetNegotiationForm() {
  negotiationDepositYuan.value = String(negotiationDepositCapYuan.value)
  negotiationFinalYuan.value = String(negotiationFinalCapYuan.value)
  negotiationNote.value = ''
}

async function submitNegotiationPropose() {
  const current = activeBreachCase.value
  if (!current) {
    return
  }

  const depositYuan = Number(negotiationDepositYuan.value)
  const finalYuan = Number(negotiationFinalYuan.value)
  if (!Number.isFinite(depositYuan) || depositYuan < 0 || depositYuan > negotiationDepositCapYuan.value) {
    showToast(`定金退还金额需在 0 ~ ¥${negotiationDepositCapYuan.value} 之间`, 'warning')
    return
  }
  if (!Number.isFinite(finalYuan) || finalYuan < 0 || finalYuan > negotiationFinalCapYuan.value) {
    showToast(
      finalRefundable.value
        ? `尾款退还金额需在 0 ~ ¥${negotiationFinalCapYuan.value} 之间`
        : '尾款尚未缴纳，尾款退还金额只能填 0',
      'warning',
    )
    return
  }
  negotiationActing.value = true
  try {
    breachCase.value = await proposeAdapayBreachNegotiation(
      props.token,
      current.id,
      Math.round(depositYuan * 100),
      Math.round(finalYuan * 100),
      negotiationNote.value.trim(),
    )
    resetNegotiationForm()
    showToast('协商提议已提交，等待对方确认', 'success')
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发起协商失败', 'error')
  } finally {
    negotiationActing.value = false
  }
}

async function submitNegotiationRespond(action: 'approve' | 'reject') {
  const current = activeBreachCase.value
  if (!current) {
    return
  }

  negotiationActing.value = true
  try {
    breachCase.value = await respondAdapayBreachNegotiation(props.token, current.id, action)
    showToast(action === 'approve' ? '已同意协商，平台将按该额度退款结案' : '已拒绝协商', 'success')
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '处理协商提议失败', 'error')
  } finally {
    negotiationActing.value = false
  }
}

async function submitBreachReport() {
  const item = requirement.value
  if (!item) {
    return
  }

  const reason = breachReason.value.trim()
  if (!reason) {
    showToast('请填写终止合作的事实与依据', 'warning')
    return
  }

  breachSubmitting.value = true
  try {
    breachCase.value = await reportAdapayBreach(props.token, item.requirement_id, reason)
    showToast('终止合作申请已提交，请先与对方协商', 'success')
    breachVisible.value = false
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交终止合作申请失败', 'error')
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
    showToast(error instanceof Error ? error.message : '提交违约案件表态失败', 'error')
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
    showToast('已撤回终止合作申请，如仍有争议可重新发起', 'success')
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '撤回终止合作申请失败', 'error')
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

function breachStatusLabel(status: string) {
  return BREACH_STATUS_LABELS[status] ?? status
}

function breachLiablePartyLabel(party: AdapayBreachVerdictParty) {
  if (party === 'customer') return '客户（需求方）违约'
  if (party === 'mutual') return '双方协商一致（无责退出）'
  return '开发者违约'
}
</script>

<template>
  <div v-if="chips.length > 0" class="conversation-actions" role="group" aria-label="需求快捷操作">
    <button v-for="chip in chips" :key="chip.key" type="button" class="conversation-actions__chip"
      :class="chipClass(chip)" :disabled="Boolean(actingKey)" @click="chip.run()">
      {{ actingKey === chip.key ? '处理中...' : chip.label }}
    </button>
  </div>
  <p v-if="unbindHint" class="conversation-actions__hint">{{ unbindHint }}</p>

  <DepositModal v-if="payVisible && requirement" :visible="payVisible"
    :deposit-requirement="{ title: requirement.title, id: requirement.requirement_id, budget: requirement.budget }"
    :formatted-budget="formatBudget(requirement.budget)"
    :payment-stage-label="payStage === 'final' ? '尾款' : '定金'" deposit-channel="alipay"
    :is-final-payment="payStage === 'final'" :is-escrow-payment="true"
    :deposit-ratio-percent="depositRatioPercent" :coupon-final-amount="payAmount" :deposit-loading="payLoading"
    :deposit-policy-accepted="depositPolicyAccepted" :contract-signing-status="signing" @close="payVisible = false"
    @submit="submitPayment" @update:depositPolicyAccepted="depositPolicyAccepted = $event" />

  <DeliverySubmitDialog v-model:visible="deliveryVisible" :token="token"
    :bound-resource-id="requirement?.bound_resource_id ?? null" @submitted="handleDeliverySubmitted" />

  <el-dialog v-model="unbindVisible" :title="canRespondUnbind ? '处理解除申请' : '申请解除需求'" width="480px"
    append-to-body>
    <p class="conversation-actions__meta">{{ requirement?.title }} · {{ requirementId }}</p>
    <template v-if="canRespondUnbind">
      <p class="conversation-actions__tip">
        对方申请解除绑定，原因：{{ pendingUnbindRequest?.reason || '未填写' }}
      </p>
      <label class="conversation-actions__field">
        <span>处理说明（可选）</span>
        <textarea v-model="unbindRespondNote" rows="3" maxlength="500" placeholder="同意或拒绝的说明"></textarea>
      </label>
    </template>
    <template v-else>
      <p class="conversation-actions__tip">解除后双方绑定关系结束，已缴纳的定金按合同约定与违约规则处理。</p>
      <label class="conversation-actions__field">
        <span>解除原因</span>
        <textarea v-model="unbindReason" rows="4" maxlength="500" placeholder="请说明解除原因"></textarea>
      </label>
    </template>
    <template #footer>
      <template v-if="canRespondUnbind">
        <el-button :loading="unbindSubmitting" @click="submitUnbindRespond('reject')">拒绝解除</el-button>
        <el-button type="primary" :loading="unbindSubmitting" @click="submitUnbindRespond('approve')">同意解除</el-button>
      </template>
      <template v-else>
        <el-button @click="unbindVisible = false">取消</el-button>
        <el-button type="danger" :loading="unbindSubmitting" @click="submitUnbindRequest">提交解除申请</el-button>
      </template>
    </template>
  </el-dialog>

  <el-dialog v-model="breachVisible" :title="breachDialogTitle" width="560px" append-to-body>
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

      <template v-if="canProposeNegotiation || canRespondNegotiation || activeBreachCase.negotiation">
        <p class="conversation-actions__line"><strong>协商终止合作：</strong>双方谈定定金与尾款的退还额度，谈成即按该额度退款结案，不必等平台判定</p>
        <template v-if="activeBreachCase.negotiation">
          <p class="conversation-actions__line">
            <strong>{{ activeBreachCase.negotiation.initiatedBy === role ? '我方' : '对方' }}提议：</strong>
            定金退还 ¥{{ activeBreachCase.negotiation.depositRefundAmountCny }} · 尾款退还 ¥{{
              activeBreachCase.negotiation.finalRefundAmountCny }}
          </p>
          <p v-if="activeBreachCase.negotiation.note" class="conversation-actions__line">
            <strong>提议说明：</strong>{{ activeBreachCase.negotiation.note }}
          </p>
          <p v-if="activeBreachCase.negotiation.respondedAt" class="conversation-actions__line">
            <strong>处理结果：</strong>{{ activeBreachCase.negotiation.status === 'accepted' ? '已同意' : '已拒绝' }}
            （{{ formatCnDateTime(activeBreachCase.negotiation.respondedAt) }}）{{
              activeBreachCase.negotiation.responseNote ? ` · ${activeBreachCase.negotiation.responseNote}` : '' }}
          </p>
        </template>
        <p v-if="negotiationHint" class="conversation-actions__tip">{{ negotiationHint }}</p>
        <template v-if="canProposeNegotiation">
          <label class="conversation-actions__field">
            <span>定金退还金额（元，上限 ¥{{ negotiationDepositCapYuan }}）</span>
            <input v-model="negotiationDepositYuan" type="number" min="0" :max="negotiationDepositCapYuan"
              step="0.01" inputmode="decimal" />
          </label>
          <label class="conversation-actions__field">
            <span>尾款退还金额（元，上限 ¥{{ negotiationFinalCapYuan }}）</span>
            <input v-model="negotiationFinalYuan" type="number" min="0" :max="negotiationFinalCapYuan" step="0.01"
              inputmode="decimal" :disabled="!finalRefundable" />
          </label>
          <p v-if="!finalRefundable" class="conversation-actions__tip">尾款尚未缴纳，尾款退还金额只能为 0</p>
          <label class="conversation-actions__field">
            <span>说明（选填，供平台人工判定参考）</span>
            <textarea v-model="negotiationNote" rows="2" maxlength="1000"
              placeholder="可留空。写明额度依据；内容双方与平台客服均可见"></textarea>
          </label>
        </template>
      </template>

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
        双方先自行协商；协商不成由任一方申请平台介入，平台按 AI 判定 + 客服人工审核认定责任方，
        AI 判定完成后由双方各自选择是否接受。
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
        提交后案件进入「协商中」：双方先在案件内协商定金与尾款的退还额度，谈成即直接退款结案。
        协商不成再由任一方申请平台介入，平台会核对合同、支付、交付与沟通记录，由审核智能体
        依据需求会话与材料判定责任方，客服人工复核后按结论执行退款／赔付并解除需求绑定。
        恶意申报会影响账号信用。
      </p>
    </template>

    <template #footer>
      <el-button @click="breachVisible = false">关闭</el-button>
      <template v-if="activeBreachCase">
        <el-button v-if="canWithdrawBreach" :loading="breachActing" @click="submitBreachWithdraw">撤回申请</el-button>
        <el-button v-if="canRequestPlatformReview" :loading="breachActing" @click="submitPlatformReview">申请平台介入</el-button>
        <template v-if="canRespondNegotiation">
          <el-button :loading="negotiationActing" @click="submitNegotiationRespond('reject')">拒绝协商</el-button>
          <el-button type="primary" :loading="negotiationActing" @click="submitNegotiationRespond('approve')">同意协商</el-button>
        </template>
        <el-button v-else-if="canProposeNegotiation" type="primary" plain :loading="negotiationActing"
          @click="submitNegotiationPropose">发起协商</el-button>
        <template v-if="canDecideBreach">
          <template v-if="breachRejectPanel">
            <el-button :loading="breachActing" @click="breachRejectPanel = false">取消</el-button>
            <el-button type="danger" :loading="breachActing" @click="submitBreachDecision('rejected')">确认不接受</el-button>
          </template>
          <template v-else>
            <el-button type="danger" plain :loading="breachActing" @click="breachRejectPanel = true">不接受</el-button>
            <el-button type="primary" :loading="breachActing" @click="submitBreachDecision('accepted')">接受判定</el-button>
          </template>
        </template>
      </template>
      <el-button v-else type="danger" :loading="breachSubmitting" @click="submitBreachReport">
        {{ settledBreachCase ? '发起新一轮终止合作' : breachWithdrawnByMe ? '重新发起' : '提交终止合作申请' }}
      </el-button>
    </template>
  </el-dialog>
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
