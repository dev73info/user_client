<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import DepositModal from '@/components/DepositModal.vue'
import {
  createAdapayPayment,
  getAdapayBreachCase,
  getAdapayClientPlatform,
  reportAdapayBreach,
  requestAdapayPlatformReview,
  submitAdapayBreachDecision,
  withdrawAdapayBreach,
  type AdapayBreachCase,
  type AdapayBreachDecisionValue,
  type AdapayBreachLiableParty,
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
import { createMcResourceVersion } from '@/api/mcResources'
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
  submitted: '待 AI 审核',
  ai_reviewing: 'AI 审核中',
  ai_judged: 'AI 已判定，待双方确认',
  support_reviewing: '客服人工判定中',
  withdrawn: '申报人已撤回',
  processing: '资金处理中',
  manual_required: '资金执行待处理',
  succeeded: '已结案',
  rejected: '已驳回',
}

/** 已结束的案件不再提供入口，只需要能重新申报时给出表单。 */
const BREACH_CLOSED_STATUSES = ['withdrawn', 'rejected', 'succeeded']

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
const deliveryVersion = ref('')
const deliveryNote = ref('')
const deliveryFile = ref<File | null>(null)
const deliveryFileInputRef = ref<HTMLInputElement | null>(null)
const deliverySubmitting = ref(false)

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
    !pendingUnbindRequest.value,
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

/** 已撤回 / 已驳回 / 已结案的案件不再展示明细，回到申报表单（与需求列表页的「重新申报」一致）。 */
const activeBreachCase = computed(() => (hasLiveBreachCase.value ? breachCase.value : null))
const canDecideBreach = computed(
  () =>
    activeBreachCase.value?.status === 'ai_judged' &&
    (isDeveloper.value
      ? activeBreachCase.value.developerDecision == null
      : activeBreachCase.value.customerDecision == null),
)
const canRequestPlatformReview = computed(
  () =>
    activeBreachCase.value != null &&
    ['submitted', 'ai_reviewing', 'ai_judged'].includes(activeBreachCase.value.status),
)
/** 撤回是申报人的单方动作：待判定期间（还没有结论）只有本人能撤回自己的申报，与需求列表页一致。 */
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

const unbindHint = computed(() =>
  pendingUnbindRequest.value && !canRespondUnbind.value
    ? `${pendingUnbindRequest.value.initiator === 'creator' ? '需求方' : '开发者'}已提交解除申请，等待对方处理`
    : '',
)

const breachDialogTitle = computed(() =>
  activeBreachCase.value ? '违约案件进展' : breachCase.value ? '重新申报履约违约' : '申报履约违约',
)

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
    list.push({ key: 'breach', label: '违约处理', tone: 'danger', run: () => void openBreachDialog() })
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
  deliveryVersion.value = ''
  deliveryNote.value = ''
  deliveryFile.value = null
  if (deliveryFileInputRef.value) {
    deliveryFileInputRef.value.value = ''
  }
  deliveryVisible.value = true
}

function handleDeliveryFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  deliveryFile.value = input.files?.[0] ?? null
}

async function submitDelivery() {
  const item = requirement.value
  if (!item?.bound_resource_id) {
    showToast('当前需求还没有关联资源项目', 'warning')
    return
  }

  const version = deliveryVersion.value.trim()
  if (!version) {
    showToast('请填写版本号', 'warning')
    return
  }
  if (!deliveryFile.value) {
    showToast('请选择交付文件', 'warning')
    return
  }

  deliverySubmitting.value = true
  try {
    const created = await createMcResourceVersion(props.token, item.bound_resource_id, {
      version,
      file: deliveryFile.value,
      note: deliveryNote.value.trim() || null,
    })
    showToast(`交付版本 ${created.version} 已提交，等待客户验收`, 'success')
    deliveryVisible.value = false
    await loadActions()
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交交付版本失败', 'error')
  } finally {
    deliverySubmitting.value = false
  }
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
}

async function submitBreachReport() {
  const item = requirement.value
  if (!item) {
    return
  }

  const reason = breachReason.value.trim()
  if (!reason) {
    showToast('请填写违约事实与依据', 'warning')
    return
  }

  breachSubmitting.value = true
  try {
    breachCase.value = await reportAdapayBreach(props.token, item.requirement_id, reason)
    showToast('违约申报已提交，审核完成后由双方确认', 'success')
    breachVisible.value = false
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交违约申报失败', 'error')
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
    showToast('已申请平台介入，等待客服人工判定', 'success')
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
    showToast('已撤回违约申报，如仍有争议可重新申报', 'success')
    emit('changed')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '撤回违约申报失败', 'error')
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

function breachLiablePartyLabel(party: AdapayBreachLiableParty) {
  return party === 'customer' ? '客户（需求方）违约' : '开发者违约'
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

  <el-dialog v-model="deliveryVisible" title="提交交付版本" width="480px" append-to-body>
    <p class="conversation-actions__meta">{{ requirement?.title }} · {{ requirementId }}</p>
    <p class="conversation-actions__tip">交付物以绑定资源项目的新版本提交，提交后由客户验收。</p>
    <label class="conversation-actions__field">
      <span>版本号</span>
      <input v-model="deliveryVersion" type="text" maxlength="40" placeholder="例如 v1.0.0" />
    </label>
    <label class="conversation-actions__field">
      <span>版本说明（可选）</span>
      <textarea v-model="deliveryNote" rows="3" maxlength="500" placeholder="本次交付包含的内容"></textarea>
    </label>
    <label class="conversation-actions__field">
      <span>交付文件</span>
      <input ref="deliveryFileInputRef" type="file" @change="handleDeliveryFileChange" />
    </label>
    <template #footer>
      <el-button @click="deliveryVisible = false">取消</el-button>
      <el-button type="primary" :loading="deliverySubmitting" @click="submitDelivery">提交交付版本</el-button>
    </template>
  </el-dialog>

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
      <p class="conversation-actions__line"><strong>申报理由：</strong>{{ activeBreachCase.reason }}</p>
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
        AI 判定完成后由双方各自选择是否接受；协商不成可申请平台介入转客服人工判定。
      </p>
    </template>

    <template v-else>
      <label class="conversation-actions__field">
        <span>事实与依据</span>
        <textarea v-model="breachReason" rows="6" maxlength="2000"
          placeholder="请描述违约事实、时间与相关证据说明"></textarea>
      </label>
      <p class="conversation-actions__tip">责任方由审核智能体依据需求会话与材料判定，恶意申报会影响账号信用。</p>
    </template>

    <template #footer>
      <el-button @click="breachVisible = false">关闭</el-button>
      <template v-if="activeBreachCase">
        <el-button v-if="canWithdrawBreach" :loading="breachActing" @click="submitBreachWithdraw">撤回申报</el-button>
        <el-button v-if="canRequestPlatformReview" :loading="breachActing" @click="submitPlatformReview">申请平台介入</el-button>
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
        {{ breachCase ? '重新申报' : '提交违约申报' }}
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
