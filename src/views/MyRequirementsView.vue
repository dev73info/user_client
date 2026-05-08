<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import PublishModal from '@/components/PublishModal.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import {
  confirmPayment,
  createAlipayPagePayment,
  createPayment,
  type AlipayCreatePaymentResp,
  type AlipayPageCreatePaymentResp,
  type WechatCreatePaymentResp,
} from '@/api/payments'
import {
  completeRequirement as completeRequirementApi,
  commentRequirement as commentRequirementApi,
  listRequirements,
  requestRequirementFinalPayment as requestRequirementFinalPaymentApi,
  resubmitRequirement as resubmitRequirementApi,
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

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const requirementLoading = ref(false)
const myRequirements = ref<RequirementItem[]>([])
const payVisible = ref(false)
const payRequirement = ref<RequirementItem | null>(null)
const payChannel = ref<'alipay' | 'wechat'>('alipay')
const payLoading = ref(false)
const currentPayment = ref<AlipayCreatePaymentResp | null>(null)
const commentVisible = ref(false)
const commentRequirement = ref<RequirementItem | null>(null)
const commentRating = ref(5)
const commentText = ref('')
const commentLoading = ref(false)
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
const completionConfirmVisible = ref(false)
const completionConfirmTarget = ref<RequirementItem | null>(null)
const completionLoading = ref(false)
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const conversationLoading = ref(false)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
const expandedVersionDeleteReviewRequirementId = ref<string | null>(null)
const versionDeleteRejectTargetId = ref<number | null>(null)
const versionDeleteRejectNotes = ref<Record<number, string>>({})
const depositRatioPercent = ref(20)

const requirementStats = computed(() => ({
  total: myRequirements.value.length,
  active: myRequirements.value.filter((item) => item.status === 'in_development' || item.status === 'pending_final').length,
  pending: myRequirements.value.filter((item) => item.status === 'pending_review' || item.status === 'pending_deposit').length,
  completed: myRequirements.value.filter((item) => item.status === 'completed' || item.status === 'final_paid').length,
}))

function formatRequirementStatus(status: RequirementStatus) {
  const mapping: Record<RequirementStatus, string> = {
    pending_review: '待审核',
    rejected: '已拒绝',
    pending_deposit: '待付定金',
    deposit_paid: '待开发',
    in_development: '开发中',
    pending_final: '待付尾款',
    final_paid: '已付尾款',
    completed: '已完成',
  }

  return mapping[status]
}

function isSelfManagedRequirement(item: RequirementItem) {
  return item.payment_mode === 'self_managed'
}

function paymentModeLabel(item: RequirementItem) {
  return isSelfManagedRequirement(item) ? '无平台担保' : '平台担保'
}

function paymentModeHint(item: RequirementItem) {
  return isSelfManagedRequirement(item)
    ? '平台内沟通协作，付款由双方另行约定'
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

  return status === 'pending_deposit' || status === 'pending_final'
}

function canComplete(item: RequirementItem) {
  return item.status === 'final_paid'
}

function publishedVersionCount(item: RequirementItem) {
  return item.bound_resource_version_count ?? 0
}

function canRequestFinalPayment(item: RequirementItem) {
  return hasBoundResource(item) && item.status === 'in_development' && publishedVersionCount(item) > 0
}

function requirementFinalActionLabel(item: RequirementItem) {
  return isSelfManagedRequirement(item) ? '确认完成' : '支付尾款'
}

function canResubmit(status: RequirementStatus) {
  return status === 'rejected'
}

function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}

function canOpenConversation(item: RequirementItem) {
  return hasBoundResource(item)
}

function openConversation(item: RequirementItem) {
  conversationRequirement.value = item
  conversationVisible.value = true
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

function conversationLastMessageText(item: RequirementItem) {
  const conversation = conversationForRequirement(item)
  if (!conversation) {
    return '打开会话后开始沟通'
  }

  if (!conversation.last_message_at) {
    return '会话已创建，暂无消息'
  }

  return `最近沟通：${formatRequirementTime(conversation.last_message_at)}`
}

function conversationButtonLabel(item: RequirementItem) {
  return conversationForRequirement(item)?.last_message_at ? '查看沟通' : '开始沟通'
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
  return hasBoundResource(item) && (item.status === 'final_paid' || item.status === 'completed')
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

  if (item.resource_version_delete_request_status === 'rejected' && item.resource_version_delete_review_note) {
    return `你上次拒绝删除版本：${item.resource_version_delete_review_note}`
  }

  return ''
}

function formatResourceVisibility(item: RequirementItem) {
  return currentResourceVisibility(item) === 'public' ? '资源已公开' : '资源私有中'
}

function requirementSubscriptionLabel(item: RequirementItem) {
  return item.subscribe_status_change ? '取消订阅动态' : '订阅状态变化'
}

function nextResourceVisibility(item: RequirementItem): RequirementResourceVisibility {
  return currentResourceVisibility(item) === 'public' ? 'private' : 'public'
}

function toggleResourceVisibilityLabel(item: RequirementItem) {
  if (!canToggleRequirementResourceVisibility(item)) {
    return isSelfManagedRequirement(item) ? '完成后可设置' : '尾款后可设置'
  }

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
  payRequirement.value = item
  payChannel.value = 'alipay'
  currentPayment.value = null
  payVisible.value = true
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
    showToast(isSelfManagedRequirement(item) ? '只有开发中的需求单才能确认完成' : '只有开发中的需求单才能结束开发并支付尾款', 'warning')
    return
  }

  if (publishedVersionCount(item) <= 0) {
    showToast(isSelfManagedRequirement(item) ? '开发者至少发布一个资源版本后，才能确认完成' : '开发者至少发布一个资源版本后，才能结束开发并支付尾款', 'warning')
    return
  }

  finalPaymentConfirmTarget.value = item
  finalPaymentConfirmVisible.value = true
}

function closeFinalPaymentConfirm() {
  finalPaymentConfirmVisible.value = false
  finalPaymentConfirmTarget.value = null
}

function openCompletionConfirm(item: RequirementItem) {
  if (!auth.isAuthed) {
    showToast('请先登录后再继续操作', 'error')
    return
  }

  if (!canComplete(item)) {
    showToast('当前需求尚不能确认完成', 'warning')
    return
  }

  completionConfirmTarget.value = item
  completionConfirmVisible.value = true
}

function closeCompletionConfirm() {
  if (completionLoading.value) {
    return
  }

  completionConfirmVisible.value = false
  completionConfirmTarget.value = null
}

async function submitRequirementCompletion() {
  if (!completionConfirmTarget.value) {
    return
  }

  completionLoading.value = true
  try {
    await completeRequirementApi(auth.token, completionConfirmTarget.value.requirement_id)
    showToast('需求已确认完成', 'success')
    closeCompletionConfirm()
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '确认完成失败', 'error')
  } finally {
    completionLoading.value = false
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
  return status === 'final_paid' || status === 'completed'
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

function closePayModal() {
  payVisible.value = false
}

function closeCommentModal() {
  commentVisible.value = false
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

async function toggleRequirementResourceVisibility(item: RequirementItem) {
  if (!auth.isAuthed || !hasBoundResource(item)) {
    return
  }

  if (!canToggleRequirementResourceVisibility(item)) {
    showToast(isSelfManagedRequirement(item) ? '需求完成后才能设置资源为公开或私有' : '需求必须在已付尾款后，才能设置资源为公开或私有', 'warning')
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
  const normalizedDescription = editDescription.value.trim()
  const normalizedAcceptance = editAcceptance.value.trim()
  const budgetRaw = String(editBudget.value ?? '').trim()

  if (normalizedTitle.length < 4) {
    showToast('需求标题至少 4 个字符', 'error')
    return
  }

  if (normalizedDescription.length < 10) {
    showToast('需求描述至少 10 个字符', 'error')
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

  if (!normalizedAcceptance) {
    showToast('验收标准不能为空', 'error')
    return
  }

  editLoading.value = true
  try {
    await resubmitRequirementApi(auth.token, editRequirement.value.requirement_id, {
      title: normalizedTitle,
      description: normalizedDescription,
      budget,
      acceptance_criteria: normalizedAcceptance,
      payment_mode: editPaymentMode.value,
    })

    showToast('需求已重新提交，等待审核', 'success')
    forceCloseEditModal()
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '重新提交失败', 'error')
  } finally {
    editLoading.value = false
  }
}

function depositAmount(item: RequirementItem) {
  if (typeof item.budget === 'number') {
    return item.budget
  }
  return 1
}

function finalDepositAmount(item: RequirementItem) {
  const base = Number(depositAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }
  const ratio = Number(depositRatioPercent.value)
  const scaled = Number.isFinite(ratio) && ratio > 0 ? (base * ratio) / 100 : base
  const raw = Math.max(0.01, scaled)
  return Number(raw.toFixed(2))
}

function finalPaymentAmount(item: RequirementItem) {
  const base = Number(depositAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }
  const tail = Math.max(0.01, base - finalDepositAmount(item))
  return Number(tail.toFixed(2))
}

const isFinalPayment = computed(() => payRequirement.value?.status === 'pending_final')
const payStageLabel = computed(() => (isFinalPayment.value ? '尾款' : '定金'))

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
    if (
      expandedVersionDeleteReviewRequirementId.value
      && !myRequirements.value.some(
        (item) => item.requirement_id === expandedVersionDeleteReviewRequirementId.value && hasPendingResourceVersionDeleteReview(item),
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

async function submitRequirementPayment() {
  if (!payRequirement.value) {
    return
  }

  const requirement = payRequirement.value
  const channel = payChannel.value
  const amount = payAmount.value

  payLoading.value = true
  try {
    if (!currentPayment.value) {
      let createPayload: AlipayCreatePaymentResp | WechatCreatePaymentResp | AlipayPageCreatePaymentResp

      if (channel === 'alipay') {
        createPayload = await createAlipayPagePayment(auth.token, {
          requirement_id: requirement.requirement_id,
          amount_cny: amount,
          description: `需求 ${requirement.requirement_id} ${payStageLabel.value}`,
        })

        currentPayment.value = {
          payment_id: createPayload.payment_id,
          requirement_id: createPayload.requirement_id,
          channel: createPayload.channel,
          amount_cny: createPayload.amount_cny,
          status: createPayload.status,
          alipay_order_string: '',
          expires_at: createPayload.expires_at,
        }
      } else {
        createPayload = await createPayment(auth.token, channel, {
          requirement_id: requirement.requirement_id,
          amount_cny: amount,
          description: `需求 ${requirement.requirement_id} ${payStageLabel.value}`,
        })

        const wechatPayload = createPayload as WechatCreatePaymentResp
        currentPayment.value = {
          payment_id: wechatPayload.payment_id,
          requirement_id: wechatPayload.requirement_id,
          channel: wechatPayload.channel,
          amount_cny: wechatPayload.amount_cny,
          status: wechatPayload.status,
          alipay_order_string: wechatPayload.code_url,
          expires_at: wechatPayload.expires_at,
        }
      }

      showToast(`${payStageLabel.value}支付订单已生成，正在跳转支付页`, 'success')
      router.push({
        name: 'payment',
        query: {
          payment_id: currentPayment.value.payment_id,
          requirement_id: requirement.requirement_id,
          channel,
          amount_cny: currentPayment.value.amount_cny.toString(),
          expires_at: currentPayment.value.expires_at,
          ...(channel === 'alipay' ? { page: '1' } : { qr_content: currentPayment.value.alipay_order_string }),
        },
      })
      return
    }

    const confirmResult = await confirmPayment(auth.token, channel, currentPayment.value.payment_id)

    if (!confirmResult.ok) {
      throw new Error(confirmResult.message || `确认${payStageLabel.value}支付失败`)
    }

    showToast(`${payStageLabel.value}支付确认成功`, 'success')
    payVisible.value = false
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '支付失败', 'error')
  } finally {
    payLoading.value = false
  }
}

function handleRequirementAction(item: RequirementItem) {
  if (hasPendingResourceVersionDeleteReview(item)) {
    toggleVersionDeleteReviewCard(item)
    return
  }

  if (canPay(item.status, item)) {
    openPayModal(item)
  } else if (canComplete(item)) {
    openCompletionConfirm(item)
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
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page my-requirements-page">
    <section class="wallet-section my-requirements-summary">
      <div class="my-requirements-summary__grid">
        <article>
          <strong>{{ requirementStats.total }}</strong>
          <span>全部需求</span>
        </article>
        <article>
          <strong>{{ requirementStats.pending }}</strong>
          <span>待处理</span>
        </article>
        <article>
          <strong>{{ requirementStats.active }}</strong>
          <span>开发中</span>
        </article>
        <article>
          <strong>{{ requirementStats.completed }}</strong>
          <span>可评价/已完成</span>
        </article>
      </div>
    </section>

    <section class="wallet-section">
      <div class="wallet-header">
        <div>
          <h3>我提交的需求单</h3>
          <small class="requirement-note">点击可操作的需求行可快速处理待审核、支付、完成或评价。</small>
        </div>
        <button class="ghost small" type="button" @click="router.push({ name: 'requirement-hall' })">发布新需求</button>
      </div>

      <div v-if="myRequirements.length === 0" class="empty">
        {{ requirementLoading ? '需求单加载中...' : '暂无已提交需求单' }}
      </div>
      <ul v-else class="requirement-list">
        <template v-for="item in myRequirements" :key="item.requirement_id">
          <li class="requirement-row"
            :class="{ clickable: hasPendingResourceVersionDeleteReview(item) || canPay(item.status, item) || canComplete(item) || canComment(item.status) || canResubmit(item.status), expanded: isVersionDeleteReviewExpanded(item) }"
            @click="handleRequirementAction(item)">
            <div class="requirement-main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.requirement_id }}</span>
              <small class="requirement-note">{{ paymentModeLabel(item) }} · {{ paymentModeHint(item)
                }}</small>
              <small v-if="hasBoundResource(item)" class="requirement-resource-visibility">{{
                formatResourceVisibility(item) }}</small>
              <small v-if="hasBoundResource(item)" class="requirement-note">已发布版本：{{
                publishedVersionCount(item)
                }}</small>
              <small v-if="hasBoundResource(item) && !canToggleRequirementResourceVisibility(item)"
                class="requirement-note">资源公开/私有切换需在{{ isSelfManagedRequirement(item) ? '需求完成后' :
                  '已付尾款后' }}开放</small>
              <small v-if="hasPendingResourceVersionDeleteReview(item)" class="requirement-note">
                <strong>待审核删除版本：</strong>
                <span class="pending-review-pill">
                  {{ pendingResourceVersionDeleteRequests(item).length }} 个待审核
                </span>
                <span class="pending-review-count">共 {{
                  pendingResourceVersionDeleteRequests(item).length }} 个</span>
              </small>
              <small v-if="hasPendingResourceVersionDeleteReview(item)" class="requirement-note">{{
                resourceVersionDeleteReviewHint(item) }}</small>
              <small v-if="hasPendingResourceVersionDeleteReview(item)"
                class="requirement-note">点击当前需求行，可在下方展开审核卡片。</small>
              <small
                v-else-if="hasBoundResource(item) && item.resource_version_delete_request_status === 'rejected' && item.resource_version_delete_review_note"
                class="requirement-note">{{ resourceVersionDeleteReviewHint(item) }}</small>
              <small
                v-if="item.status === 'in_development' && hasBoundResource(item) && publishedVersionCount(item) < 1"
                class="requirement-note">开发者至少发布 1 个版本后，用户才能{{ isSelfManagedRequirement(item) ? '确认完成' :
                  '结束开发并支付尾款'
                }}</small>
              <small v-if="item.status === 'rejected' && item.review_note" class="requirement-note">驳回原因：{{
                item.review_note }}</small>
              <small class="requirement-note">{{ item.subscribe_status_change ? '已订阅该需求的状态变化通知' :
                '未订阅该需求的状态变化通知'
                }}</small>
              <small v-if="canOpenConversation(item)" class="requirement-note">{{
                conversationLastMessageText(item)
                }}</small>
            </div>
            <span class="requirement-status">{{ formatRequirementStatus(item.status) }}</span>
            <span>{{ formatBudget(item.budget) }}</span>
            <time>{{ formatRequirementTime(item.updated_at) }}</time>
            <div class="requirement-actions">
              <button class="ghost small" type="button"
                :disabled="requirementSubscriptionLoadingId === item.requirement_id"
                @click.stop="toggleRequirementSubscription(item)">
                {{ requirementSubscriptionLoadingId === item.requirement_id ? '提交中...' :
                  requirementSubscriptionLabel(item) }}
              </button>
              <button v-if="hasBoundResource(item)" class="ghost small" type="button"
                :disabled="resourceVisibilityLoadingId === item.requirement_id || !canToggleRequirementResourceVisibility(item)"
                @click.stop="toggleRequirementResourceVisibility(item)">
                {{ resourceVisibilityLoadingId === item.requirement_id ? '提交中...' :
                  toggleResourceVisibilityLabel(item)
                }}
              </button>
              <button v-if="canOpenConversation(item)" class="ghost small" type="button"
                @click.stop="openConversation(item)">{{ conversationButtonLabel(item) }}</button>
              <button v-if="canRequestFinalPayment(item)" class="ghost small" type="button"
                @click.stop="requestFinalPayment(item)">{{ requirementFinalActionLabel(item) }}</button>
              <button v-if="canComplete(item)" class="ghost small" type="button"
                @click.stop="openCompletionConfirm(item)">确认完成</button>
              <button v-if="canResubmit(item.status)" class="ghost small" type="button"
                @click.stop="openRequirementEditModal(item)">重新编辑</button>
              <button v-else-if="canPay(item.status, item)" class="ghost small" type="button"
                @click.stop="openPayModal(item)">去支付</button>
              <button v-else-if="canComment(item.status) && !canComplete(item)" class="ghost small" type="button"
                @click.stop="openCommentModal(item)">去评价</button>
            </div>
          </li>

          <li v-if="isVersionDeleteReviewExpanded(item)" class="requirement-review-card-row">
            <section class="requirement-review-card" @click.stop>
              <div class="requirement-review-card__header">
                <div>
                  <h4>版本删除审核</h4>
                  <p>每个待删除版本单独一张卡片，直接在对应卡片上审核。</p>
                </div>
                <button class="ghost small" type="button" @click.stop="closeVersionDeleteReviewCard">收起</button>
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
                        {{ resourceVersionDeleteReviewLoadingId === item.requirement_id ?
                          '处理中...' : '同意删除' }}
                      </button>
                      <button class="ghost small" type="button" :class="{ active: isRejectingVersion(request) }"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="openRejectVersion(request)">拒绝删除</button>
                    </div>
                  </div>
                  <p class="requirement-review-card__hint danger">同意后该版本文件会被永久删除，且无法恢复。</p>
                  <div v-if="isRejectingVersion(request)" class="requirement-review-item__reject-panel">
                    <label class="requirement-review-card__field requirement-review-card__field--stacked">
                      <span>拒绝原因</span>
                      <textarea v-model="versionDeleteRejectNotes[request.version_id]" class="comment-input" rows="4"
                        maxlength="500" placeholder="可选：说明拒绝删除该版本的原因"></textarea>
                      <small class="requirement-note">已输入 {{
                        pendingVersionRejectNote(request).length }} / 500
                        字</small>
                    </label>
                    <div class="requirement-review-card__actions">
                      <button class="ghost small" type="button" @click.stop="cancelRejectVersion">取消</button>
                      <button class="ghost small" type="button"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="submitVersionDeleteReview(item, request, 'reject')">
                        {{ resourceVersionDeleteReviewLoadingId === item.requirement_id ?
                          '处理中...' : '确认拒绝删除' }}
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

    <PublishModal :visible="editVisible" modalTitle="重新编辑需求" submitText="重新提交审核" loadingText="提交中..."
      v-model:publishTitle="editTitle" v-model:publishDescription="editDescription" v-model:publishBudget="editBudget"
      v-model:publishAcceptance="editAcceptance" v-model:publishPaymentMode="editPaymentMode"
      :publishLoading="editLoading" @close="closeEditModal" @submit="submitRequirementResubmit" />

    <RequirementConversationModal :visible="conversationVisible" :token="auth.token" :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirement_id ?? ''" :title="conversationRequirement?.title"
      @updated="applyConversationDetail" @close="closeConversation" />

    <div v-if="payVisible && payRequirement" class="modal-wrap" @click.self="closePayModal">
      <section class="pay-modal" aria-label="需求支付弹窗">
        <h3>支付{{ payStageLabel }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ payRequirement.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ payRequirement.requirement_id }}</p>
        <p class="pay-line"><strong>预算：</strong>{{ formatBudget(payRequirement.budget) }}</p>
        <p v-if="!isFinalPayment" class="pay-line"><strong>定金占比：</strong>{{ depositRatioPercent.toFixed(2) }}%
        </p>
        <p class="pay-amount">实付款：<strong>¥{{ payAmount.toFixed(2) }}</strong></p>

        <div class="pay-channel-row">
          <strong>支付方式：</strong>
          <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
            <button type="button" class="payment-option" :class="{ active: payChannel === 'alipay' }"
              @click="payChannel = 'alipay'">
              <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
              支付宝
            </button>
            <button type="button" class="payment-option" :class="{ active: payChannel === 'wechat' }"
              @click="payChannel = 'wechat'">
              <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信支付" />
              微信支付
            </button>
          </div>
        </div>

        <div class="actions">
          <button class="ghost" type="button" @click="closePayModal">取消</button>
          <button class="ghost" type="button" :disabled="payLoading" @click="submitRequirementPayment">
            {{ payLoading ? '处理中...' : currentPayment ? '查询支付结果' : `支付${payStageLabel}` }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="finalPaymentConfirmVisible && finalPaymentConfirmTarget" class="modal-wrap"
      @click.self="closeFinalPaymentConfirm">
      <section class="pay-modal" aria-label="尾款确认弹窗">
        <h3>{{ finalPaymentConfirmTitle }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ finalPaymentConfirmTarget.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ finalPaymentConfirmTarget.requirement_id }}</p>
        <p class="tip">{{ finalPaymentConfirmTip }}</p>

        <div class="actions">
          <button class="ghost" type="button" @click="closeFinalPaymentConfirm">取消</button>
          <button class="ghost" type="button" @click="confirmFinalPaymentRequest">{{ finalPaymentConfirmButton
            }}</button>
        </div>
      </section>
    </div>

    <div v-if="completionConfirmVisible && completionConfirmTarget" class="modal-wrap"
      @click.self="closeCompletionConfirm">
      <section class="pay-modal" aria-label="需求完成确认弹窗">
        <h3>确认需求已完成</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ completionConfirmTarget.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ completionConfirmTarget.requirement_id }}</p>
        <p class="tip">确认后，当前需求会从已付尾款进入已完成状态，后续可继续评价。</p>

        <div class="actions">
          <button class="ghost" type="button" :disabled="completionLoading" @click="closeCompletionConfirm">取消</button>
          <button class="ghost" type="button" :disabled="completionLoading" @click="submitRequirementCompletion">
            {{ completionLoading ? '提交中...' : '确认完成' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="commentVisible && commentRequirement" class="modal-wrap" @click.self="closeCommentModal">
      <section class="pay-modal" aria-label="需求评论弹窗">
        <h3>评价需求</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ commentRequirement.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ commentRequirement.requirement_id }}</p>
        <div class="pay-line">
          <strong>评分：</strong>
          <div class="rating-row">
            <button v-for="star in 5" :key="star" type="button" class="rating-star" :class="starClass(star)"
              @click="setRating($event, star)">
              ★
            </button>
            <span class="rating-value">{{ commentRating.toFixed(1) }} 分</span>
          </div>
        </div>
        <div class="pay-line">
          <strong>评论内容：</strong>
        </div>
        <textarea class="comment-input" v-model="commentText" rows="4" maxlength="200"
          placeholder="请输入评论，最多 200 字"></textarea>
        <p class="tip">已输入 {{ commentText.length }} / 200 字</p>

        <div class="actions">
          <button class="ghost" type="button" @click="closeCommentModal">取消</button>
          <button class="ghost" type="button" :disabled="commentLoading" @click="submitRequirementComment">
            {{ commentLoading ? '提交中...' : '提交评论' }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.my-requirements-page {
  gap: 16px;
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

  .my-requirements-summary__grid {
    grid-template-columns: 1fr;
  }
}
</style>
