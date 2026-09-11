<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ArrowDown, ArrowUp, ChatDotRound, Close, Document, UploadFilled } from '@element-plus/icons-vue'

import { getAdapayBreachCase, reportAdapayBreach, requestAdapayPlatformReview, type AdapayBreachCase } from '@/api/adapay'
import {
  createMcResourceVersion,
  listMcResourceVersions,
  type McResourceVersionPayload,
} from '@/api/mcResources'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import {
  listMyRequirements,
  requestUnbindRequirement,
  respondUnbindRequirement,
  type RequirementItem,
} from '@/api/devRequirements'
import {
  createRequirementContract,
  fetchAsignRequirementPreviewUrl,
  fetchDevContractSigningStatus,
  type ContractSigningStatus,
} from '@/api/contracts'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRequirementRichText } from '@/utils/requirementRichText'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const rows = ref<RequirementItem[]>([])
const signingStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const contractCreatingId = ref('')
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const conversationLoading = ref(false)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
const descriptionOverflowMap = ref<Record<string, boolean>>({})
const expandedRequirements = ref<Record<string, boolean>>({})
const descriptionEls = ref<Record<string, HTMLElement>>({})

const unbindVisible = ref(false)
const unbindRequirement = ref<RequirementItem | null>(null)
const unbindReason = ref('')
const unbindLoading = ref(false)
const unbindRespondVisible = ref(false)
const unbindRespondRequirement = ref<RequirementItem | null>(null)
const unbindRespondLoading = ref(false)
const breachVisible = ref(false)
const deliveryDialogVisible = ref(false)
const deliveryRequirement = ref<RequirementItem | null>(null)
const deliveryVersion = ref('')
const deliveryNote = ref('')
const deliveryFile = ref<File | null>(null)
const deliveryFileInput = ref<HTMLInputElement | null>(null)
const deliverySubmitting = ref(false)
const deliveryVersions = ref<McResourceVersionPayload[]>([])
const deliveryVersionsLoading = ref(false)
const breachRequirement = ref<RequirementItem | null>(null)
const breachLiableParty = ref<'customer' | 'developer'>('customer')
const breachReason = ref('')
const breachLoading = ref(false)
const breachCase = ref<AdapayBreachCase | null>(null)
const breachCaseLoading = ref(false)
const platformReviewLoading = ref(false)

/** 违约案件状态文案（与后端 adapay_breach_case.status 对应）。 */
const BREACH_STATUS_LABELS: Record<string, string> = {
  submitted: '待平台处理',
  processing: '退款／赔付处理中',
  manual_required: '平台介入中',
  succeeded: '已结案',
  rejected: '已驳回',
}

const emptyText = computed(() => (loading.value ? '我的需求单加载中' : '当前账号还没有已关联需求'))
const boundCount = computed(() => rows.value.filter((item) => item.bound_resource_id != null).length)
const activeCount = computed(() => rows.value.filter((item) => item.status === 'in_development').length)

onMounted(async () => {
  auth.hydrate()
  await loadMyRequirements()
})

async function loadMyRequirements() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    rows.value = await listMyRequirements(auth.token)
    // 无担保模式（self_managed）不需要合同，无需查询合同签署状态
    const guaranteedRows = rows.value.filter((item) => item.payment_mode !== 'self_managed')
    const [statusEntries] = await Promise.all([
      Promise.allSettled(
        guaranteedRows.map((item) =>
          fetchDevContractSigningStatus(auth.token!, item.requirement_id).then((s) => ({ id: item.requirement_id, s })),
        ),
      ),
      loadRequirementConversations(),
    ])
    const map: Record<string, ContractSigningStatus | null> = {}
    for (const entry of statusEntries) {
      if (entry.status === 'fulfilled') {
        map[entry.value.id] = entry.value.s
      }
    }
    signingStatusMap.value = map
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载已关联需求失败'
    showToast(message, 'error')
    rows.value = []
  } finally {
    loading.value = false
  }
}

function formatMoney(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
}

function statusLabel(status: RequirementItem['status']): string {
  switch (status) {
    case 'pending_review':
      return '待审核'
    case 'rejected':
      return '已驳回'
    case 'pending_deposit':
      return '待签合同'
    case 'deposit_paid':
      return '待开发'
    case 'in_development':
      return '开发中'
    case 'pending_final':
      return '待付尾款'
    case 'completed':
      return '已完成'
    default:
      return status
  }
}

function isWaitingContractSign(item: RequirementItem): boolean {
  // 无担保模式（self_managed）不需要合同签署
  if (item.payment_mode === 'self_managed') {
    return false
  }
  const status = signingStatusMap.value[item.requirement_id]
  return Boolean(
    (item.status === 'pending_deposit' || item.status === 'deposit_paid') &&
    status?.has_contract &&
    (!status.party_a_signed || !status.party_b_signed),
  )
}

function displayStatusLabel(item: RequirementItem): string {
  return isWaitingContractSign(item) ? '待签合同' : statusLabel(item.status)
}

function paymentModeLabel(item: RequirementItem): string {
  return item.payment_mode === 'self_managed' ? '无电签约定' : '电签担保'
}

function requirementFieldHtml(value?: string | null): string {
  return sanitizeRequirementRichText(value ?? '') || '当前需求暂未补充详细描述。'
}

function statusType(status: RequirementItem['status']): 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'completed':
    case 'deposit_paid':
      return 'success'
    case 'in_development':
    case 'pending_final':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'info'
  }
}

function displayStatusType(item: RequirementItem): 'info' | 'success' | 'warning' | 'danger' {
  return isWaitingContractSign(item) ? 'warning' : statusType(item.status)
}

function resourceVisibilityLabel(item: RequirementItem): string {
  if (item.bound_resource_id == null) {
    return '未关联资源'
  }

  return item.resource_visibility === 'public' ? '资源已公开' : '资源私有中'
}

function openConversation(item: RequirementItem) {
  if (!canOpenConversation(item)) {
    return
  }
  conversationRequirement.value = item
  conversationVisible.value = true
}

function isRequirementCompleted(item: RequirementItem) {
  return item.status === 'completed'
}

function canOpenConversation(item: RequirementItem) {
  return !isRequirementCompleted(item)
}

function closeConversation() {
  conversationVisible.value = false
}

function applyConversationDetail(payload: RequirementConversationDetail) {
  requirementConversationMap.value = {
    ...requirementConversationMap.value,
    [payload.conversation.requirement_id]: payload.conversation,
  }
}

function conversationForRequirement(item: RequirementItem) {
  return requirementConversationMap.value[item.requirement_id] ?? null
}

function conversationStatusLabel(item: RequirementItem) {
  if (isRequirementCompleted(item)) {
    return '需求已完成，会话已停用'
  }
  const conversation = conversationForRequirement(item)
  if (!conversation) {
    return '打开后创建会话'
  }
  return conversation.last_message_at ? `最近：${conversation.last_message_at}` : '暂无消息'
}

function isDescriptionExpanded(item: RequirementItem) {
  return Boolean(expandedRequirements.value[item.requirement_id])
}

function descriptionOverflow(item: RequirementItem) {
  return Boolean(descriptionOverflowMap.value[item.requirement_id])
}

function toggleDescription(item: RequirementItem) {
  expandedRequirements.value = {
    ...expandedRequirements.value,
    [item.requirement_id]: !isDescriptionExpanded(item),
  }
}

function setDescriptionRef(el: HTMLElement | null, item: RequirementItem) {
  if (!el) {
    delete descriptionEls.value[item.requirement_id]
    return
  }

  descriptionEls.value[item.requirement_id] = el
  void nextTick(() => {
    const target = descriptionEls.value[item.requirement_id]
    if (!target) {
      return
    }

    const overflows = target.scrollHeight > target.clientHeight + 2
    if (overflows !== Boolean(descriptionOverflowMap.value[item.requirement_id])) {
      descriptionOverflowMap.value = {
        ...descriptionOverflowMap.value,
        [item.requirement_id]: overflows,
      }
    }
  })
}

function canOpenContractSign(item: RequirementItem) {
  // 无担保模式（self_managed）不提供合同签署/查看入口
  if (item.payment_mode === 'self_managed') {
    return false
  }
  return Boolean(signingStatusMap.value[item.requirement_id]?.has_contract)
}

function contractButtonLabel(item: RequirementItem) {
  const status = signingStatusMap.value[item.requirement_id]
  return status?.party_b_signed ? '查看合同' : '签署合同'
}

function contractStartHint(item: RequirementItem): string {
  if (!isWaitingContractSign(item)) {
    return ''
  }

  const status = signingStatusMap.value[item.requirement_id]
  if (!status?.party_b_signed && !status?.party_a_signed) {
    return '请完成开发者签署，客户也需完成签署后才能支付定金'
  }
  if (!status.party_b_signed) {
    return '等待开发者完成签署'
  }
  return '等待客户签署，双方签署完成后由需求方支付定金'
}

function resourceVersionCount(item: RequirementItem) {
  return item.bound_resource_version_count ?? 0
}

// 方案 B：交付物就是绑定资源项目的资源版本，直接复用资源项目版本接口。
function canSubmitDeliveryVersion(item: RequirementItem) {
  return (
    item.bound_resource_id != null &&
    ['in_development', 'pending_final'].includes(item.status)
  )
}

function resetDeliveryForm() {
  deliveryVersion.value = ''
  deliveryNote.value = ''
  deliveryFile.value = null
  if (deliveryFileInput.value) {
    deliveryFileInput.value.value = ''
  }
}

async function loadDeliveryVersions(resourceId: number) {
  if (!auth.token) {
    return
  }

  deliveryVersionsLoading.value = true
  try {
    deliveryVersions.value = await listMcResourceVersions(auth.token, resourceId)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载资源版本失败', 'error')
  } finally {
    deliveryVersionsLoading.value = false
  }
}

function openDeliveryDialog(item: RequirementItem) {
  if (item.bound_resource_id == null) {
    showToast('当前需求还没有关联资源项目', 'warning')
    return
  }

  deliveryRequirement.value = item
  resetDeliveryForm()
  deliveryVersions.value = []
  deliveryDialogVisible.value = true
  void loadDeliveryVersions(item.bound_resource_id)
}

function closeDeliveryDialog() {
  if (deliverySubmitting.value) {
    return
  }

  deliveryDialogVisible.value = false
  deliveryRequirement.value = null
}

function openResourceVersionPage(resourceId: number) {
  void router.push({ name: 'dev-resource-versions', params: { resourceId } })
}

function chooseDeliveryFile() {
  deliveryFileInput.value?.click()
}

function handleDeliveryFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  deliveryFile.value = input.files?.[0] ?? null
  input.value = ''
}

function clearDeliveryFile() {
  deliveryFile.value = null
  if (deliveryFileInput.value) {
    deliveryFileInput.value.value = ''
  }
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 || size >= 10 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function deliveryVersionSummary() {
  if (deliveryVersionsLoading.value) {
    return '加载中...'
  }

  if (deliveryVersions.value.length === 0) {
    return '暂无'
  }

  const labels = deliveryVersions.value.slice(0, 3).map((item) => item.version)
  const suffix = deliveryVersions.value.length > 3 ? ` 等 ${deliveryVersions.value.length} 版` : ''
  return `${labels.join('、')}${suffix}`
}

async function submitDeliveryVersion() {
  const item = deliveryRequirement.value
  if (!item?.bound_resource_id) {
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
    const created = await createMcResourceVersion(auth.token, item.bound_resource_id, {
      version,
      file: deliveryFile.value,
      note: deliveryNote.value.trim() || null,
    })
    showToast(`交付版本 ${created.version} 已提交，等待客户验收`, 'success')
    resetDeliveryForm()
    deliveryDialogVisible.value = false
    deliveryRequirement.value = null
    await loadMyRequirements()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交交付版本失败', 'error')
  } finally {
    deliverySubmitting.value = false
  }
}

function canReportBreach(item: RequirementItem) {
  return item.payment_mode !== 'self_managed' &&
    ['deposit_paid', 'in_development', 'pending_final'].includes(item.status)
}

async function openBreachReport(item: RequirementItem) {
  if (!canReportBreach(item)) {
    return
  }
  breachRequirement.value = item
  breachLiableParty.value = 'customer'
  breachReason.value = ''
  breachCase.value = null
  breachVisible.value = true
  breachCaseLoading.value = true
  try {
    breachCase.value = await getAdapayBreachCase(auth.token, item.requirement_id)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载违约案件失败', 'error')
  } finally {
    breachCaseLoading.value = false
  }
}

function closeBreachReport() {
  if (breachLoading.value || platformReviewLoading.value || breachCaseLoading.value) {
    return
  }
  breachVisible.value = false
  breachRequirement.value = null
  breachReason.value = ''
  breachCase.value = null
}

async function submitPlatformReview() {
  if (!breachCase.value) {
    return
  }
  platformReviewLoading.value = true
  try {
    breachCase.value = await requestAdapayPlatformReview(auth.token, breachCase.value.id)
    showToast('已申请平台介入，请等待平台裁决', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '申请平台介入失败', 'error')
  } finally {
    platformReviewLoading.value = false
  }
}

async function submitBreachReport() {
  const item = breachRequirement.value
  const reason = breachReason.value.trim()
  if (!item || !reason) {
    showToast('请填写违约事实和相关依据', 'warning')
    return
  }
  breachLoading.value = true
  try {
    breachCase.value = await reportAdapayBreach(
      auth.token,
      item.requirement_id,
      breachLiableParty.value,
      reason,
    )
    showToast('违约申报已提交，等待平台审核', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交违约申报失败', 'error')
  } finally {
    breachLoading.value = false
  }
}

function openContractSign(item: RequirementItem) {
  router.push({
    name: 'contract-sign',
    query: { requirement_id: item.requirement_id, from: 'dev' },
  })
}

/**
 * 「查看合同」跳转到爱签的合同预览页（previewContract）。
 *
 * 合同已在爱签侧发起签署时可获取预览链接；若合同尚未发起爱签签署
 * 或爱签接口异常，则回退到本地合同签署页展示。
 */
async function viewContractPreview(item: RequirementItem) {
  if (auth.token) {
    try {
      const previewUrl = await fetchAsignRequirementPreviewUrl(auth.token, item.requirement_id)
      if (previewUrl) {
        window.location.href = previewUrl
        return
      }
    } catch {
      // 爱签预览不可用：回退本地合同展示。
    }
  }
  openContractSign(item)
}

function handleContractButtonClick(item: RequirementItem) {
  if (contractButtonLabel(item) === '查看合同') {
    void viewContractPreview(item)
    return
  }
  openContractSign(item)
}

/**
 * 担保模式下，接单不再自动创建合同，需由需求方或开发者主动发起。
 */
function canCreateRequirementContract(item: RequirementItem) {
  if (item.payment_mode === 'self_managed') {
    return false
  }
  if (item.status !== 'pending_deposit' && item.status !== 'deposit_paid') {
    return false
  }
  return !signingStatusMap.value[item.requirement_id]?.has_contract
}

async function createRequirementContractAction(item: RequirementItem) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  contractCreatingId.value = item.requirement_id
  try {
    await createRequirementContract(auth.token, item.requirement_id)
    showToast('合同已发起，请完成签署', 'success')
    const status = await fetchDevContractSigningStatus(auth.token, item.requirement_id)
    signingStatusMap.value = { ...signingStatusMap.value, [item.requirement_id]: status }
    openContractSign(item)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发起合同失败', 'error')
  } finally {
    contractCreatingId.value = ''
  }
}

function canRequestUnbind(item: RequirementItem) {
  return (
    (item.status === 'in_development' ||
      item.status === 'deposit_paid' ||
      item.status === 'pending_deposit') &&
    !item.pending_unbind_request
  )
}

function unbindRequestHint(item: RequirementItem) {
  const request = item.pending_unbind_request
  if (!request) {
    return ''
  }

  if (request.status === 'pending') {
    return request.initiator === 'creator'
      ? '需求方申请解除，等待你确认'
      : '已提交解除申请，等待需求方确认'
  }

  if (request.status === 'approved') {
    return '解除申请已通过，需求已重新挂回大厅'
  }

  return '解除申请已被拒绝'
}

function openUnbindRequest(item: RequirementItem) {
  if (!canRequestUnbind(item)) {
    return
  }
  unbindRequirement.value = item
  unbindReason.value = ''
  unbindVisible.value = true
}

function closeUnbindRequest() {
  if (unbindLoading.value) {
    return
  }
  unbindVisible.value = false
  unbindRequirement.value = null
  unbindReason.value = ''
}

async function submitUnbindRequest() {
  const item = unbindRequirement.value
  if (!item) {
    return
  }

  const reason = unbindReason.value.trim()
  if (!reason) {
    showToast('请填写解除绑定的原因', 'warning')
    return
  }

  unbindLoading.value = true
  try {
    await requestUnbindRequirement(auth.token, item.requirement_id, reason)
    showToast('解除申请已提交，等待需求方确认', 'success')
    unbindVisible.value = false
    unbindRequirement.value = null
    unbindReason.value = ''
    await loadMyRequirements()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交解除申请失败', 'error')
  } finally {
    unbindLoading.value = false
  }
}

function hasPendingCreatorUnbindRequest(item: RequirementItem) {
  return item.pending_unbind_request?.status === 'pending' &&
    item.pending_unbind_request.initiator === 'creator'
}

function openUnbindRespond(item: RequirementItem) {
  if (!hasPendingCreatorUnbindRequest(item)) {
    return
  }
  unbindRespondRequirement.value = item
  unbindRespondVisible.value = true
}

function closeUnbindRespond() {
  if (unbindRespondLoading.value) {
    return
  }
  unbindRespondVisible.value = false
  unbindRespondRequirement.value = null
}

async function submitUnbindRespond(action: 'approve' | 'reject') {
  const item = unbindRespondRequirement.value
  if (!item) {
    return
  }

  unbindRespondLoading.value = true
  try {
    await respondUnbindRequirement(auth.token, item.requirement_id, action)
    showToast(action === 'approve' ? '已同意解除，需求已重新挂回大厅' : '已拒绝解除申请', 'success')
    unbindRespondVisible.value = false
    unbindRespondRequirement.value = null
    await loadMyRequirements()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '处理解除申请失败', 'error')
  } finally {
    unbindRespondLoading.value = false
  }
}

async function loadRequirementConversations() {
  if (!auth.token) {
    requirementConversationMap.value = {}
    return
  }

  conversationLoading.value = true
  try {
    const conversations = await listRequirementConversations(auth.token)
    requirementConversationMap.value = Object.fromEntries(
      conversations.map((item) => [item.requirement_id, item]),
    )
  } catch (error) {
    requirementConversationMap.value = {}
    showToast(error instanceof Error ? error.message : '加载沟通会话失败', 'error')
  } finally {
    conversationLoading.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-page--my-requirements">

    <div class="dev-meta-strip">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">总需求单</span>
        <span class="dev-meta-strip__value">{{ rows.length }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">已关联资源</span>
        <span class="dev-meta-strip__value">{{ boundCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">开发中</span>
        <span class="dev-meta-strip__value">{{ activeCount }}</span>
      </div>
    </div>

    <el-card shadow="never" class="dev-surface-card dev-my-requirements-card">
      <div class="dev-my-requirements-list" v-loading="loading">
        <div v-if="rows.length === 0" class="dev-my-requirements-empty">{{ emptyText }}</div>
        <article v-for="item in rows" :key="item.requirement_id" class="dev-requirement-card">
          <header class="dev-requirement-card__head">
            <div class="dev-requirement-card__title-block">
              <span class="dev-requirement-hall__requirement-id">{{ item.requirement_id }}</span>
              <h3 class="dev-requirement-hall__title">{{ item.title }}</h3>
              <article class="dev-requirement-hall__desc dev-requirement-card__description"
                :class="{ 'is-collapsed': !isDescriptionExpanded(item) }"
                :ref="(el) => setDescriptionRef(el as HTMLElement | null, item)"
                v-html="requirementFieldHtml(item.description)"></article>
              <button v-if="isDescriptionExpanded(item) || descriptionOverflow(item)" type="button"
                class="dev-requirement-card__description-toggle" @click="toggleDescription(item)">
                <el-icon>
                  <ArrowUp v-if="isDescriptionExpanded(item)" />
                  <ArrowDown v-else />
                </el-icon>
                <span>{{ isDescriptionExpanded(item) ? '收起' : '展开' }}</span>
              </button>
            </div>
            <div class="dev-requirement-card__tags">
              <el-tag :type="displayStatusType(item)" effect="plain">{{ displayStatusLabel(item) }}</el-tag>
              <el-tag :type="item.payment_mode === 'self_managed' ? 'info' : 'warning'" effect="plain">
                {{ paymentModeLabel(item) }}
              </el-tag>
            </div>
          </header>

          <div class="dev-requirement-card__meta">
            <span class="dev-requirement-card__meta-item">
              <label>预算</label>
              <strong>{{ formatMoney(item.budget) }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>资源关联</label>
              <strong>{{ resourceVisibilityLabel(item) }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>最近更新</label>
              <strong>{{ item.updated_at }}</strong>
            </span>
            <span class="dev-requirement-card__meta-item">
              <label>会话</label>
              <strong>{{ conversationLoading ? '加载中' : conversationStatusLabel(item) }}</strong>
            </span>
            <span v-if="item.bound_resource_id != null" class="dev-requirement-card__meta-item">
              <label>资源版本</label>
              <strong>{{ resourceVersionCount(item) }} 版</strong>
            </span>
          </div>

          <div class="dev-requirement-card__progress">
            <RequirementProgressGuide :requirement="item" :payment-mode="item.payment_mode" view="dev"
              :contract-status="signingStatusMap[item.requirement_id]" />
          </div>

          <div v-if="item.payment_mode !== 'self_managed'" class="dev-requirement-card__signing">
            <div class="signing-status-bar">
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.has_contract ? 'done' : 'pending'">
                协议已创建
              </span>
              <span class="signing-arrow">›</span>
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.party_b_signed ? 'done' : 'pending'">
                乙方已签
              </span>
              <span class="signing-arrow">›</span>
              <span class="signing-step"
                :class="signingStatusMap[item.requirement_id]?.party_a_signed ? 'done' : 'pending'">
                甲方已签
              </span>
            </div>
            <div v-if="contractStartHint(item)" class="signing-start-hint">{{ contractStartHint(item) }}</div>
          </div>

          <footer class="dev-requirement-card__actions">
            <div class="dev-requirement-card__unbind">
              <span v-if="item.pending_unbind_request?.status === 'pending'" class="dev-requirement-card__unbind-hint">
                {{ unbindRequestHint(item) }}
              </span>
            </div>
            <div class="dev-requirement-card__buttons">
              <el-button v-if="canSubmitDeliveryVersion(item)" type="primary" plain size="small"
                title="交付物以绑定资源项目的新版本提交" @click="openDeliveryDialog(item)">
                提交交付版本
              </el-button>
              <el-button v-if="canReportBreach(item)" type="danger" plain size="small"
                @click="openBreachReport(item)">
                违约处理
              </el-button>
              <el-button v-if="canCreateRequirementContract(item)" type="primary" size="small"
                :loading="contractCreatingId === item.requirement_id"
                @click="createRequirementContractAction(item)">
                发起合同
              </el-button>
              <el-button v-if="canOpenContractSign(item)" size="small" @click="handleContractButtonClick(item)">
                {{ contractButtonLabel(item) }}
              </el-button>
              <el-button type="primary" plain size="small" class="dev-requirement-card__conversation"
                :disabled="!canOpenConversation(item)" @click="openConversation(item)">
                <el-icon><ChatDotRound /></el-icon>
                <span>会话</span>
              </el-button>
              <el-button v-if="hasPendingCreatorUnbindRequest(item)" type="warning" size="small"
                @click="openUnbindRespond(item)">处理解除申请</el-button>
              <el-button v-else-if="canRequestUnbind(item)" type="danger" plain size="small"
                @click="openUnbindRequest(item)">申请解除</el-button>
            </div>
          </footer>
        </article>
      </div>
    </el-card>

    <el-dialog v-model="unbindVisible" title="申请解除需求绑定" width="480px"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="closeUnbindRequest">
      <div class="unbind-dialog-body">
        <p class="unbind-dialog-tip">
          解除后需求将重新挂回大厅，等待其他开发者承接。此操作需要需求方确认，请填写真实原因。
        </p>
        <el-input v-model="unbindReason" type="textarea" :rows="4" maxlength="1000" show-word-limit
          placeholder="请说明无法继续完成的原因，例如：与需求方沟通后确认技术方案无法实现" />
      </div>
      <template #footer>
        <el-button :disabled="unbindLoading" @click="closeUnbindRequest">取消</el-button>
        <el-button type="danger" :loading="unbindLoading" @click="submitUnbindRequest">提交申请</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unbindRespondVisible" title="需求方申请解除绑定" width="480px"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="closeUnbindRespond">
      <div class="unbind-dialog-body">
        <p class="unbind-dialog-tip">需求方申请解除绑定，请确认是否同意。</p>
        <p class="unbind-dialog-line">
          <strong>需求编号：</strong>{{ unbindRespondRequirement?.requirement_id }}
        </p>
        <p class="unbind-dialog-line">
          <strong>申请原因：</strong>{{ unbindRespondRequirement?.pending_unbind_request?.reason }}
        </p>
      </div>
      <template #footer>
        <el-button :disabled="unbindRespondLoading" @click="closeUnbindRespond">取消</el-button>
        <el-button type="danger" :disabled="unbindRespondLoading"
          @click="submitUnbindRespond('reject')">拒绝解除</el-button>
        <el-button type="primary" :loading="unbindRespondLoading"
          @click="submitUnbindRespond('approve')">同意解除</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="deliveryDialogVisible" title="提交交付版本" width="520px"
      style="--el-dialog-padding-primary: 12px" :close-on-click-modal="false"
      :close-on-press-escape="false" @close="closeDeliveryDialog">
      <div class="delivery-dialog-body">
        <p class="unbind-dialog-tip">交付物会保存为绑定资源项目的新版本，验收前至少提交一版。</p>
        <el-form label-position="top" class="delivery-dialog-form">
          <el-form-item label="版本号" required>
            <el-input v-model="deliveryVersion" maxlength="80" placeholder="例如：1.0.0、首版功能交付" />
          </el-form-item>
          <el-form-item label="交付说明">
            <el-input v-model="deliveryNote" type="textarea" :rows="2" maxlength="1000" show-word-limit
              placeholder="已完成的功能、使用方式和已知限制（会作为版本备注）" />
          </el-form-item>
          <el-form-item label="交付文件" required>
            <div class="delivery-artifact-field">
              <input ref="deliveryFileInput" class="delivery-artifact-field__native" type="file"
                @change="handleDeliveryFileChange" />

              <div v-if="!deliveryFile" class="delivery-artifact-field__dropzone" role="button" tabindex="0"
                @click="chooseDeliveryFile" @keydown.enter.prevent="chooseDeliveryFile"
                @keydown.space.prevent="chooseDeliveryFile">
                <span class="delivery-artifact-field__icon" aria-hidden="true">
                  <el-icon>
                    <UploadFilled />
                  </el-icon>
                </span>
                <span class="delivery-artifact-field__copy">
                  <strong>点击选择交付文件</strong>
                  <small>文件会作为资源项目新版本保存，客户可在需求详情中下载</small>
                </span>
              </div>

              <div v-else class="delivery-artifact-field__file">
                <span class="delivery-artifact-field__icon delivery-artifact-field__icon--file" aria-hidden="true">
                  <el-icon>
                    <Document />
                  </el-icon>
                </span>
                <span class="delivery-artifact-field__copy">
                  <strong :title="deliveryFile.name">{{ deliveryFile.name }}</strong>
                  <small>{{ formatBytes(deliveryFile.size) }} · 提交后可在资源项目版本页管理</small>
                </span>
                <button type="button" class="delivery-artifact-field__remove" title="移除文件"
                  @click="clearDeliveryFile">
                  <el-icon>
                    <Close />
                  </el-icon>
                </button>
              </div>
            </div>
          </el-form-item>
        </el-form>

        <div class="delivery-existing">
          <span class="delivery-existing__label">已有交付版本</span>
          <span class="delivery-existing__value">{{ deliveryVersionSummary() }}</span>
          <button v-if="deliveryRequirement?.bound_resource_id" type="button" class="delivery-existing__link"
            @click="openResourceVersionPage(deliveryRequirement.bound_resource_id)">
            去资源项目版本页
          </button>
        </div>
      </div>
      <template #footer>
        <el-button :disabled="deliverySubmitting" @click="closeDeliveryDialog">取消</el-button>
        <el-button type="primary" :loading="deliverySubmitting" @click="submitDeliveryVersion">
          提交交付版本
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="breachVisible" :title="breachCase ? '违约案件进展' : '申报履约违约'" width="520px"
      :close-on-click-modal="false" :close-on-press-escape="false" @close="closeBreachReport">
      <div class="delivery-dialog-body">
        <p class="unbind-dialog-tip">
          平台会核对合同、支付、交付和沟通记录，最终责任及资金处理由平台管理员裁决。
        </p>
        <p v-if="breachCaseLoading" class="unbind-dialog-tip">正在加载违约案件…</p>
        <template v-else-if="breachCase">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="案件编号">{{ breachCase.caseNo }}</el-descriptions-item>
            <el-descriptions-item label="当前状态">
              {{ BREACH_STATUS_LABELS[breachCase.status] ?? breachCase.status }}
            </el-descriptions-item>
            <el-descriptions-item label="责任方">
              {{ breachCase.liableParty === 'customer' ? '客户' : '开发者' }}
            </el-descriptions-item>
            <el-descriptions-item label="申报理由">{{ breachCase.reason }}</el-descriptions-item>
            <el-descriptions-item label="资金处理">
              定金 ¥{{ breachCase.depositAmountCny }} · 已退尾款 ¥{{ breachCase.refundAmountCny }} · 赔付 ¥{{ breachCase.compensationAmountCny }}
            </el-descriptions-item>
            <el-descriptions-item v-if="breachCase.resolutionNote" label="裁决说明">
              {{ breachCase.resolutionNote }}
            </el-descriptions-item>
          </el-descriptions>
          <p class="unbind-dialog-tip">协商不成时可申请平台介入，由平台裁决责任归属与尾款退还比例。</p>
        </template>
        <el-form v-else label-position="top">
          <el-form-item label="责任方向" required>
            <el-select v-model="breachLiableParty" style="width: 100%">
              <el-option label="客户违约" value="customer" />
              <el-option label="开发者违约" value="developer" />
            </el-select>
          </el-form-item>
          <el-form-item label="事实与依据" required>
            <el-input v-model="breachReason" type="textarea" :rows="6" maxlength="2000" show-word-limit
              placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="platformReviewLoading || breachLoading" @click="closeBreachReport">
          {{ breachCase ? '关闭' : '取消' }}
        </el-button>
        <el-button v-if="breachCase && breachCase.status === 'submitted'" type="primary"
          :loading="platformReviewLoading" @click="submitPlatformReview">申请平台介入</el-button>
        <el-button v-else-if="!breachCase" type="primary" :loading="breachLoading" @click="submitBreachReport">
          提交申报
        </el-button>
      </template>
    </el-dialog>

    <RequirementConversationModal :visible="conversationVisible" api-mode="dev" :token="auth.token"
      :current-username="auth.username" :requirement-id="conversationRequirement?.requirement_id ?? ''"
      :title="conversationRequirement?.title" @updated="applyConversationDetail" @close="closeConversation" />
  </div>
</template>

<style scoped>
.dev-my-requirements-card {
  overflow: hidden;
}

.dev-my-requirements-list {
  display: grid;
  gap: 16px;
}

.dev-my-requirements-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--dev-muted);
  font-size: 14px;
}

.dev-requirement-card {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 18px;
  background: #ffffff;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.dev-requirement-card:hover {
  border-color: rgba(42, 166, 164, 0.28);
  box-shadow: 0 12px 26px rgba(17, 24, 39, 0.06);
}

.dev-requirement-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.dev-requirement-card__title-block {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.dev-requirement-card__title-block .dev-requirement-hall__title {
  font-size: 17px;
}

.dev-requirement-card__description {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.dev-requirement-card__description :deep(p) {
  margin: 0 0 8px;
}

.dev-requirement-card__description :deep(p:last-child) {
  margin-bottom: 0;
}

.dev-requirement-card__description :deep(ul),
.dev-requirement-card__description :deep(ol) {
  margin: 0 0 8px;
  padding-left: 22px;
}

.dev-requirement-card__description :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid rgba(42, 166, 164, 0.35);
  color: var(--dev-ink);
}

.dev-requirement-card__description :deep(hr) {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid rgba(17, 24, 39, 0.12);
}

.dev-requirement-card__description :deep(pre) {
  overflow-x: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.06);
  white-space: pre;
}

.dev-requirement-card__description.is-collapsed {
  max-height: 84px;
  overflow: hidden;
}

.dev-requirement-card__description-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #247f7d;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dev-requirement-card__description-toggle:hover {
  color: #1f6f6d;
}

.dev-requirement-card__conversation {
  border-radius: 999px;
  font-weight: 700;
}

.dev-requirement-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.dev-requirement-card__meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 0;
  border-top: 1px dashed rgba(17, 24, 39, 0.08);
  border-bottom: 1px dashed rgba(17, 24, 39, 0.08);
}

.dev-requirement-card__meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.dev-requirement-card__meta-item label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dev-muted);
}

.dev-requirement-card__meta-item strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

.dev-requirement-card__signing {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dev-requirement-card__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 0;
  padding: 12px 0 0;
  border-top: 1px dashed rgba(17, 24, 39, 0.08);
  background: transparent;
  text-align: left;
}

.dev-requirement-card__unbind-hint {
  font-size: 12px;
  font-weight: 700;
  color: #b45309;
}

.dev-requirement-card__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.signing-status-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  max-width: 100%;
  row-gap: 6px;
}

.signing-step {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}

.signing-step.done {
  background: rgba(76, 175, 129, 0.15);
  color: #4caf81;
  font-weight: 600;
}

.signing-step.pending {
  background: rgba(0, 0, 0, 0.06);
  color: #909399;
}

.signing-arrow {
  color: #c0c4cc;
  font-size: 12px;
}

.signing-start-hint {
  margin-top: 4px;
  color: #b45309;
  font-size: 12px;
  line-height: 1.5;
}

.unbind-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unbind-dialog-tip {
  margin: 0;
  color: #b45309;
  font-size: 13px;
  line-height: 1.6;
}

.unbind-dialog-line {
  margin: 0;
  color: #303133;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.delivery-dialog-body {
  display: grid;
  gap: 10px;
}

.delivery-dialog-body .unbind-dialog-tip {
  padding: 8px 10px;
  border: 1px solid rgba(251, 191, 36, 0.32);
  border-radius: 10px;
  background: rgba(254, 243, 199, 0.48);
  font-size: 12px;
  line-height: 1.5;
}

.delivery-dialog-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.delivery-dialog-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.delivery-artifact-field {
  display: grid;
  gap: 10px;
  width: 100%;
}

/* 真正的文件选择框由上传卡片代理，原生控件不再出现 */
.delivery-artifact-field__native {
  display: none;
}

.delivery-artifact-field__dropzone,
.delivery-artifact-field__file {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 11px 12px;
  border-radius: 12px;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}

.delivery-artifact-field__dropzone {
  border: 1px dashed rgba(148, 163, 184, 0.72);
  background: rgba(248, 250, 252, 0.78);
  cursor: pointer;
}

.delivery-artifact-field__dropzone:hover {
  border-color: rgba(37, 99, 235, 0.58);
  background: rgba(239, 246, 255, 0.72);
}

.delivery-artifact-field__dropzone:focus-visible {
  outline: none;
  border-color: rgba(37, 99, 235, 0.7);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.delivery-artifact-field__file {
  border: 1px solid rgba(34, 197, 94, 0.34);
  background: rgba(240, 253, 244, 0.66);
}

.delivery-artifact-field__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 16px;
}

.delivery-artifact-field__icon--file {
  background: rgba(220, 252, 231, 0.9);
  color: #15803d;
}

.delivery-artifact-field__copy {
  display: grid;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.delivery-artifact-field__copy strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delivery-artifact-field__copy small {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.delivery-artifact-field__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 160ms ease, color 160ms ease;
}

.delivery-artifact-field__remove:hover {
  background: rgba(254, 226, 226, 0.8);
  color: #dc2626;
}

.delivery-existing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 12px;
}

.delivery-existing__label {
  flex: 0 0 auto;
  color: #334155;
  font-weight: 800;
}

.delivery-existing__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delivery-existing__link {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 720px) {
  .dev-requirement-card__head {
    flex-direction: column;
  }

  .dev-requirement-card__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
