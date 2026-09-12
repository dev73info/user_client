<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Close, Refresh } from '@element-plus/icons-vue'

import PublishModal from '@/components/PublishModal.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import WechatAuthorizationModal from '@/components/WechatAuthorizationModal.vue'
import {
  getUnionPaymentAuthorizeUrl,
  isUnionPaymentAuthorizationRequired,
  isWechatPaymentAuthorizationRequired,
} from '@/api/auth'
import { HttpError, apiUrl } from '@/api/http'
import { listPublicMcResourceVersions, type PublicMcResourceVersionItem } from '@/api/resources'
import { getMyRealnameVerification } from '@/api/realname'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import { createRequirementContract, fetchAsignRequirementPreviewUrl, fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import {
  createAdapayPayment,
  getAdapayBreachCase,
  getAdapayPayment,
  reportAdapayBreach,
  requestAdapayPlatformReview,
  submitAdapayBreachDecision,
  getAdapayClientPlatform,
  type AdapayBreachCase,
  type AdapayBreachDecisionValue,
  type AdapayBreachLiableParty,
  type AdapayBusinessPayChannel,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import {
  cancelRequirement as cancelRequirementApi,
  commentRequirement as commentRequirementApi,
  createRequirement as createRequirementApi,
  listRequirements,
  requestRequirementFinalPayment as requestRequirementFinalPaymentApi,
  requestUnbindRequirement as requestUnbindRequirementApi,
  resubmitRequirement as resubmitRequirementApi,
  respondUnbindRequirement as respondUnbindRequirementApi,
  reviewRequirementResourceDelete as reviewRequirementResourceDeleteApi,
  updateRequirementResourceVisibility as updateRequirementResourceVisibilityApi,
  updateRequirementSubscription as updateRequirementSubscriptionApi,
  type RequirementItem,
  type RequirementPaymentMode,
  type RequirementPendingResourceVersionDeleteRequest,
  type RequirementResourceVisibility,
  type RequirementStatus,
} from '@/api/requirements'
import { getDepositRatio } from '@/api/settings'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import {
  requirementRichTextPlainText,
  sanitizeRequirementRichText,
  validateRequirementRichText,
} from '@/utils/requirementRichText'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()

const requirementLoading = ref(false)
const myRequirements = ref<RequirementItem[]>([])
const payVisible = ref(false)
const payRequirement = ref<RequirementItem | null>(null)
const detailRequirement = ref<RequirementItem | null>(null)
const payChannel = ref<AdapayBusinessPayChannel>('alipay')
const payLoading = ref(false)
type PaymentState = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  alipay_order_string?: string
  expires_at: string
  adapay?: boolean
}
const currentPayment = ref<PaymentState | null>(null)
const wechatAuthorizationVisible = ref(false)
const wechatAuthorizationUrl = ref('')
const commentVisible = ref(false)
const commentRequirement = ref<RequirementItem | null>(null)
const commentRating = ref(5)
const commentText = ref('')
const commentLoading = ref(false)
const publishVisible = ref(false)
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
const publishLoading = ref(false)
const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const editModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const editVisible = ref(false)
const editRequirement = ref<RequirementItem | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const editBudget = ref<string | number>('')
const editAcceptance = ref('')
const editPaymentMode = ref<RequirementPaymentMode>('self_managed')
const editLoading = ref(false)
const requirementSubscriptionLoadingId = ref<string | null>(null)
const resourceVisibilityLoadingId = ref<string | null>(null)
const resourceVersionDeleteReviewLoadingId = ref<string | null>(null)
const finalPaymentConfirmVisible = ref(false)
const finalPaymentConfirmTarget = ref<RequirementItem | null>(null)
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const conversationLoading = ref(false)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
const expandedVersionDeleteReviewRequirementId = ref<string | null>(null)
const versionDeleteRejectTargetId = ref<number | null>(null)
const versionDeleteRejectNotes = ref<Record<number, string>>({})
const depositRatioPercent = ref(20)
const contractSigningStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const contractCreatingId = ref('')
const resourceVersionsMap = ref<Record<string, PublicMcResourceVersionItem[]>>({})
const unbindRespondVisible = ref(false)
const unbindRespondRequirement = ref<RequirementItem | null>(null)
const unbindRespondLoading = ref(false)
const unbindRequestVisible = ref(false)
const unbindRequestRequirement = ref<RequirementItem | null>(null)
const unbindRequestReason = ref('')
const unbindRequestLoading = ref(false)
const cancelConfirmVisible = ref(false)
const cancelConfirmTarget = ref<RequirementItem | null>(null)
const cancelLoading = ref(false)
const breachVisible = ref(false)
const breachRequirement = ref<RequirementItem | null>(null)
const breachReason = ref('')
const breachLoading = ref(false)
const breachCase = ref<AdapayBreachCase | null>(null)
const breachCaseLoading = ref(false)
const platformReviewLoading = ref(false)
const breachDecisionLoading = ref(false)
const breachRejectPanel = ref(false)
const breachDecisionNote = ref('')

/** 违约案件状态文案（与后端 adapay_breach_case.status 对应）。 */
const BREACH_STATUS_LABELS: Record<string, string> = {
  submitted: '待 AI 审核',
  ai_reviewing: 'AI 审核中',
  ai_judged: 'AI 已判定，待双方确认',
  support_reviewing: '客服人工判定中',
  processing: '资金处理中',
  manual_required: '资金执行待处理',
  succeeded: '已结案',
  rejected: '已驳回',
}

/** 责任方文案。 */
function breachLiablePartyLabel(party: AdapayBreachLiableParty) {
  return party === 'customer' ? '客户（需求方）违约' : '开发者违约'
}

/** 表态文案：`null` 表示该方尚未表态。 */
function breachDecisionText(decision?: AdapayBreachDecisionValue | null) {
  if (!decision) {
    return '未表态'
  }
  return decision === 'accepted' ? '已接受 AI 判定' : '不接受 AI 判定'
}

/** 双方表态状态只在 AI 判定后才有意义。 */
function showBreachDecisions(item: AdapayBreachCase) {
  return (
    item.status === 'ai_judged' ||
    item.customerDecision != null ||
    item.developerDecision != null
  )
}

/** 本页是需求方（客户）视角：`customerDecision` 是我方表态，`developerDecision` 是对方表态。 */
function canDecideBreachCase(item: AdapayBreachCase | null) {
  return item?.status === 'ai_judged' && item.customerDecision == null
}

/** 资金尚未开始执行时才允许申请平台介入（后端在 processing / manual_required 会拒绝）。 */
function canRequestPlatformReview(item: AdapayBreachCase | null) {
  return item != null && ['submitted', 'ai_reviewing', 'ai_judged'].includes(item.status)
}

function syncPublishModalFromRoute(value: unknown) {
  if (value === 'publish' && !publishVisible.value) {
    resetPublishForm()
    publishVisible.value = true
  }
}

const detailRequirementDescriptionHtml = computed(
  () =>
    sanitizeRequirementRichText(detailRequirement.value?.description ?? '') ||
    '当前需求暂未补充详细描述。',
)
const detailRequirementAcceptanceHtml = computed(
  () =>
    sanitizeRequirementRichText(detailRequirement.value?.acceptance_criteria ?? '') ||
    '当前需求暂未补充验收标准。',
)

const requirementStats = computed(() => ({
  total: myRequirements.value.length,
  active: myRequirements.value.filter(
    (item) => item.status === 'in_development' || item.status === 'pending_final',
  ).length,
  pending: myRequirements.value.filter(
    (item) => item.status === 'pending_review' || item.status === 'pending_deposit',
  ).length,
  completed: myRequirements.value.filter(
    (item) => item.status === 'completed',
  ).length,
}))

function formatRequirementStatus(status: RequirementStatus) {
  return requirementStatusLabel(status)
}

function isWaitingContractSign(item: RequirementItem) {
  // 无担保模式（self_managed）不需要合同签署
  if (isSelfManagedRequirement(item)) {
    return false
  }
  const status = signingStatusForRequirement(item)
  return Boolean(
    (item.status === 'pending_deposit' || item.status === 'deposit_paid') &&
    status?.has_contract &&
    (!status.party_a_signed || !status.party_b_signed),
  )
}

function isUnbinding(item: RequirementItem) {
  return item.pending_unbind_request?.status === 'pending'
}

function formatRequirementDisplayStatus(item: RequirementItem) {
  if (isUnbinding(item)) {
    return item.pending_unbind_request?.initiator === 'creator' ? '解除待确认' : '开发者申请解除'
  }
  if (!isSelfManagedRequirement(item) && item.status === 'pending_deposit') {
    if (!hasBoundResource(item)) {
      return '待开发者接单'
    }
    if (!isRequirementContractSigned(item)) {
      return '待签合同'
    }
    return '待付定金'
  }
  return isWaitingContractSign(item) ? '待签合同' : formatRequirementStatus(item.status)
}

function isSelfManagedRequirement(item: RequirementItem) {
  return item.payment_mode === 'self_managed'
}

function isAdapayRequirement(item: RequirementItem) {
  return item.payment_mode === 'platform_guarantee'
}

function paymentModeLabel(item: RequirementItem) {
  return isSelfManagedRequirement(item) ? '无电签约定' : '电签担保'
}

function paymentModeHint(item: RequirementItem) {
  return isSelfManagedRequirement(item)
    ? '付款由双方另行约定'
    : '按平台定金与尾款流程推进'
}

function formatRequirementTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRequirementCreatedTime(item: RequirementItem) {
  return item.created_time?.trim() ? formatRequirementTime(item.created_time) : '时间未知'
}

function formatBudget(value?: number | null) {
  if (value == null) {
    return '待议价'
  }
  return `¥${value.toFixed(2)}`
}

function canPay(status: RequirementStatus, item?: RequirementItem) {
  if (item && isSelfManagedRequirement(item)) {
    return false
  }
  if (item && !isRequirementContractSigned(item)) {
    return false
  }

  return status === 'pending_deposit' || status === 'pending_final'
}

// 交付版本 = 绑定资源项目的资源版本，直接复用资源项目版本接口（见方案 B）。
function publishedVersionCount(item: RequirementItem) {
  const versions = resourceVersionsMap.value[item.requirement_id]
  return versions ? versions.length : (item.bound_resource_version_count ?? 0)
}

function deliveryVersionsFor(item: RequirementItem) {
  return resourceVersionsMap.value[item.requirement_id] ?? []
}

function latestDeliveryVersionLabel(item: RequirementItem) {
  const latest = deliveryVersionsFor(item)[0]
  return latest ? `（最新 ${latest.version} · ${latest.created_at}）` : ''
}

function deliveryVersionNoteText(note?: string | null) {
  return requirementRichTextPlainText(note ?? '')
}

function deliveryVersionDownloadUrl(version: PublicMcResourceVersionItem) {
  return apiUrl(version.resource)
}

function canRequestFinalPayment(item: RequirementItem) {
  // 无担保模式（self_managed）完成无需合同已签；仅担保模式需要双方已签合同
  const contractSigned = isSelfManagedRequirement(item) || isRequirementContractSigned(item)
  return (
    hasBoundResource(item) &&
    item.status === 'in_development' &&
    publishedVersionCount(item) > 0 &&
    contractSigned
  )
}

function requirementFinalActionLabel(item: RequirementItem) {
  return isSelfManagedRequirement(item) ? '确认完成' : '支付尾款'
}

function canResubmit(status: RequirementStatus) {
  return status === 'rejected'
}

function canCancel(item: RequirementItem) {
  // 与后端一致：无活跃接单（开发者还没接单）且处于可取消状态；
  // 已产生资金/违约记录的会转为「已取消」终态。
  return (
    !hasBoundResource(item) &&
    (item.status === 'pending_review' ||
      item.status === 'rejected' ||
      item.status === 'pending_deposit')
  )
}

function canRequestUnbindAsCreator(item: RequirementItem) {
  return (
    hasBoundResource(item) &&
    (item.status === 'in_development' ||
      item.status === 'deposit_paid' ||
      item.status === 'pending_deposit') &&
    !item.pending_unbind_request
  )
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
  if (
    breachLoading.value ||
    platformReviewLoading.value ||
    breachDecisionLoading.value ||
    breachCaseLoading.value
  ) {
    return
  }
  breachVisible.value = false
  breachRequirement.value = null
  breachReason.value = ''
  breachCase.value = null
  breachRejectPanel.value = false
  breachDecisionNote.value = ''
}

async function submitPlatformReview() {
  if (!breachCase.value) {
    return
  }
  platformReviewLoading.value = true
  try {
    breachCase.value = await requestAdapayPlatformReview(auth.token, breachCase.value.id)
    showToast('已申请平台介入，案件转客服人工判定', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '申请平台介入失败', 'error')
  } finally {
    platformReviewLoading.value = false
  }
}

function openBreachRejectPanel() {
  breachDecisionNote.value = ''
  breachRejectPanel.value = true
}

function cancelBreachRejectPanel() {
  if (breachDecisionLoading.value) {
    return
  }
  breachRejectPanel.value = false
  breachDecisionNote.value = ''
}

async function submitBreachDecision(decision: AdapayBreachDecisionValue) {
  const current = breachCase.value
  if (!current) {
    return
  }
  breachDecisionLoading.value = true
  try {
    breachCase.value = await submitAdapayBreachDecision(
      auth.token,
      current.id,
      decision,
      decision === 'rejected' ? breachDecisionNote.value.trim() : '',
    )
    breachRejectPanel.value = false
    breachDecisionNote.value = ''
    showToast(
      decision === 'accepted' ? '已接受 AI 判定，等待对方表态' : '已提交不接受，案件转客服人工判定',
      'success',
    )
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交违约案件表态失败', 'error')
  } finally {
    breachDecisionLoading.value = false
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
    breachCase.value = await reportAdapayBreach(auth.token, item.requirement_id, reason)
    showToast('违约申报已提交，平台将先由审核智能体判定责任方', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交违约申报失败', 'error')
  } finally {
    breachLoading.value = false
  }
}

function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}

function isRequirementCompleted(item: RequirementItem) {
  return item.status === 'completed'
}

function canOpenConversation(item: RequirementItem) {
  return hasBoundResource(item) && !isRequirementCompleted(item)
}

function openConversation(item: RequirementItem) {
  conversationRequirement.value = item
  conversationVisible.value = true
}

function signingStatusForRequirement(item: RequirementItem) {
  return contractSigningStatusMap.value[item.requirement_id] ?? null
}

function isRequirementContractSigned(item: RequirementItem) {
  const status = signingStatusForRequirement(item)
  return Boolean(
    status?.party_a_signed &&
      status.party_b_signed,
  )
}

function canOpenContractSign(item: RequirementItem) {
  // 无担保模式（self_managed）不提供合同签署入口
  if (isSelfManagedRequirement(item)) {
    return false
  }
  return Boolean(signingStatusForRequirement(item)?.has_contract)
}

function contractButtonLabel(item: RequirementItem) {
  const status = signingStatusForRequirement(item)
  return status?.party_a_signed ? '查看合同' : '签署合同'
}

function contractStatusHint(item: RequirementItem) {
  // 无担保模式（self_managed）不需要合同，不显示合同状态提示
  if (isSelfManagedRequirement(item)) {
    return ''
  }
  const status = signingStatusForRequirement(item)
  if (!status?.has_contract) return ''
  if (status.party_a_signed && status.party_b_signed) return '合同已签署，可支付定金'
  if (status.party_a_signed) return '等待开发者签署合同，双方签完后可支付定金'
  if (status.party_b_signed) return '待您签署合同，签完后可支付定金'
  return '客户和开发者均可进入双方合同签署'
}

function openContractSign(item: RequirementItem) {
  router.push({
    name: 'contract-sign',
    query: { requirement_id: item.requirement_id, from: 'user' },
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
 * 担保模式下，开发者接单后合同不再自动生成，需由需求方或开发者主动发起。
 */
function canCreateRequirementContract(item: RequirementItem) {
  if (isSelfManagedRequirement(item)) {
    return false
  }
  if (!hasBoundResource(item)) {
    return false
  }
  if (item.status !== 'pending_deposit' && item.status !== 'deposit_paid') {
    return false
  }
  return !signingStatusForRequirement(item)?.has_contract
}

async function createRequirementContractAction(item: RequirementItem) {
  if (!auth.isAuthed || !auth.token) {
    showToast('请先登录后再继续操作', 'error')
    return
  }
  contractCreatingId.value = item.requirement_id
  try {
    await createRequirementContract(auth.token, item.requirement_id)
    showToast('合同已发起，请完成签署', 'success')
    await loadContractSigningStatuses(myRequirements.value)
    openContractSign(item)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发起合同失败', 'error')
  } finally {
    contractCreatingId.value = ''
  }
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

function conversationButtonLabel(item: RequirementItem) {
  return conversationForRequirement(item)?.last_message_at ? '查看沟通' : '沟通'
}

async function loadRequirementConversations() {
  if (!auth.token.trim()) {
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

function currentResourceVisibility(item: RequirementItem): RequirementResourceVisibility | null {
  return item.resource_visibility ?? null
}

function canToggleRequirementResourceVisibility(item: RequirementItem) {
  return hasBoundResource(item) && item.status === 'completed'
}

function hasPendingResourceVersionDeleteReview(item: RequirementItem) {
  return hasBoundResource(item) && pendingResourceVersionDeleteRequests(item).length > 0
}

function pendingResourceVersionDeleteRequests(item: RequirementItem) {
  return item.pending_resource_version_delete_requests ?? []
}

function pendingResourceVersionLabel(item?: RequirementPendingResourceVersionDeleteRequest | null) {
  return item?.version?.trim() || '未命名版本'
}

function pendingResourceVersionTitle(item?: RequirementPendingResourceVersionDeleteRequest | null) {
  return `版本号 ${pendingResourceVersionLabel(item)}`
}

function resourceVersionDeleteReviewHint(item: RequirementItem) {
  if (hasPendingResourceVersionDeleteReview(item)) {
    return `开发者申请删除 ${pendingResourceVersionDeleteRequests(item).length} 个版本，点击当前需求行后可逐个审核。`
  }

  if (
    item.resource_version_delete_request_status === 'rejected' &&
    item.resource_version_delete_review_note
  ) {
    return `你上次拒绝删除版本：${item.resource_version_delete_review_note}`
  }

  return ''
}

function formatResourceVisibility(item: RequirementItem) {
  return currentResourceVisibility(item) === 'public' ? '资源已公开' : '资源私有中'
}

function requirementSubscriptionLabel(item: RequirementItem) {
  return item.subscribe_status_change ? '取消订阅动态' : '订阅状态'
}

function nextResourceVisibility(item: RequirementItem): RequirementResourceVisibility {
  return currentResourceVisibility(item) === 'public' ? 'private' : 'public'
}

function toggleResourceVisibilityLabel(item: RequirementItem) {
  return nextResourceVisibility(item) === 'public' ? '设为公开' : '设为私有'
}

function isRejectingVersion(request: RequirementPendingResourceVersionDeleteRequest) {
  return versionDeleteRejectTargetId.value === request.version_id
}

function openRejectVersion(request: RequirementPendingResourceVersionDeleteRequest) {
  versionDeleteRejectTargetId.value = request.version_id
  versionDeleteRejectNotes.value = {
    ...versionDeleteRejectNotes.value,
    [request.version_id]: versionDeleteRejectNotes.value[request.version_id] ?? '',
  }
}

function cancelRejectVersion() {
  if (resourceVersionDeleteReviewLoadingId.value) {
    return
  }

  versionDeleteRejectTargetId.value = null
}

function pendingVersionRejectNote(request: RequirementPendingResourceVersionDeleteRequest) {
  return versionDeleteRejectNotes.value[request.version_id] ?? ''
}

function formatPendingVersionRequestedAt(item: RequirementPendingResourceVersionDeleteRequest) {
  return item.requested_at?.trim() || '时间未知'
}

function openPayModal(item: RequirementItem) {
  if (!canPay(item.status, item)) {
    return
  }
  openRequirementDetail(item)
  payRequirement.value = item
  payChannel.value = 'alipay'
  currentPayment.value = null
  payVisible.value = true
}

function updatePayChannel(channel: AdapayBusinessPayChannel) {
  if (payChannel.value === channel) {
    return
  }
  payChannel.value = channel
  currentPayment.value = null
}

function openRequirementDetail(item: RequirementItem) {
  detailRequirement.value = item
  if (routeRequirementViewId() !== item.requirement_id) {
    void router.replace({ query: { ...route.query, view: item.requirement_id } })
  }
}

function closeRequirementDetail() {
  closePayModal()
  detailRequirement.value = null
  if (routeRequirementViewId()) {
    const nextQuery = { ...route.query }
    delete nextQuery.view
    void router.replace({ query: nextQuery })
  }
}

function routeRequirementViewId() {
  const value = route.query.view
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

function syncRouteRequirementDetail() {
  const requirementId = routeRequirementViewId()
  if (!requirementId) {
    detailRequirement.value = null
    return
  }

  const target = myRequirements.value.find((item) => item.requirement_id === requirementId)
  if (target) {
    detailRequirement.value = target
    if (payRequirement.value && payRequirement.value.requirement_id !== target.requirement_id) {
      closePayModal()
    }
  }
}

async function requestFinalPayment(item: RequirementItem) {
  if (!auth.isAuthed) {
    showToast('请先登录后再继续操作', 'error')
    return
  }

  if (!hasBoundResource(item)) {
    showToast('当前需求尚未关联资源项目', 'warning')
    return
  }

  if (item.status !== 'in_development') {
    showToast(
      isSelfManagedRequirement(item)
        ? '只有开发中的需求单才能确认完成'
        : '只有开发中的需求单才能结束开发并支付尾款',
      'warning',
    )
    return
  }

  if (publishedVersionCount(item) <= 0) {
    showToast(
      isSelfManagedRequirement(item)
        ? '开发者至少发布一个资源版本后，才能确认完成'
        : '开发者至少发布一个资源版本后，才能结束开发并支付尾款',
      'warning',
    )
    return
  }

  finalPaymentConfirmTarget.value = item
  finalPaymentConfirmVisible.value = true
}

function closeFinalPaymentConfirm() {
  finalPaymentConfirmVisible.value = false
  finalPaymentConfirmTarget.value = null
}

function hasPendingUnbindRequest(item: RequirementItem) {
  return item.pending_unbind_request?.status === 'pending'
}

function hasPendingDeveloperUnbindRequest(item: RequirementItem) {
  return (
    item.pending_unbind_request?.status === 'pending' &&
    item.pending_unbind_request.initiator === 'developer'
  )
}

function openUnbindRespond(item: RequirementItem) {
  if (!hasPendingDeveloperUnbindRequest(item)) {
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
    await respondUnbindRequirementApi(auth.token, item.requirement_id, action)
    showToast(action === 'approve' ? '已同意解除，需求已重新挂回大厅' : '已拒绝解除申请', 'success')
    unbindRespondVisible.value = false
    unbindRespondRequirement.value = null
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '处理解除申请失败', 'error')
  } finally {
    unbindRespondLoading.value = false
  }
}

function openUnbindRequest(item: RequirementItem) {
  if (!canRequestUnbindAsCreator(item)) {
    return
  }
  unbindRequestRequirement.value = item
  unbindRequestReason.value = ''
  unbindRequestVisible.value = true
}

function closeUnbindRequest() {
  if (unbindRequestLoading.value) {
    return
  }
  unbindRequestVisible.value = false
  unbindRequestRequirement.value = null
  unbindRequestReason.value = ''
}

async function submitUnbindRequest() {
  const item = unbindRequestRequirement.value
  if (!item) {
    return
  }

  const reason = unbindRequestReason.value.trim()
  if (!reason) {
    showToast('请填写解除绑定的原因', 'warning')
    return
  }

  unbindRequestLoading.value = true
  try {
    await requestUnbindRequirementApi(auth.token, item.requirement_id, reason)
    showToast('解除申请已提交，等待开发者确认', 'success')
    unbindRequestVisible.value = false
    unbindRequestRequirement.value = null
    unbindRequestReason.value = ''
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交解除申请失败', 'error')
  } finally {
    unbindRequestLoading.value = false
  }
}

function openCancelConfirm(item: RequirementItem) {
  if (!canCancel(item)) {
    return
  }
  cancelConfirmTarget.value = item
  cancelConfirmVisible.value = true
}

function closeCancelConfirm() {
  if (cancelLoading.value) {
    return
  }
  cancelConfirmVisible.value = false
  cancelConfirmTarget.value = null
}

async function submitCancelRequirement() {
  const item = cancelConfirmTarget.value
  if (!item) {
    return
  }

  cancelLoading.value = true
  try {
    await cancelRequirementApi(auth.token, item.requirement_id)
    showToast('需求已取消', 'success')
    cancelConfirmVisible.value = false
    cancelConfirmTarget.value = null
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '取消需求失败', 'error')
  } finally {
    cancelLoading.value = false
  }
}

async function confirmFinalPaymentRequest() {
  if (!finalPaymentConfirmTarget.value) {
    return
  }

  const item = finalPaymentConfirmTarget.value

  try {
    const updated = await requestRequirementFinalPaymentApi(auth.token, item.requirement_id)
    await loadMyRequirements()
    if (isSelfManagedRequirement(item)) {
      showToast('需求已确认完成', 'success')
    } else {
      showToast('请支付尾款', 'success')
      openPayModal(updated)
    }
    closeFinalPaymentConfirm()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '结束开发失败', 'error')
  }
}

function canComment(status: RequirementStatus) {
  return status === 'completed'
}

function openCommentModal(item: RequirementItem) {
  if (!canComment(item.status)) {
    return
  }
  commentRequirement.value = item
  commentRating.value = item.comment_rating ?? 5
  commentText.value = item.comment_text ?? ''
  commentVisible.value = true
}

function openRequirementEditModal(item: RequirementItem) {
  if (!canResubmit(item.status)) {
    return
  }

  editRequirement.value = item
  editTitle.value = item.title
  editDescription.value = item.description ?? ''
  editBudget.value = item.budget ?? ''
  editAcceptance.value = item.acceptance_criteria ?? ''
  editPaymentMode.value = item.payment_mode
  editVisible.value = true
}

function publishRedirectTarget() {
  return router.resolve({
    name: 'workbench-requirements',
    query: { ...route.query, modal: 'publish' },
  }).fullPath
}

function openAuthLogin() {
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: publishRedirectTarget(),
    },
  })
}

async function ensurePublishRealnameApproved() {
  const redirectTarget = publishRedirectTarget()
  auth.hydrate()
  if (!auth.isAuthed) {
    showToast('发布需求前请先登录', 'info')
    openAuthLogin()
    return false
  }

  try {
    const record = await getMyRealnameVerification(auth.token)
    if (record.status === 'approved') {
      return true
    }

    if (record.status === 'pending') {
      showToast('实名认证审核中，通过后可发布需求', 'warning')
      return false
    }

    showToast('实名认证未通过，请重新提交后再发布需求', 'warning')
    void router.push({
      name: 'workbench-realname',
      query: { redirect_to: redirectTarget },
    })
    return false
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      showToast('发布需求前请先完成实名认证', 'warning')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: redirectTarget },
      })
      return false
    }

    showToast(err instanceof Error ? err.message : '实名认证状态校验失败', 'error')
    return false
  }
}

function resetPublishForm() {
  publishTitle.value = ''
  publishDescription.value = ''
  publishBudget.value = ''
  publishAcceptance.value = ''
  publishPaymentMode.value = 'self_managed'
}

async function openPublishModal() {
  const approved = await ensurePublishRealnameApproved()
  if (!approved) {
    return
  }

  resetPublishForm()
  publishVisible.value = true
}

function closePayModal() {
  payVisible.value = false
}

function closeCommentModal() {
  commentVisible.value = false
}

function forceClosePublishModal() {
  publishVisible.value = false
  resetPublishForm()
}

function clearPublishModalQuery() {
  if (route.query.modal !== 'publish') {
    return
  }

  const nextQuery = { ...route.query }
  delete nextQuery.modal
  void router.replace({ query: nextQuery })
}

function forceCloseEditModal() {
  editVisible.value = false
  editRequirement.value = null
  editPaymentMode.value = 'self_managed'
}

function closeEditModal() {
  if (editLoading.value) {
    return
  }
  forceCloseEditModal()
}

function closePublishModal() {
  if (publishLoading.value) {
    return
  }

  forceClosePublishModal()
  clearPublishModalQuery()
}

async function toggleRequirementResourceVisibility(item: RequirementItem) {
  if (!auth.isAuthed || !hasBoundResource(item)) {
    return
  }

  if (!canToggleRequirementResourceVisibility(item)) {
    showToast(
      isSelfManagedRequirement(item)
        ? '需求完成后才能设置资源为公开或私有'
        : '需求必须在已付尾款后，才能设置资源为公开或私有',
      'warning',
    )
    return
  }

  const visibility = nextResourceVisibility(item)
  resourceVisibilityLoadingId.value = item.requirement_id
  try {
    await updateRequirementResourceVisibilityApi(auth.token, item.requirement_id, { visibility })
    showToast(visibility === 'public' ? '关联资源已设为公开' : '关联资源已设为私有', 'success')
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新资源可见性失败', 'error')
  } finally {
    resourceVisibilityLoadingId.value = null
  }
}

async function toggleRequirementSubscription(item: RequirementItem) {
  if (!auth.isAuthed) {
    showToast('请先登录后再设置需求订阅', 'error')
    return
  }

  requirementSubscriptionLoadingId.value = item.requirement_id
  const nextValue = !item.subscribe_status_change

  try {
    await updateRequirementSubscriptionApi(auth.token, item.requirement_id, {
      subscribe_status_change: nextValue,
    })
    item.subscribe_status_change = nextValue
    showToast(nextValue ? '已订阅该需求的状态变化' : '已取消该需求的状态变化订阅', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新需求订阅失败', 'error')
  } finally {
    requirementSubscriptionLoadingId.value = null
  }
}

async function submitVersionDeleteReview(
  item: RequirementItem,
  request: RequirementPendingResourceVersionDeleteRequest,
  action: 'approve' | 'reject',
) {
  if (!auth.isAuthed || !hasPendingResourceVersionDeleteReview(item)) {
    return
  }

  const note = pendingVersionRejectNote(request).trim()

  if (action === 'reject' && note.length > 500) {
    showToast('拒绝原因不能超过 500 字', 'error')
    return
  }

  resourceVersionDeleteReviewLoadingId.value = item.requirement_id
  try {
    await reviewRequirementResourceDeleteApi(auth.token, item.requirement_id, {
      version_id: request.version_id,
      action,
      note: note || undefined,
    })
    showToast(action === 'approve' ? '已同意删除版本' : '已拒绝删除版本', 'success')
    versionDeleteRejectTargetId.value = null
    if (action === 'reject') {
      const nextNotes = { ...versionDeleteRejectNotes.value }
      delete nextNotes[request.version_id]
      versionDeleteRejectNotes.value = nextNotes
    }
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '审核版本删除失败', 'error')
  } finally {
    resourceVersionDeleteReviewLoadingId.value = null
  }
}

async function submitRequirementComment() {
  if (!auth.isAuthed || !commentRequirement.value) {
    showToast('请先登录后再发表评论', 'error')
    return
  }

  if (commentRating.value < 1 || commentRating.value > 5) {
    showToast('请为已完成需求打分，范围 1 到 5 分', 'error')
    return
  }

  if (commentText.value.trim().length > 200) {
    showToast('评论字数不能超过 200 字', 'error')
    return
  }

  commentLoading.value = true
  try {
    await commentRequirementApi(auth.token, commentRequirement.value.requirement_id, {
      rating: commentRating.value,
      comment: commentText.value.trim(),
    })
    showToast('评论提交成功', 'success')
    commentVisible.value = false
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '评论提交失败', 'error')
  } finally {
    commentLoading.value = false
  }
}

async function submitRequirementResubmit() {
  if (!auth.isAuthed || !editRequirement.value) {
    showToast('请先登录后再重新提交需求', 'error')
    return
  }

  const normalizedTitle = editTitle.value.trim()
  const descriptionValidation = validateRequirementRichText(editDescription.value, '需求描述', {
    minTextLength: 10,
  })
  const acceptanceValidation = validateRequirementRichText(editAcceptance.value, '验收标准', {
    required: true,
  })
  const budgetRaw = String(editBudget.value ?? '').trim()

  if (normalizedTitle.length < 4) {
    showToast('需求标题至少 4 个字符', 'error')
    return
  }

  if (descriptionValidation.error) {
    showToast(descriptionValidation.error, 'error')
    return
  }

  if (!budgetRaw) {
    showToast('预算不能为空', 'error')
    return
  }

  const budget = Number(budgetRaw)

  if (Number.isNaN(budget) || budget < 0) {
    showToast('预算必须是大于等于0的数字', 'error')
    return
  }

  if (acceptanceValidation.error) {
    showToast(acceptanceValidation.error, 'error')
    return
  }

  editLoading.value = true
  try {
    await resubmitRequirementApi(auth.token, editRequirement.value.requirement_id, {
      title: normalizedTitle,
      description: descriptionValidation.value,
      budget,
      acceptance_criteria: acceptanceValidation.value,
      payment_mode: editPaymentMode.value,
    })

    showToast('需求已重新提交，等待审核', 'success')
    editModalRef.value?.clearDraft(`edit-${editRequirement.value.requirement_id}`)
    forceCloseEditModal()
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '重新提交失败', 'error')
  } finally {
    editLoading.value = false
  }
}

async function submitRequirementPublish() {
  const approved = await ensurePublishRealnameApproved()
  if (!approved) {
    return
  }

  const normalizedTitle = publishTitle.value.trim()
  const descriptionValidation = validateRequirementRichText(publishDescription.value, '需求描述', {
    minTextLength: 10,
  })
  const acceptanceValidation = validateRequirementRichText(publishAcceptance.value, '验收标准', {
    required: true,
  })
  const budgetRaw = String(publishBudget.value ?? '').trim()

  if (normalizedTitle.length < 4) {
    showToast('需求标题至少 4 个字符', 'error')
    return
  }

  if (descriptionValidation.error) {
    showToast(descriptionValidation.error, 'error')
    return
  }

  if (!budgetRaw) {
    showToast('预算不能为空', 'error')
    return
  }

  const budget = Number(budgetRaw)

  if (!Number.isFinite(budget) || budget < 0) {
    showToast('预算必须是大于等于0的数字', 'error')
    return
  }

  if (acceptanceValidation.error) {
    showToast(acceptanceValidation.error, 'error')
    return
  }

  publishLoading.value = true
  try {
    await createRequirementApi(auth.token, {
      title: normalizedTitle,
      description: descriptionValidation.value,
      budget,
      acceptance_criteria: acceptanceValidation.value,
      payment_mode: publishPaymentMode.value,
    })

    showToast('需求已发布，等待审核', 'success')
    forceClosePublishModal()
    clearPublishModalQuery()
    publishModalRef.value?.clearDraft()
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发布失败', 'error')
  } finally {
    publishLoading.value = false
  }
}

function finalDepositAmount(item: RequirementItem) {
  return calculateFinalDepositAmount(item, depositRatioPercent.value)
}

function finalPaymentAmount(item: RequirementItem) {
  return calculateFinalPaymentAmount(item, depositRatioPercent.value)
}

const isFinalPayment = computed(() => payRequirement.value?.status === 'pending_final')
const payStageLabel = computed(() => (isFinalPayment.value ? '尾款' : '定金'))
const payChannelLabel = computed(() => {
  switch (payChannel.value) {
    case 'wechat':
      return '微信'
    case 'union':
      return '云闪付'
    default:
      return '支付宝'
  }
})

const finalPaymentConfirmTitle = computed(() =>
  finalPaymentConfirmTarget.value && isSelfManagedRequirement(finalPaymentConfirmTarget.value)
    ? '确认交付完成'
    : '确认进入尾款支付',
)
const finalPaymentConfirmTip = computed(() =>
  finalPaymentConfirmTarget.value && isSelfManagedRequirement(finalPaymentConfirmTarget.value)
    ? '确认后，当前需求会直接进入已完成状态，后续可继续评价。'
    : '确认后会将当前需求推进到待付尾款，并立即进入支付流程。',
)
const finalPaymentConfirmButton = computed(() =>
  finalPaymentConfirmTarget.value && isSelfManagedRequirement(finalPaymentConfirmTarget.value)
    ? '确认完成'
    : '确认进入尾款支付',
)

const payAmount = computed(() => {
  if (!payRequirement.value) {
    return 0.01
  }
  if (payRequirement.value.status === 'pending_final') {
    return finalPaymentAmount(payRequirement.value)
  }
  return finalDepositAmount(payRequirement.value)
})

async function loadDepositRatio() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  try {
    const payload = await getDepositRatio(auth.token)

    if (!payload) {
      return
    }

    if (Number.isFinite(payload.deposit_ratio_percent)) {
      depositRatioPercent.value = payload.deposit_ratio_percent
    }
  } catch {
    // Keep the default deposit ratio when settings API is unavailable.
  }
}

async function loadMyRequirements() {
  auth.hydrate()
  if (!auth.isAuthed) {
    myRequirements.value = []
    return
  }

  requirementLoading.value = true
  try {
    const rows = await listRequirements(auth.token)
    myRequirements.value = rows.slice(0, 20)
    syncRouteRequirementDetail()
    await loadContractSigningStatuses(myRequirements.value)
    await loadResourceVersions(myRequirements.value)
    if (
      expandedVersionDeleteReviewRequirementId.value &&
      !myRequirements.value.some(
        (item) =>
          item.requirement_id === expandedVersionDeleteReviewRequirementId.value &&
          hasPendingResourceVersionDeleteReview(item),
      )
    ) {
      closeVersionDeleteReviewCard()
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载需求单失败', 'error')
  } finally {
    requirementLoading.value = false
  }
}

async function loadResourceVersions(items: RequirementItem[]) {
  auth.hydrate()
  if (!auth.token) {
    resourceVersionsMap.value = {}
    return
  }

  const boundItems = items.filter((item) => item.bound_resource_id != null)
  const entries = await Promise.allSettled(
    boundItems.map(async (item) => ({
      requirementId: item.requirement_id,
      versions: await listPublicMcResourceVersions(item.bound_resource_id as number, auth.token),
    })),
  )
  const map: Record<string, PublicMcResourceVersionItem[]> = {}
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      map[entry.value.requirementId] = entry.value.versions
    }
  }
  resourceVersionsMap.value = map
}

async function refreshMyRequirements() {
  if (requirementLoading.value || conversationLoading.value) {
    return
  }

  await Promise.all([loadMyRequirements(), loadRequirementConversations(), loadDepositRatio()])
}

async function loadContractSigningStatuses(items: RequirementItem[]) {
  if (!auth.token || items.length === 0) {
    contractSigningStatusMap.value = {}
    return
  }

  // 无担保模式（self_managed）不需要合同，无需查询合同签署状态
  const guaranteedItems = items.filter((item) => item.payment_mode !== 'self_managed')

  const entries = await Promise.allSettled(
    guaranteedItems.map((item) =>
      fetchContractSigningStatus(auth.token, item.requirement_id).then((status) => ({
        requirementId: item.requirement_id,
        status,
      })),
    ),
  )
  const map: Record<string, ContractSigningStatus | null> = {}
  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      map[entry.value.requirementId] = entry.value.status
    }
  }
  contractSigningStatusMap.value = map
}

async function submitRequirementPayment() {
  if (!payRequirement.value) {
    return
  }

  const requirement = payRequirement.value
  const channel = payChannel.value
  const clientPlatform = getAdapayClientPlatform()
  if (!isAdapayRequirement(requirement)) {
    showToast('无担保订单不通过平台收款，请由双方按约定自行结算', 'warning')
    return
  }

  payLoading.value = true
  try {
    if (!currentPayment.value) {
      const adapayPayment: AdapayPaymentResponse = await createAdapayPayment(
        auth.token,
        requirement.requirement_id,
        requirement.status === 'pending_final' ? 'final' : 'deposit',
        channel,
        clientPlatform,
      )
      currentPayment.value = {
        payment_id: adapayPayment.paymentId,
        requirement_id: adapayPayment.requirementId,
        channel,
        amount_cny: Number(adapayPayment.amountCny),
        status: adapayPayment.status,
        alipay_order_string: adapayPayment.payUrl ?? '',
        expires_at: '',
        adapay: true,
      }
      showToast(`${payStageLabel.value}支付订单已生成，正在跳转支付页`, 'success')
      router.push({
        name: 'payment',
        query: buildAdapayPaymentQuery({
          paymentId: currentPayment.value.payment_id,
          requirementId: adapayPayment.requirementId,
          channel,
          clientPlatform,
          amountCny: adapayPayment.amountCny,
          qrContent: adapayPayment.payUrl,
        }),
      })
      return
    }

    if (currentPayment.value.adapay) {
      const adapayPayment = await getAdapayPayment(auth.token, currentPayment.value.payment_id)
      if (adapayPayment.status !== 'paid' && adapayPayment.status !== 'confirmed') {
        if (adapayPayment.status === 'failed') {
          currentPayment.value = null
          showToast('上次支付订单已失效，重新发起支付', 'warning')
          void submitRequirementPayment()
          return
        }
        showToast('支付尚未完成，请先完成 Adapay 支付', 'warning')
        return
      }
      showToast(`${payStageLabel.value}支付确认成功`, 'success')
      currentPayment.value = null
      payVisible.value = false
      await loadMyRequirements()
      return
    }

    throw new Error('支付订单状态无效，请重新发起 Adapay 支付')
  } catch (err) {
    if (isWechatPaymentAuthorizationRequired(err)) {
      // 尚未绑定 open_id：直接跳转到支付页（意图模式），由支付页在微信内自动静默授权并下单。
      if (!payRequirement.value) {
        return
      }
      router.push({
        name: 'payment',
        query: buildAdapayPaymentQuery({
          requirementId: payRequirement.value.requirement_id,
          milestone: isFinalPayment.value ? 'final' : 'deposit',
          channel: 'wechat',
          clientPlatform,
          amountCny: payAmount.value,
          intent: true,
        }),
      })
      return
    }
    if (isUnionPaymentAuthorizationRequired(err)) {
      if (clientPlatform !== 'mobile') {
        showToast('云闪付授权仅适用于移动端，请重新选择支付方式', 'warning')
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
        showToast(
          authorizationError instanceof Error ? authorizationError.message : '发起云闪付授权失败',
          'error',
        )
        return
      }
    }

    showToast(err instanceof Error ? err.message : '支付失败', 'error')
  } finally {
    payLoading.value = false
  }
}

function closeWechatAuthorization() {
  wechatAuthorizationVisible.value = false
  wechatAuthorizationUrl.value = ''
}

function handleWechatAuthorized() {
  closeWechatAuthorization()
  showToast('微信授权成功，请再次点击支付', 'success')
}

function handleRequirementAction(item: RequirementItem) {
  if (hasPendingDeveloperUnbindRequest(item)) {
    openUnbindRespond(item)
    return
  }

  if (hasPendingResourceVersionDeleteReview(item)) {
    toggleVersionDeleteReviewCard(item)
    return
  }

  if (canPay(item.status, item)) {
    openPayModal(item)
  } else if (canResubmit(item.status)) {
    openRequirementEditModal(item)
  } else if (canComment(item.status)) {
    openCommentModal(item)
  }
}

function isVersionDeleteReviewExpanded(item: RequirementItem) {
  return expandedVersionDeleteReviewRequirementId.value === item.requirement_id
}

function toggleVersionDeleteReviewCard(item: RequirementItem) {
  if (!hasPendingResourceVersionDeleteReview(item)) {
    return
  }

  if (isVersionDeleteReviewExpanded(item)) {
    closeVersionDeleteReviewCard()
    return
  }

  expandedVersionDeleteReviewRequirementId.value = item.requirement_id
  versionDeleteRejectTargetId.value = null
}

function closeVersionDeleteReviewCard() {
  if (resourceVersionDeleteReviewLoadingId.value) {
    return
  }

  expandedVersionDeleteReviewRequirementId.value = null
  versionDeleteRejectTargetId.value = null
}

function starFill(index: number) {
  const rating = commentRating.value
  if (rating >= index) {
    return 100
  }
  if (rating >= index - 0.5) {
    return 50
  }
  return 0
}

function starClass(index: number) {
  const fill = starFill(index)
  return fill === 100 ? 'full' : fill === 50 ? 'half' : ''
}

function setRating(event: MouseEvent, index: number) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickedInLeftHalf = event.clientX - rect.left < rect.width / 2
  commentRating.value = clickedInLeftHalf ? index - 0.5 : index
}

onMounted(async () => {
  auth.hydrate()
  await Promise.all([loadMyRequirements(), loadRequirementConversations(), loadDepositRatio()])

  const oauthResult = typeof route.query.wechat_oauth === 'string' ? route.query.wechat_oauth : ''
  const oauthError =
    typeof route.query.wechat_oauth_error === 'string' ? route.query.wechat_oauth_error : ''
  const unionOauthResult = typeof route.query.union_oauth === 'string' ? route.query.union_oauth : ''
  const unionOauthError =
    typeof route.query.union_oauth_error === 'string' ? route.query.union_oauth_error : ''
  if (oauthResult === 'success') {
    showToast('微信授权成功，请再次点击支付', 'success')
  } else if (oauthError) {
    showToast(`微信授权失败：${oauthError}`, 'error')
  }
  if (unionOauthResult === 'success') {
    payChannel.value = 'union'
    showToast('云闪付授权成功，请再次点击支付', 'success')
  } else if (unionOauthError) {
    showToast(`云闪付授权失败：${unionOauthError}`, 'error')
  }
  if (oauthResult || oauthError || unionOauthResult || unionOauthError) {
    const nextQuery = { ...route.query }
    delete nextQuery.wechat_oauth
    delete nextQuery.wechat_oauth_error
    delete nextQuery.union_oauth
    delete nextQuery.union_oauth_error
    void router.replace({ query: nextQuery })
  }
})

watch(
  () => route.query.modal,
  (value) => {
    syncPublishModalFromRoute(value)
  },
  { immediate: true },
)

watch(
  () => route.query.view,
  () => {
    syncRouteRequirementDetail()
  },
)
</script>

<template>
  <main class="page-shell custom-page-shell profile-page my-requirements-page">
    <section class="wallet-section my-requirements-summary">
      <div class="my-requirements-summary__grid">
        <article>
          <span>全部需求</span>
          <strong>{{ requirementStats.total }}</strong>
        </article>
        <article>
          <span>待审核/付定金</span>
          <strong>{{ requirementStats.pending }}</strong>
        </article>
        <article>
          <span>开发中/付尾款</span>
          <strong>{{ requirementStats.active }}</strong>
        </article>
        <article>
          <span>可评价/已完成</span>
          <strong>{{ requirementStats.completed }}</strong>
        </article>
      </div>
    </section>

    <section class="wallet-section">
      <div class="wallet-header">
        <div>
          <h3 class="portal-page__eyebrow">需求列表</h3>
        </div>
        <div class="my-requirements-header__actions">
          <button class="ghost small my-requirements-refresh" type="button"
            :disabled="requirementLoading || conversationLoading" @click="refreshMyRequirements">
            <el-icon>
              <Refresh />
            </el-icon>
            <span>{{ requirementLoading || conversationLoading ? '刷新中...' : '刷新' }}</span>
          </button>
          <button class="ghost small" type="button" @click="openPublishModal">发布新需求</button>
        </div>
      </div>

      <div v-if="myRequirements.length === 0" class="empty">
        {{ requirementLoading ? '需求单加载中...' : '你还没有提交过需求单，点击右上角「发布新需求」即可创建你的第一个需求。' }}
      </div>
      <ul v-else class="requirement-list">
        <template v-for="item in myRequirements" :key="item.requirement_id">
          <li class="requirement-row" :class="{
            clickable:
              hasPendingDeveloperUnbindRequest(item) ||
              hasPendingResourceVersionDeleteReview(item) ||
              canPay(item.status, item) ||
              canComment(item.status) ||
              canResubmit(item.status),
            expanded: isVersionDeleteReviewExpanded(item),
          }" @click="handleRequirementAction(item)">
            <div class="requirement-card-body">
              <div class="requirement-main">
                <div class="requirement-title">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.requirement_id }}</span>
                </div>
                <div class="requirement-details">
                <small class="requirement-note">{{ paymentModeLabel(item) }} · {{ paymentModeHint(item) }}</small>
                <small v-if="hasBoundResource(item)" class="requirement-resource-visibility">{{
                  formatResourceVisibility(item)
                  }}</small>
                <small v-if="hasBoundResource(item)" class="requirement-note">交付版本：{{ publishedVersionCount(item) }}
                  版{{ latestDeliveryVersionLabel(item) }}</small>
                <small v-if="contractStatusHint(item)" class="requirement-note">{{
                  contractStatusHint(item)
                  }}</small>
                <small v-if="hasBoundResource(item) && !canToggleRequirementResourceVisibility(item)"
                  class="requirement-note">切换资源公开状态需在{{
                    isSelfManagedRequirement(item) ? '需求完成后' : '已付尾款后'
                  }}开放</small>
                <small v-if="hasPendingResourceVersionDeleteReview(item)" class="requirement-note">
                  <strong>待审核删除版本：</strong>
                  <span class="pending-review-pill">
                    {{ pendingResourceVersionDeleteRequests(item).length }} 个待审核
                  </span>
                  <span class="pending-review-count">共 {{ pendingResourceVersionDeleteRequests(item).length }} 个</span>
                </small>
                <small v-if="hasPendingResourceVersionDeleteReview(item)" class="requirement-note">{{
                  resourceVersionDeleteReviewHint(item)
                  }}</small>
                <small v-if="hasPendingResourceVersionDeleteReview(item)"
                  class="requirement-note">点击当前需求行，可在下方展开审核卡片。</small>
                <small v-else-if="
                  hasBoundResource(item) &&
                  item.resource_version_delete_request_status === 'rejected' &&
                  item.resource_version_delete_review_note
                " class="requirement-note">{{ resourceVersionDeleteReviewHint(item) }}</small>
                <small v-if="
                  item.status === 'in_development' &&
                  hasBoundResource(item) &&
                  publishedVersionCount(item) < 1
                " class="requirement-note">开发者发布至少 1 个版本后，才能{{
                  isSelfManagedRequirement(item) ? '确认完成' : '结束开发并支付尾款'
                  }}</small>
                <small v-if="item.status === 'rejected' && item.review_note" class="requirement-note">驳回原因：{{
                  item.review_note }}</small>
                <small v-if="hasPendingDeveloperUnbindRequest(item)" class="requirement-note">
                  <strong>开发者申请解除绑定：</strong>{{ item.pending_unbind_request?.reason }}
                </small>
                <small v-if="hasPendingDeveloperUnbindRequest(item)" class="requirement-note">
                  点击当前需求行，可同意解除（需求重新挂回大厅）或拒绝解除。
                </small>
                <small v-if="hasPendingUnbindRequest(item) && !hasPendingDeveloperUnbindRequest(item)"
                  class="requirement-note">
                  已提交解除申请，等待开发者确认。
                </small>
                </div>
              </div>
              <aside class="requirement-summary" aria-label="需求摘要">
                <span class="requirement-status" :class="{
                  'requirement-status--contract': isWaitingContractSign(item),
                  'requirement-status--unbind': isUnbinding(item),
                }">
                  {{ formatRequirementDisplayStatus(item) }}
                </span>
                <div class="requirement-budget">
                  <small>预算</small>
                  <strong>{{ formatBudget(item.budget) }}</strong>
                </div>
                <time>
                  <small>更新时间</small>
                  <span>{{ formatRequirementTime(item.updated_at) }}</span>
                </time>
              </aside>
            </div>
            <div class="requirement-actions">
              <button v-if="hasPendingDeveloperUnbindRequest(item)" class="ghost small" type="button"
                @click.stop="openUnbindRespond(item)">
                处理解除申请
              </button>
              <button v-if="canRequestUnbindAsCreator(item)" class="ghost small" type="button"
                @click.stop="openUnbindRequest(item)">
                申请解除
              </button>
              <button class="ghost small" type="button"
                :disabled="requirementSubscriptionLoadingId === item.requirement_id"
                @click.stop="toggleRequirementSubscription(item)">
                {{
                  requirementSubscriptionLoadingId === item.requirement_id
                    ? '提交中...'
                    : requirementSubscriptionLabel(item)
                }}
              </button>
              <button v-if="hasBoundResource(item) && canToggleRequirementResourceVisibility(item)"
                class="ghost small" type="button" :disabled="resourceVisibilityLoadingId === item.requirement_id"
                @click.stop="toggleRequirementResourceVisibility(item)">
                {{
                  resourceVisibilityLoadingId === item.requirement_id
                    ? '提交中...'
                    : toggleResourceVisibilityLabel(item)
                }}
              </button>
              <button v-if="canOpenConversation(item)" class="ghost small" type="button"
                @click.stop="openConversation(item)">
                {{ conversationButtonLabel(item) }}
              </button>
              <button v-if="canCreateRequirementContract(item)" class="ghost small" type="button"
                :disabled="contractCreatingId === item.requirement_id"
                @click.stop="createRequirementContractAction(item)">
                {{ contractCreatingId === item.requirement_id ? '发起中...' : '发起合同' }}
              </button>
              <button v-if="canOpenContractSign(item)" class="ghost small" type="button"
                @click.stop="handleContractButtonClick(item)">
                {{ contractButtonLabel(item) }}
              </button>
              <button v-if="canRequestFinalPayment(item)" class="ghost small" type="button"
                @click.stop="requestFinalPayment(item)">
                {{ isSelfManagedRequirement(item) ? requirementFinalActionLabel(item) : '确认验收并支付尾款' }}
              </button>
              <button v-if="canReportBreach(item)" class="ghost small danger-plain" type="button"
                @click.stop="openBreachReport(item)">
                违约处理
              </button>
              <button v-if="canResubmit(item.status)" class="ghost small" type="button"
                @click.stop="openRequirementEditModal(item)">
                重新编辑
              </button>
              <button v-if="canCancel(item)" class="ghost small" type="button"
                @click.stop="openCancelConfirm(item)">
                取消需求
              </button>
              <button v-else-if="canPay(item.status, item)" class="ghost small" type="button"
                @click.stop="openPayModal(item)">
                支付
              </button>
              <button v-else-if="canComment(item.status)" class="ghost small" type="button"
                @click.stop="openCommentModal(item)">
                去评价
              </button>
            </div>
          </li>

          <li v-if="isVersionDeleteReviewExpanded(item)" class="requirement-review-card-row">
            <section class="requirement-review-card" @click.stop>
              <div class="requirement-review-card__header">
                <div>
                  <h4>版本删除审核</h4>
                  <p>每个待删除版本单独一张卡片，直接在对应卡片上审核。</p>
                </div>
                <button class="ghost small" type="button" @click.stop="closeVersionDeleteReviewCard">
                  收起
                </button>
              </div>
              <div class="requirement-review-card-list">
                <article v-for="request in pendingResourceVersionDeleteRequests(item)" :key="request.version_id"
                  class="requirement-review-item">
                  <div class="requirement-review-item__main">
                    <div>
                      <strong>{{ pendingResourceVersionTitle(request) }}</strong>
                      <p>申请时间：{{ formatPendingVersionRequestedAt(request) }}</p>
                    </div>
                    <div class="requirement-review-item__actions">
                      <button class="ghost small" type="button"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="submitVersionDeleteReview(item, request, 'approve')">
                        {{
                          resourceVersionDeleteReviewLoadingId === item.requirement_id
                            ? '处理中...'
                            : '同意删除'
                        }}
                      </button>
                      <button class="ghost small" type="button" :class="{ active: isRejectingVersion(request) }"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="openRejectVersion(request)">
                        拒绝删除
                      </button>
                    </div>
                  </div>
                  <p class="requirement-review-card__hint danger">
                    同意后该版本文件会被永久删除，且无法恢复。
                  </p>
                  <div v-if="isRejectingVersion(request)" class="requirement-review-item__reject-panel">
                    <label class="requirement-review-card__field requirement-review-card__field--stacked">
                      <span>拒绝原因</span>
                      <textarea v-model="versionDeleteRejectNotes[request.version_id]" class="comment-input" rows="4"
                        maxlength="500" placeholder="可选：说明拒绝删除该版本的原因"></textarea>
                      <small class="requirement-note">已输入 {{ pendingVersionRejectNote(request).length }} / 500 字</small>
                    </label>
                    <div class="requirement-review-card__actions">
                      <button class="ghost small" type="button" @click.stop="cancelRejectVersion">
                        取消
                      </button>
                      <button class="ghost small" type="button"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="submitVersionDeleteReview(item, request, 'reject')">
                        {{
                          resourceVersionDeleteReviewLoadingId === item.requirement_id
                            ? '处理中...'
                            : '确认拒绝删除'
                        }}
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </li>
        </template>
      </ul>
    </section>

    <PublishModal ref="publishModalRef" :visible="publishVisible" v-model:publishTitle="publishTitle"
      v-model:publishDescription="publishDescription" v-model:publishBudget="publishBudget"
      v-model:publishAcceptance="publishAcceptance" v-model:publishPaymentMode="publishPaymentMode"
      :publishLoading="publishLoading"
      :draft-scope="auth.isAuthed ? auth.username : 'default'" @close="closePublishModal" @notify="showToast"
      @submit="submitRequirementPublish" />

    <PublishModal ref="editModalRef" :visible="editVisible" modalTitle="重新编辑需求" submitText="重新提交审核"
      loadingText="提交中..." v-model:publishTitle="editTitle" v-model:publishDescription="editDescription"
      v-model:publishBudget="editBudget" v-model:publishAcceptance="editAcceptance"
      v-model:publishPaymentMode="editPaymentMode"
      :publishLoading="editLoading"
      :draft-scope="editRequirement ? `edit-${editRequirement.requirement_id}` : ''" @close="closeEditModal"
      @notify="showToast" @submit="submitRequirementResubmit" />

    <RequirementConversationModal :visible="conversationVisible" :token="auth.token" :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirement_id ?? ''" :title="conversationRequirement?.title"
      @updated="applyConversationDetail" @close="closeConversation" />

    <Teleport to="body">
      <div v-if="detailRequirement" class="my-requirement-detail-wrap" @click.self="closeRequirementDetail">
        <section class="my-requirement-detail" :aria-label="`${detailRequirement.title}详情`">
          <header class="my-requirement-detail__head">
            <div>
              <h3>{{ detailRequirement.title }}</h3>
            </div>
            <button class="my-requirement-detail__close" type="button" aria-label="关闭详情"
              @click="closeRequirementDetail">
              <el-icon>
                <Close />
              </el-icon>
            </button>
          </header>

          <div class="my-requirement-detail__meta">
            <span>编号：{{ detailRequirement.requirement_id }}</span>
            <span>发布方式：{{ paymentModeLabel(detailRequirement) }}</span>
            <span>状态：{{ formatRequirementDisplayStatus(detailRequirement) }}</span>
            <span>创建：{{ formatRequirementCreatedTime(detailRequirement) }}</span>
            <span>更新：{{ formatRequirementTime(detailRequirement.updated_at) }}</span>
            <span v-if="detailRequirement.developer" class="my-requirement-detail__meta--developer">
              开发者：{{ detailRequirement.developer }}
            </span>
          </div>

          <section class="my-requirement-detail__review-panel">
            <div class="my-requirement-detail__review-item">
              <span class="my-requirement-detail__review-label">需求描述</span>
              <article
                class="my-requirement-detail__review-value my-requirement-detail__review-value--multiline my-requirement-detail__rich"
                v-html="detailRequirementDescriptionHtml"></article>
            </div>

            <div class="my-requirement-detail__review-grid">
              <div class="my-requirement-detail__review-item">
                <span class="my-requirement-detail__review-label">预算</span>
                <div class="my-requirement-detail__review-value">
                  {{ formatBudget(detailRequirement.budget) }}
                </div>
              </div>

              <div class="my-requirement-detail__review-item">
                <span class="my-requirement-detail__review-label">验收标准</span>
                <article
                  class="my-requirement-detail__review-value my-requirement-detail__review-value--multiline my-requirement-detail__rich"
                  v-html="detailRequirementAcceptanceHtml"></article>
              </div>
            </div>
          </section>

          <section v-if="hasBoundResource(detailRequirement)" class="my-requirement-detail__review-panel"
            aria-label="交付版本">
            <div class="my-requirement-detail__review-item">
              <span class="my-requirement-detail__review-label">交付版本</span>
              <p v-if="deliveryVersionsFor(detailRequirement).length === 0"
                class="my-requirement-detail__review-value">
                开发者还没有提交交付版本，绑定资源项目发布新版本后会自动出现在这里。
              </p>
              <ul v-else class="my-requirement-detail__version-list">
                <li v-for="version in deliveryVersionsFor(detailRequirement)" :key="version.id">
                  <div class="my-requirement-detail__version-head">
                    <strong>{{ version.version }}</strong>
                    <time>{{ version.created_at }}</time>
                  </div>
                  <p v-if="deliveryVersionNoteText(version.note)" class="my-requirement-detail__version-note">
                    {{ deliveryVersionNoteText(version.note) }}
                  </p>
                  <a class="my-requirement-detail__version-link" :href="deliveryVersionDownloadUrl(version)"
                    target="_blank" rel="noopener noreferrer">下载交付文件</a>
                </li>
              </ul>
            </div>
          </section>

          <section v-if="payVisible && payRequirement" class="my-requirement-detail__payment-panel"
            aria-label="需求支付">
            <div class="my-requirement-detail__payment-head">
              <div>
                <span class="my-requirement-detail__payment-label">支付{{ payStageLabel }}</span>
                <strong>本次应付 {{ formatBudget(payAmount) }}</strong>
              </div>
              <span class="my-requirement-detail__payment-status">
                {{ currentPayment ? '待确认' : '待支付' }}
              </span>
            </div>

            <div class="my-requirement-detail__payment-summary">
              <span v-if="!isFinalPayment">定金占比：{{ depositRatioPercent.toFixed(2) }}%</span>
              <span>支付方式：{{ payChannelLabel }}</span>
            </div>

            <div class="my-requirement-detail__payment-channel">
              <strong>支付方式</strong>
              <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
                <button type="button" class="payment-option"
                  :class="{ active: payChannel === 'alipay', 'payment-option--alipay': payChannel === 'alipay' }"
                  @click="updatePayChannel('alipay')">
                  <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
                  支付宝
                </button>
                <button type="button" class="payment-option"
                  :class="{ active: payChannel === 'wechat', 'payment-option--wechat': payChannel === 'wechat' }"
                  @click="updatePayChannel('wechat')">
                  <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信" />
                  微信
                </button>
              </div>
            </div>
          </section>

          <div class="my-requirement-detail__actions">
            <template v-if="payVisible && payRequirement">
              <button class="my-requirement-detail__secondary" type="button" @click="closePayModal">
                取消支付
              </button>
              <button class="my-requirement-detail__primary" type="button" :disabled="payLoading"
                @click="submitRequirementPayment">
                {{ payLoading ? '处理中...' : currentPayment ? '查询支付结果' : `支付${payStageLabel}` }}
              </button>
            </template>
            <template v-else>
              <button v-if="canPay(detailRequirement.status, detailRequirement)"
                class="my-requirement-detail__primary" type="button"
                @click="openPayModal(detailRequirement)">
                支付{{ detailRequirement.status === 'pending_final' ? '尾款' : '定金' }}
              </button>
              <button class="my-requirement-detail__secondary" type="button" @click="closeRequirementDetail">
                关闭
              </button>
            </template>
          </div>
        </section>
      </div>
    </Teleport>

    <div v-if="finalPaymentConfirmVisible && finalPaymentConfirmTarget" class="modal-wrap"
      @click.self="closeFinalPaymentConfirm">
      <section class="pay-modal" aria-label="尾款确认弹窗">
        <h3>{{ finalPaymentConfirmTitle }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ finalPaymentConfirmTarget.title }}</p>
        <p class="pay-line">
          <strong>需求编号：</strong>{{ finalPaymentConfirmTarget.requirement_id }}
        </p>
        <p class="tip">{{ finalPaymentConfirmTip }}</p>

        <div class="actions">
          <button class="ghost" type="button" @click="closeFinalPaymentConfirm">取消</button>
          <button class="ghost primary" type="button" @click="confirmFinalPaymentRequest">
            {{ finalPaymentConfirmButton }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="unbindRespondVisible && unbindRespondRequirement" class="modal-wrap"
      @click.self="closeUnbindRespond">
      <section class="pay-modal" aria-label="解除绑定申请弹窗">
        <h3>开发者申请解除绑定</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ unbindRespondRequirement.title }}</p>
        <p class="pay-line">
          <strong>需求编号：</strong>{{ unbindRespondRequirement.requirement_id }}
        </p>
        <p class="pay-line">
          <strong>开发者：</strong>{{ unbindRespondRequirement.pending_unbind_request?.developer }}
        </p>
        <p class="pay-line">
          <strong>申请时间：</strong>{{ unbindRespondRequirement.pending_unbind_request?.created_at }}
        </p>
        <p class="pay-line">
          <strong>申请原因：</strong>{{ unbindRespondRequirement.pending_unbind_request?.reason }}
        </p>
        <p class="tip">同意解除后，需求将重新挂回需求大厅，供其他开发者承接；如拒绝，当前绑定关系保持不变。</p>

        <div class="actions">
          <button class="ghost" type="button" :disabled="unbindRespondLoading" @click="closeUnbindRespond">
            取消
          </button>
          <button class="ghost danger-plain" type="button" :disabled="unbindRespondLoading"
            @click="submitUnbindRespond('reject')">
            拒绝解除
          </button>
          <button class="ghost primary" type="button" :disabled="unbindRespondLoading"
            @click="submitUnbindRespond('approve')">
            {{ unbindRespondLoading ? '处理中...' : '同意解除' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="unbindRequestVisible && unbindRequestRequirement" class="modal-wrap"
      @click.self="closeUnbindRequest">
      <section class="pay-modal" aria-label="申请解除绑定弹窗">
        <h3>申请解除绑定</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ unbindRequestRequirement.title }}</p>
        <p class="pay-line">
          <strong>需求编号：</strong>{{ unbindRequestRequirement.requirement_id }}
        </p>
        <label class="pay-line" style="display:flex;flex-direction:column;gap:6px;">
          <strong>解除原因</strong>
          <textarea v-model="unbindRequestReason" rows="4" maxlength="1000"
            placeholder="请说明申请解除绑定的原因，例如：项目安排调整，不再需要继续开发"></textarea>
        </label>
        <p class="tip">解除申请提交后需开发者确认；同意后需求将重新挂回大厅。</p>

        <div class="actions">
          <button class="ghost" type="button" :disabled="unbindRequestLoading" @click="closeUnbindRequest">
            取消
          </button>
          <button class="ghost primary" type="button" :disabled="unbindRequestLoading"
            @click="submitUnbindRequest">
            {{ unbindRequestLoading ? '提交中...' : '提交申请' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="cancelConfirmVisible && cancelConfirmTarget" class="modal-wrap"
      @click.self="closeCancelConfirm">
      <section class="pay-modal" aria-label="取消需求弹窗">
        <h3>取消需求单</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ cancelConfirmTarget.title }}</p>
        <p class="pay-line">
          <strong>需求编号：</strong>{{ cancelConfirmTarget.requirement_id }}
        </p>
        <p class="tip">取消后该需求单将被删除且无法恢复。仅未被开发者接取的需求可以取消。</p>

        <div class="actions">
          <button class="ghost" type="button" :disabled="cancelLoading" @click="closeCancelConfirm">
            返回
          </button>
          <button class="ghost danger" type="button" :disabled="cancelLoading"
            @click="submitCancelRequirement">
            {{ cancelLoading ? '取消中...' : '确认取消' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="breachVisible && breachRequirement" class="modal-wrap" @click.self="closeBreachReport">
      <section class="pay-modal breach-modal" aria-label="违约案件弹窗">
        <h3>{{ breachCase ? '违约案件进展' : '申报履约违约' }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ breachRequirement.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ breachRequirement.requirement_id }}</p>
        <p v-if="breachCaseLoading" class="pay-line">正在加载违约案件…</p>
        <template v-else-if="breachCase">
          <p class="pay-line"><strong>案件编号：</strong>{{ breachCase.caseNo }}</p>
          <p class="pay-line"><strong>当前状态：</strong>{{ BREACH_STATUS_LABELS[breachCase.status] ?? breachCase.status }}</p>
          <p v-if="breachCase.liableParty" class="pay-line">
            <strong>责任认定：</strong>{{ breachLiablePartyLabel(breachCase.liableParty) }}
          </p>
          <p class="pay-line"><strong>申报理由：</strong>{{ breachCase.reason }}</p>
          <template v-if="breachCase.aiJudgedAt || breachCase.aiReasoning">
            <p class="pay-line">
              <strong>AI 判定：</strong>{{ breachCase.aiLiableParty ? breachLiablePartyLabel(breachCase.aiLiableParty) : '无法判定，已转客服人工判定' }}
            </p>
            <p v-if="breachCase.aiJudgedAt" class="pay-line">
              <strong>判定时间：</strong>{{ formatCnDateTime(breachCase.aiJudgedAt) }}
            </p>
            <p v-if="breachCase.aiReasoning" class="pay-line">
              <strong>判定理由：</strong>{{ breachCase.aiReasoning }}
            </p>
          </template>
          <p v-if="breachCase.decisionDeadlineAt" class="pay-line">
            <strong>表态截止：</strong>{{ formatCnDateTime(breachCase.decisionDeadlineAt) }}
          </p>
          <template v-if="showBreachDecisions(breachCase)">
            <p class="pay-line"><strong>我方表态：</strong>{{ breachDecisionText(breachCase.customerDecision) }}</p>
            <p class="pay-line"><strong>对方表态：</strong>{{ breachDecisionText(breachCase.developerDecision) }}</p>
          </template>
          <p class="pay-line">
            <strong>资金处理：</strong>定金 ¥{{ breachCase.depositAmountCny }} · 已退尾款 ¥{{ breachCase.refundAmountCny }} · 赔付 ¥{{ breachCase.compensationAmountCny }}<template v-if="breachCase.extraCompensationFen > 0"> · 额外赔偿 ¥{{ breachCase.extraCompensationCny }}</template>
          </p>
          <p v-if="breachCase.verdictSource" class="pay-line">
            <strong>判定来源：</strong>{{ breachCase.verdictSource === 'ai' ? '双方接受 AI 判定' : '客服人工判定' }}
          </p>
          <p v-if="breachCase.resolutionNote" class="pay-line"><strong>处理说明：</strong>{{ breachCase.resolutionNote }}</p>

          <div v-if="canDecideBreachCase(breachCase)" class="breach-modal__decision">
            <p class="pay-line"><strong>是否接受：</strong>双方都接受 AI 判定后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。</p>
            <label v-if="breachRejectPanel" class="pay-line breach-modal__field">
              <strong>不接受的原因</strong>
              <textarea v-model="breachDecisionNote" rows="3" maxlength="1000"
                placeholder="可选：说明不接受该判定的理由，便于客服人工复核"></textarea>
            </label>
            <div class="actions">
              <template v-if="breachRejectPanel">
                <button class="ghost" type="button" :disabled="breachDecisionLoading" @click="cancelBreachRejectPanel">
                  取消
                </button>
                <button class="ghost danger" type="button" :disabled="breachDecisionLoading"
                  @click="submitBreachDecision('rejected')">
                  {{ breachDecisionLoading ? '提交中...' : '确认不接受' }}
                </button>
              </template>
              <template v-else>
                <button class="ghost danger-plain" type="button" :disabled="breachDecisionLoading"
                  @click="openBreachRejectPanel">
                  不接受
                </button>
                <button class="ghost primary" type="button" :disabled="breachDecisionLoading"
                  @click="submitBreachDecision('accepted')">
                  {{ breachDecisionLoading ? '提交中...' : '接受判定' }}
                </button>
              </template>
            </div>
          </div>

          <p v-else-if="breachCase.status === 'submitted' || breachCase.status === 'ai_reviewing'" class="tip">
            AI 判定完成后由双方各自选择是否接受；双方都接受平台才会执行退款／赔付，协商不成可申请平台介入转客服人工判定。
          </p>
          <div class="actions">
            <button class="ghost" type="button"
              :disabled="platformReviewLoading || breachDecisionLoading" @click="closeBreachReport">关闭</button>
            <button v-if="canRequestPlatformReview(breachCase)" class="ghost primary" type="button"
              :disabled="platformReviewLoading || breachDecisionLoading" @click="submitPlatformReview">
              {{ platformReviewLoading ? '提交中...' : '申请平台介入' }}
            </button>
          </div>
        </template>
        <template v-else>
          <label class="pay-line breach-modal__field">
            <strong>事实与依据</strong>
            <textarea v-model="breachReason" rows="6" maxlength="2000"
              placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实"></textarea>
          </label>
          <p class="tip">平台会核对合同、支付、交付和沟通记录，先由审核智能体依据双方会话判定责任方。</p>
          <div class="actions">
            <button class="ghost" type="button" :disabled="breachLoading" @click="closeBreachReport">取消</button>
            <button class="ghost primary" type="button" :disabled="breachLoading" @click="submitBreachReport">
              {{ breachLoading ? '提交中...' : '提交申报' }}
            </button>
          </div>
        </template>
      </section>
    </div>

    <div v-if="commentVisible && commentRequirement" class="modal-wrap" @click.self="closeCommentModal">
      <section class="pay-modal comment-modal" aria-label="需求评论弹窗">
        <h3>评价需求</h3>
        <div class="comment-modal__meta">
          <p class="pay-line">
            <strong>需求标题</strong><span>{{ commentRequirement.title }}</span>
          </p>
          <p class="pay-line">
            <strong>需求编号</strong><span>{{ commentRequirement.requirement_id }}</span>
          </p>
        </div>
        <div class="comment-modal__section">
          <div class="comment-modal__section-head">
            <strong>评分</strong>
            <span>{{ commentRating.toFixed(1) }} 分</span>
          </div>
          <div class="rating-row">
            <button v-for="star in 5" :key="star" type="button" class="rating-star" :class="starClass(star)"
              @click="setRating($event, star)">
              ★
            </button>
          </div>
        </div>
        <div class="comment-modal__section comment-modal__field">
          <div class="comment-modal__section-head">
            <strong>评论内容</strong>
            <span>已输入 {{ commentText.length }} / 200 字</span>
          </div>
          <textarea class="comment-input" v-model="commentText" rows="4" maxlength="200"
            placeholder="请输入评论，最多 200 字"></textarea>
        </div>

        <div class="actions">
          <button class="ghost" type="button" @click="closeCommentModal">取消</button>
          <button class="ghost primary" type="button" :disabled="commentLoading" @click="submitRequirementComment">
            {{ commentLoading ? '提交中...' : '提交评论' }}
          </button>
        </div>
      </section>
    </div>

    <WechatAuthorizationModal
      :visible="wechatAuthorizationVisible"
      :authorization-url="wechatAuthorizationUrl"
      :token="auth.token"
      @close="closeWechatAuthorization"
      @authorized="handleWechatAuthorized"
    />
  </main>
</template>

<style scoped>
.my-requirements-page {
  gap: 16px;
}

.wallet-header {
  align-items: flex-start;
}

.my-requirements-summary.wallet-section {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.my-requirements-summary__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.my-requirements-summary__grid article {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.06);
}

.my-requirements-summary__grid strong {
  color: #0f172a;
  font-size: 28px;
  line-height: 1;
}

.my-requirements-summary__grid span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.my-requirements-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
}

.my-requirements-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.requirement-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pending-review-pill {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(255, 214, 102, 0.22);
  color: #8a5a00;
  font-weight: 700;
}

.pending-review-count {
  margin-left: 8px;
  color: #7b8798;
}

.my-requirement-detail-wrap {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(5px);
}

.my-requirement-detail {
  width: min(860px, 100%);
  max-height: min(760px, calc(100dvh - 32px));
  overflow-y: auto;
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 28px 72px rgba(15, 23, 42, 0.22);
}

.my-requirement-detail__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.84);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
}

.my-requirement-detail__head h3 {
  margin: 0;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.3;
}

.my-requirement-detail__head p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.my-requirement-detail__chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(191, 219, 254, 0.94);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.92);
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.my-requirement-detail__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 10px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.my-requirement-detail__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 10px;
  padding: 14px 22px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.76);
}

.my-requirement-detail__meta span {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.92);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.my-requirement-detail__meta span.my-requirement-detail__meta--developer {
  background: rgba(236, 253, 245, 0.92);
  border: 1px solid rgba(167, 243, 208, 0.96);
  color: #047857;
}

.my-requirement-detail__review-panel {
  display: grid;
  gap: 12px;
  margin: 16px 22px;
  padding: 16px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.92));
}

.my-requirement-detail__review-grid {
  display: grid;
  grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.my-requirement-detail__review-item {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.my-requirement-detail__review-grid .my-requirement-detail__review-item {
  grid-template-rows: auto 1fr;
}

.my-requirement-detail__review-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1.35;
}

.my-requirement-detail__review-value {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  font-weight: 700;
  line-height: 1.7;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.my-requirement-detail__review-grid .my-requirement-detail__review-value {
  height: 100%;
}

.my-requirement-detail__review-grid div.my-requirement-detail__review-value {
  display: flex;
  align-items: center;
}

.my-requirement-detail__review-value--multiline {
  white-space: pre-wrap;
}

.my-requirement-detail__version-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-requirement-detail__version-list li {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.my-requirement-detail__version-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.my-requirement-detail__version-head strong {
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
}

.my-requirement-detail__version-head time {
  color: #94a3b8;
  font-size: 12px;
}

.my-requirement-detail__version-note {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.my-requirement-detail__version-link {
  width: fit-content;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.my-requirement-detail__version-link:hover {
  color: #1d4ed8;
}

.my-requirement-detail__rich {
  color: #334155;
  font-weight: 500;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.my-requirement-detail__rich :deep(*:not(a)) {
  color: inherit;
}

.my-requirement-detail__rich :deep(strong),
.my-requirement-detail__rich :deep(b) {
  color: #1e293b;
  font-weight: 700;
}

.my-requirement-detail__rich :deep(p),
.my-requirement-detail__rich :deep(ul),
.my-requirement-detail__rich :deep(ol),
.my-requirement-detail__rich :deep(blockquote) {
  margin: 0 0 12px;
}

.my-requirement-detail__rich :deep(ul),
.my-requirement-detail__rich :deep(ol) {
  padding-left: 22px;
}

.my-requirement-detail__rich :deep(a) {
  color: #2563eb;
  font-weight: 600;
}

.my-requirement-detail__rich :deep(pre) {
  overflow-x: auto;
  padding: 14px 16px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
}

.my-requirement-detail__rich :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px 0;
  border-radius: 14px;
}

.my-requirement-detail__rich :deep(.rich-editor-attachment) {
  display: inline-flex;
  max-width: 100%;
  margin: 8px 0;
  padding: 8px 12px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 800;
  text-decoration: none;
}

.my-requirement-detail__actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding: 0 22px 22px;
  background: rgba(248, 250, 252, 0.62);
}

.my-requirement-detail__payment-panel {
  display: grid;
  gap: 14px;
  margin: 16px 22px 0;
  padding: 16px;
  border: 1px solid rgba(147, 197, 253, 0.82);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.9), rgba(248, 250, 252, 0.94));
}

.my-requirement-detail__payment-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.my-requirement-detail__payment-head > div {
  display: grid;
  gap: 4px;
}

.my-requirement-detail__payment-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.my-requirement-detail__payment-head strong {
  color: #1d4ed8;
  font-size: 20px;
  line-height: 1.3;
}

.my-requirement-detail__payment-status {
  flex: 0 0 auto;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.my-requirement-detail__payment-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.my-requirement-detail__payment-channel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.my-requirement-detail__payment-channel > strong {
  color: #334155;
  font-size: 13px;
}

.my-requirement-detail__primary {
  min-height: 38px;
  padding: 0 18px;
  border: 1px solid #2563eb;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.my-requirement-detail__primary:hover:not(:disabled) {
  border-color: #1d4ed8;
  background: #1d4ed8;
}

.my-requirement-detail__primary:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.my-requirement-detail__secondary {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 8px;
  background: rgba(239, 246, 255, 0.82);
  color: #2563eb;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.my-requirement-detail__secondary:hover {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(219, 234, 254, 0.92);
}

.pay-modal .breach-modal__field {
  display: grid;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 14px;
}

.pay-modal .breach-modal__field > strong {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

/* 违约案件：双方表态（接受 / 不接受）区块 */
.pay-modal .breach-modal__decision {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(191, 219, 254, 0.9);
  border-radius: 14px;
  background: rgba(239, 246, 255, 0.72);
}

.pay-modal .breach-modal__decision .pay-line {
  margin-bottom: 0;
}

.pay-modal .breach-modal__decision .actions {
  margin-top: 12px;
}

.wallet-header h3.portal-page__eyebrow {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  line-height: 1.7;
}

@media (max-width: 980px) {
  .my-requirements-summary__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .requirement-row {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }

  .requirement-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .wallet-header {
    flex-direction: column;
    align-items: stretch;
  }

  .my-requirements-header__actions {
    justify-content: stretch;
  }

  .my-requirements-header__actions .ghost.small {
    flex: 1 1 0;
  }

  .my-requirements-summary__grid {
    grid-template-columns: 1fr;
  }

  .my-requirement-detail__actions {
    padding: 0 16px 18px;
  }

  .my-requirement-detail__payment-panel {
    margin: 14px 16px 0;
    padding: 14px;
  }

  .my-requirement-detail__payment-channel {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .my-requirement-detail__secondary {
    width: 100%;
  }

  .my-requirement-detail__primary {
    width: 100%;
  }

  .pay-modal .breach-modal__decision .actions .ghost {
    min-height: 44px;
  }

  .pay-modal .breach-modal__decision .actions {
    flex-direction: column;
  }

  .my-requirement-detail__review-panel {
    margin: 14px 16px;
    padding: 14px;
    border-radius: 16px;
  }

  .my-requirement-detail__review-grid {
    grid-template-columns: 1fr;
  }
}
</style>
