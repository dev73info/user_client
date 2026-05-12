<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PublishModal from '@/components/PublishModal.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import { apiUrl } from '@/api/http'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import {
  confirmPayment,
  createAlipayPagePayment,
  createPayment,
  type AlipayCreatePaymentResp,
  type AlipayPageCreatePaymentResp,
  type WechatCreatePaymentResp,
} from '@/api/payments'
import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import {
  completeRequirement as completeRequirementApi,
  commentRequirement as commentRequirementApi,
  createRequirement as createRequirementApi,
  listRequirements,
  requestRequirementFinalPayment as requestRequirementFinalPaymentApi,
  resubmitRequirement as resubmitRequirementApi,
  type RequirementItem,
  type RequirementPaymentMode,
  type RequirementStatus,
} from '@/api/requirements'
import {
  getDepositRatio,
  getProfile,
  sendProfileEmailChangeCode,
  sendProfilePasswordCode,
  updateProfile,
  updateProfileEmail,
  updateProfilePassword,
  updateProfileSubscriptions,
  uploadProfileAvatar,
} from '@/api/settings'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const coupons = ref<CouponItem[]>([])
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
const publishVisible = ref(false)
const securityVisible = ref(false)
const editRequirement = ref<RequirementItem | null>(null)
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
const publishLoading = ref(false)
const editTitle = ref('')
const editDescription = ref('')
const editBudget = ref<string | number>('')
const editAcceptance = ref('')
const editPaymentMode = ref<RequirementPaymentMode>('self_managed')
const editLoading = ref(false)
const finalPaymentConfirmVisible = ref(false)
const finalPaymentConfirmTarget = ref<RequirementItem | null>(null)
const completionConfirmVisible = ref(false)
const completionConfirmTarget = ref<RequirementItem | null>(null)
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const conversationLoading = ref(false)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
const completionLoading = ref(false)
const depositRatioPercent = ref(20)
const { showToast } = useToast()

const amountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'amount'))
const discountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'percent'))
const conversationCards = computed(() => myRequirements.value.filter(canOpenConversation))
const availableConversationCount = computed(() => conversationCards.value.length)
const usableCouponCount = computed(() => coupons.value.filter((item) => item.status !== 'used').length)
const accountEmailLabel = computed(() => profileEmail.value || '未绑定邮箱')
const profileAvatarSrc = computed(() => (profileAvatarUrl.value ? apiUrl(profileAvatarUrl.value) : ''))
const profileInitial = computed(() => Array.from(auth.username || newUsername.value || '用')[0] ?? '用')
const subscriptionLabel = computed(() => (subscriptionOfficialActivity.value ? '已订阅' : '未订阅'))
const requirementStats = computed(() => ({
  total: myRequirements.value.length,
  pending: myRequirements.value.filter((item) => item.status === 'pending_review' || item.status === 'pending_deposit').length,
  active: myRequirements.value.filter((item) => item.status === 'deposit_paid' || item.status === 'in_development' || item.status === 'pending_final').length,
  payment: myRequirements.value.filter((item) => canPay(item.status, item)).length,
  completed: myRequirements.value.filter((item) => item.status === 'final_paid' || item.status === 'completed').length,
}))
const sortedRequirements = computed(() =>
  [...myRequirements.value].sort((left, right) => requirementTimeValue(right.updated_at) - requirementTimeValue(left.updated_at)),
)
const actionableRequirements = computed(() =>
  sortedRequirements.value
    .filter((item) => hasPendingResourceVersionDeleteReview(item) || canRequestFinalPayment(item) || canPay(item.status, item) || canComplete(item) || canResubmit(item.status) || canComment(item.status))
    .slice(0, 4),
)
const recentRequirements = computed(() => sortedRequirements.value.slice(0, 5))
const recentConversationCards = computed(() =>
  [...conversationCards.value]
    .sort((left, right) => conversationTimeValue(right) - conversationTimeValue(left))
    .slice(0, 3),
)

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

function requirementTimeValue(value?: string | null) {
  if (!value) {
    return 0
  }
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function conversationTimeValue(item: RequirementItem) {
  const conversation = conversationForRequirement(item)
  return requirementTimeValue(conversation?.last_message_at ?? item.updated_at)
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

function canResubmit(status: RequirementStatus) {
  return status === 'rejected'
}

function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}

function isRequirementCompleted(item: RequirementItem) {
  return item.status === 'completed' || item.status === 'final_paid'
}

function canOpenConversation(item: RequirementItem) {
  return hasBoundResource(item) && !isRequirementCompleted(item)
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

function hasPendingResourceVersionDeleteReview(item: RequirementItem) {
  return hasBoundResource(item) && (item.pending_resource_version_delete_requests?.length ?? 0) > 0
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

async function openPublishModal() {
  if (!auth.isAuthed) {
    showToast('请先登录后再发布需求', 'error')
    return
  }

  publishTitle.value = ''
  publishDescription.value = ''
  publishBudget.value = ''
  publishAcceptance.value = ''
  publishPaymentMode.value = 'self_managed'
  publishVisible.value = true
}

function openSecurityModal() {
  securityVisible.value = true
}

function closeSecurityModal() {
  if (usernameLoading.value || emailLoading.value || passwordLoading.value || subscriptionLoading.value) {
    return
  }
  securityVisible.value = false
}

async function refreshProfileData() {
  await Promise.all([
    loadCoupons(),
    loadMyRequirements(),
    loadRequirementConversations(),
    loadDepositRatio(),
    loadProfile(),
  ])
  showToast('资料已刷新', 'success')
}

function handleRequirementAction(item: RequirementItem) {
  if (hasPendingResourceVersionDeleteReview(item)) {
    void router.push({ name: 'workbench-requirements' })
    return
  }

  if (canRequestFinalPayment(item)) {
    void requestFinalPayment(item)
  } else if (canPay(item.status, item)) {
    openPayModal(item)
  } else if (canComplete(item)) {
    openCompletionConfirm(item)
  } else if (canResubmit(item.status)) {
    openRequirementEditModal(item)
  } else if (canComment(item.status)) {
    openCommentModal(item)
  }
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

async function updateUsername() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改用户名', 'error')
    return
  }

  const trimmed = newUsername.value.trim()
  if (trimmed.length === 0) {
    showToast('请输入一个新的用户名', 'error')
    return
  }
  if (trimmed === auth.username) {
    showToast('用户名未发生变化', 'info')
    return
  }

  usernameLoading.value = true
  try {
    const payload = await updateProfile(auth.token, trimmed)
    auth.setToken(payload.token)
    newUsername.value = auth.username
    showToast('用户名已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改用户名失败', 'error')
  } finally {
    usernameLoading.value = false
  }
}

function openProfileAvatarPicker() {
  profileAvatarInput.value?.click()
}

async function handleProfileAvatarChange(event: Event) {
  if (!auth.isAuthed) {
    showToast('请先登录后上传头像', 'error')
    return
  }

  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    showToast('头像仅支持图片格式', 'warning')
    if (input) input.value = ''
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('头像图片请控制在 2MB 以内', 'warning')
    if (input) input.value = ''
    return
  }

  profileAvatarUploading.value = true
  try {
    const profile = await uploadProfileAvatar(auth.token, file)
    profileAvatarUrl.value = profile.avatar_url ?? ''
    showToast('头像已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '上传头像失败', 'error')
  } finally {
    profileAvatarUploading.value = false
    if (input) input.value = ''
  }
}

async function loadProfile() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  try {
    const profile = await getProfile(auth.token)
    newUsername.value = profile.username
    profileAvatarUrl.value = profile.avatar_url ?? ''
    profileEmail.value = profile.email ?? ''
    subscriptionOfficialActivity.value = Boolean(profile.subscribe_official_activity)
    if (!newEmail.value) {
      newEmail.value = profile.email ?? ''
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载个人资料失败', 'error')
  }
}

async function saveSubscriptions() {
  if (!auth.isAuthed) {
    showToast('请先登录', 'error')
    return
  }

  subscriptionLoading.value = true
  try {
    const profile = await updateProfileSubscriptions(auth.token, {
      subscribe_official_activity: subscriptionOfficialActivity.value,
    })
    subscriptionOfficialActivity.value = Boolean(profile.subscribe_official_activity)
    showToast('订阅设置已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新订阅设置失败', 'error')
  } finally {
    subscriptionLoading.value = false
  }
}

async function sendEmailVerificationCode() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改邮箱', 'error')
    return
  }

  const trimmed = newEmail.value.trim()
  if (!trimmed) {
    showToast('请输入新的邮箱地址', 'error')
    return
  }
  if (trimmed === profileEmail.value) {
    showToast('新邮箱不能与当前邮箱相同', 'warning')
    return
  }

  emailCodeSending.value = true
  try {
    await sendProfileEmailChangeCode(auth.token, trimmed)
    showToast('验证码已发送到新邮箱，请查收', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送邮箱验证码失败', 'error')
  } finally {
    emailCodeSending.value = false
  }
}

async function submitEmailChange() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改邮箱', 'error')
    return
  }

  const trimmedEmail = newEmail.value.trim()
  const trimmedCode = emailCode.value.trim()
  if (!trimmedEmail) {
    showToast('请输入新的邮箱地址', 'error')
    return
  }
  if (trimmedCode.length !== 6) {
    showToast('请输入 6 位邮箱验证码', 'error')
    return
  }

  emailLoading.value = true
  try {
    const profile = await updateProfileEmail(auth.token, trimmedEmail, trimmedCode)
    profileEmail.value = profile.email ?? ''
    newEmail.value = profile.email ?? ''
    emailCode.value = ''
    showToast('邮箱已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改邮箱失败', 'error')
  } finally {
    emailLoading.value = false
  }
}

async function sendPasswordVerificationCode() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改密码', 'error')
    return
  }
  if (!profileEmail.value) {
    showToast('请先绑定邮箱后再修改密码', 'error')
    return
  }

  passwordCodeSending.value = true
  try {
    await sendProfilePasswordCode(auth.token)
    showToast('验证码已发送到当前绑定邮箱，请查收', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送密码验证码失败', 'error')
  } finally {
    passwordCodeSending.value = false
  }
}

async function submitPasswordChange() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改密码', 'error')
    return
  }

  const trimmedPassword = newPassword.value.trim()
  const trimmedConfirm = confirmPassword.value.trim()
  const trimmedCode = passwordCode.value.trim()

  if (trimmedPassword.length < 6) {
    showToast('新密码至少 6 位', 'error')
    return
  }
  if (trimmedPassword !== trimmedConfirm) {
    showToast('两次输入的新密码不一致', 'error')
    return
  }
  if (trimmedCode.length !== 6) {
    showToast('请输入 6 位邮箱验证码', 'error')
    return
  }

  passwordLoading.value = true
  try {
    await updateProfilePassword(auth.token, trimmedPassword, trimmedCode)
    newPassword.value = ''
    confirmPassword.value = ''
    passwordCode.value = ''
    showToast('密码已更新，请使用新密码登录', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改密码失败', 'error')
  } finally {
    passwordLoading.value = false
  }
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

function forceClosePublishModal() {
  publishVisible.value = false
  publishTitle.value = ''
  publishDescription.value = ''
  publishBudget.value = ''
  publishAcceptance.value = ''
  publishPaymentMode.value = 'self_managed'
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

async function submitRequirementPublish() {
  if (!auth.isAuthed) {
    showToast('请先登录后再发布需求', 'error')
    return
  }

  const normalizedTitle = publishTitle.value.trim()
  const normalizedDescription = publishDescription.value.trim()
  const normalizedAcceptance = publishAcceptance.value.trim()
  const budgetRaw = String(publishBudget.value ?? '').trim()

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

  publishLoading.value = true
  try {
    await createRequirementApi(auth.token, {
      title: normalizedTitle,
      description: normalizedDescription,
      budget,
      acceptance_criteria: normalizedAcceptance,
      payment_mode: publishPaymentMode.value,
    })

    showToast('需求已发布', 'success')
    forceClosePublishModal()
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发布失败', 'error')
  } finally {
    publishLoading.value = false
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

const newUsername = ref('')
const usernameLoading = ref(false)
const profileAvatarUrl = ref('')
const profileAvatarInput = ref<HTMLInputElement | null>(null)
const profileAvatarUploading = ref(false)
const profileEmail = ref('')
const newEmail = ref('')
const emailCode = ref('')
const emailCodeSending = ref(false)
const emailLoading = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const passwordCode = ref('')
const passwordCodeSending = ref(false)
const passwordLoading = ref(false)
const subscriptionOfficialActivity = ref(false)
const subscriptionLoading = ref(false)

const payAmount = computed(() => {
  if (!payRequirement.value) {
    return 0.01
  }
  if (payRequirement.value.status === 'pending_final') {
    return finalPaymentAmount(payRequirement.value)
  }
  return finalDepositAmount(payRequirement.value)
})

async function loadCoupons() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  loading.value = true
  try {
    coupons.value = await listAvailableCoupons(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载券包失败', 'error')
  } finally {
    loading.value = false
  }
}

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
    // Keep default deposit ratio when settings API is unavailable.
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


onMounted(async () => {
  auth.hydrate()
  newUsername.value = auth.username
  await Promise.all([
    loadCoupons(),
    loadMyRequirements(),
    loadRequirementConversations(),
    loadDepositRatio(),
    loadProfile(),
  ])
})

</script>

<template>
  <main id="overview" class="page-shell custom-page-shell profile-page">
    <section class="overview-hero">
      <div class="overview-hero__head">
        <div class="overview-hero__identity">
          <button class="profile-avatar-button" type="button" :disabled="profileAvatarUploading"
            @click="openProfileAvatarPicker">
            <img v-if="profileAvatarSrc" :src="profileAvatarSrc" alt="用户头像" />
            <span v-else>{{ profileInitial }}</span>
            <small>{{ profileAvatarUploading ? '上传中' : '更换' }}</small>
          </button>
          <input ref="profileAvatarInput" class="profile-avatar-input" type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            @change="handleProfileAvatarChange" />
          <div>
            <p class="overview-eyebrow">统一工作台</p>
            <h1>{{ auth.username ? `你好，${auth.username}` : '你好，欢迎回来' }}</h1>
            <p>账户、需求与优惠券概览</p>
          </div>
        </div>
        <RouterLink class="overview-home-link" :to="{ name: 'home' }">返回首页</RouterLink>
      </div>

      <div class="overview-hero__body">
        <div class="overview-hero__main">
          <div class="overview-hero__chips">
            <span>{{ accountEmailLabel }}</span>
            <span>官方活动：{{ subscriptionLabel }}</span>
          </div>
        </div>
        <div class="overview-hero__actions">
          <button class="ghost small" type="button" @click="openPublishModal">发布需求</button>
          <button class="ghost small" type="button" @click="router.push({ name: 'workbench-messages' })">消息中心</button>
          <button class="ghost small" type="button" @click="openSecurityModal">账户安全</button>
          <button class="ghost small" type="button" :disabled="loading || requirementLoading"
            @click="refreshProfileData">
            {{ loading || requirementLoading ? '刷新中...' : '刷新资料' }}
          </button>

        </div>

      </div>
    </section>

    <section class="overview-stat-grid" aria-label="工作台关键数据">
      <RouterLink class="overview-stat-card" :to="{ name: 'workbench-requirements' }">
        <span>需求总数</span>
        <strong>{{ requirementStats.total }}</strong>
        <small>{{ requirementStats.active }} 个推进中</small>
      </RouterLink>
      <RouterLink class="overview-stat-card" :to="{ name: 'workbench-requirements' }">
        <span>待处理</span>
        <strong>{{ actionableRequirements.length }}</strong>
        <small>{{ requirementStats.payment }} 个待支付</small>
      </RouterLink>
      <RouterLink class="overview-stat-card" :to="{ name: 'workbench-messages' }">
        <span>沟通会话</span>
        <strong>{{ availableConversationCount }}</strong>
        <small>{{ conversationLoading ? '同步中' : '可进入消息中心' }}</small>
      </RouterLink>
      <RouterLink class="overview-stat-card" :to="{ name: 'workbench-account' }">
        <span>可用券</span>
        <strong>{{ usableCouponCount }}</strong>
        <small>满减 {{ amountCoupons.length }} / 折扣 {{ discountCoupons.length }}</small>
      </RouterLink>
    </section>

    <section class="overview-focus-panel">
      <div class="overview-section-head">
        <div>
          <p class="overview-eyebrow">最近需求</p>
          <h2>需求进度</h2>
        </div>
        <RouterLink class="overview-link" :to="{ name: 'workbench-requirements' }">查看需求单</RouterLink>
      </div>
      <div v-if="recentRequirements.length === 0" class="overview-empty-state">
        <strong>暂无需求单</strong>
        <span>发布定制需求后，进度会在这里汇总。</span>
      </div>
      <ul v-else class="overview-requirement-list">
        <li v-for="item in recentRequirements" :key="item.requirement_id"
          :class="{ clickable: hasPendingResourceVersionDeleteReview(item) || canRequestFinalPayment(item) || canPay(item.status, item) || canComplete(item) || canComment(item.status) || canResubmit(item.status) }"
          @click="handleRequirementAction(item)">
          <div>
            <strong>{{ item.title }}</strong>
            <span>{{ item.requirement_id }} · {{ paymentModeLabel(item) }}</span>
          </div>
          <span class="overview-status" :class="`overview-status--${item.status}`">{{
            formatRequirementStatus(item.status) }}</span>
          <small>{{ formatBudget(item.budget) }}</small>
          <time>{{ formatRequirementTime(item.updated_at) }}</time>
        </li>
      </ul>
    </section>

    <div class="overview-dashboard-grid">
      <section class="overview-panel overview-panel--main overview-panel--messages">
        <div class="overview-section-head">
          <div>
            <p class="overview-eyebrow">沟通会话</p>
            <h2>最近沟通</h2>
          </div>
          <div class="overview-inline-actions">
            <button class="ghost small" type="button" :disabled="conversationLoading"
              @click="loadRequirementConversations">
              {{ conversationLoading ? '刷新中...' : '刷新会话' }}
            </button>
            <RouterLink class="overview-link" :to="{ name: 'workbench-messages' }">消息中心</RouterLink>
          </div>
        </div>
        <div v-if="recentConversationCards.length === 0" class="overview-empty-state">
          <strong>暂无可用会话</strong>
          <span>需求绑定资源后，会话入口会显示在这里。</span>
        </div>
        <div v-else class="conversation-card-list">
          <button v-for="item in recentConversationCards" :key="item.requirement_id" type="button"
            class="conversation-card" @click="openConversation(item)">
            <span class="conversation-card__title">{{ item.title }}</span>
            <span class="conversation-card__id">{{ item.requirement_id }}</span>
            <span class="conversation-card__meta">{{ conversationLastMessageText(item) }}</span>
          </button>
        </div>
      </section>

      <aside class="overview-side-stack">

        <section class="overview-panel">
          <div class="overview-section-head overview-section-head--compact">
            <div>
              <p class="overview-eyebrow">开发者工作</p>
              <h2>快捷入口</h2>
            </div>
          </div>
          <div class="overview-dev-links">
            <RouterLink :to="{ name: 'dev-plugins' }">资源初始化</RouterLink>
            <RouterLink :to="{ name: 'dev-requirement-hall' }">需求大厅</RouterLink>
            <RouterLink :to="{ name: 'dev-wallet' }">收益钱包</RouterLink>
            <RouterLink :to="{ name: 'dev-wallet-releases' }">交付记录</RouterLink>
          </div>
        </section>
      </aside>
    </div>

    <PublishModal :visible="publishVisible" v-model:publishTitle="publishTitle"
      v-model:publishDescription="publishDescription" v-model:publishBudget="publishBudget"
      v-model:publishAcceptance="publishAcceptance" v-model:publishPaymentMode="publishPaymentMode"
      :allowPlatformGuarantee="false" :publishLoading="publishLoading" @close="closePublishModal"
      @submit="submitRequirementPublish" />

    <PublishModal :visible="editVisible" modalTitle="重新编辑需求" submitText="重新提交审核" loadingText="提交中..."
      v-model:publishTitle="editTitle" v-model:publishDescription="editDescription" v-model:publishBudget="editBudget"
      v-model:publishAcceptance="editAcceptance" v-model:publishPaymentMode="editPaymentMode"
      :publishLoading="editLoading" @close="closeEditModal" @submit="submitRequirementResubmit" />

    <RequirementConversationModal :visible="conversationVisible" :token="auth.token" :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirement_id ?? ''" :title="conversationRequirement?.title"
      @updated="applyConversationDetail" @close="closeConversation" />

    <Teleport to="body">
      <div v-if="securityVisible" class="modal-wrap modal-wrap--account-security" @click.self="closeSecurityModal">
        <section class="pay-modal account-security-modal" aria-label="账户安全设置弹窗">
          <div class="account-security-header">
            <div>
              <h3>账户安全</h3>
              <p>在这里修改用户名、绑定邮箱和登录密码。</p>
            </div>
            <button class="ghost small" type="button" @click="closeSecurityModal">关闭</button>
          </div>

          <div class="account-security-body">
            <section class="wallet-section account-security-section">
              <div class="wallet-header">
                <h3>修改用户名</h3>
              </div>
              <div class="profile-update-row">
                <input v-model="newUsername" type="text" placeholder="请输入新的用户名" :disabled="usernameLoading" />
                <button class="ghost small" type="button" :disabled="usernameLoading" @click="updateUsername">
                  {{ usernameLoading ? '保存中...' : '保存用户名' }}
                </button>
              </div>
            </section>

            <section class="wallet-section account-security-section">
              <div class="wallet-header">
                <h3>修改邮箱</h3>
                <small class="requirement-note">当前邮箱：{{ profileEmail || '未绑定邮箱' }}</small>
              </div>
              <div class="profile-update-row">
                <input v-model="newEmail" type="email" placeholder="请输入新的邮箱地址"
                  :disabled="emailLoading || emailCodeSending" />
                <button class="ghost small" type="button" :disabled="emailLoading || emailCodeSending"
                  @click="sendEmailVerificationCode">
                  {{ emailCodeSending ? '发送中...' : '发送验证码' }}
                </button>
              </div>
              <div class="profile-update-row">
                <input v-model="emailCode" type="text" maxlength="6" placeholder="请输入 6 位邮箱验证码"
                  :disabled="emailLoading" />
                <button class="ghost small" type="button" :disabled="emailLoading" @click="submitEmailChange">
                  {{ emailLoading ? '保存中...' : '保存邮箱' }}
                </button>
              </div>
            </section>

            <section class="wallet-section account-security-section">
              <div class="wallet-header">
                <h3>修改密码</h3>
                <small class="requirement-note">通过当前绑定邮箱验证码完成验证，并进行二次确认。</small>
              </div>
              <div class="profile-update-row">
                <input v-model="newPassword" type="password" placeholder="请输入新的密码，至少 6 位"
                  :disabled="passwordLoading || passwordCodeSending" />
                <button class="ghost small" type="button"
                  :disabled="passwordLoading || passwordCodeSending || !profileEmail"
                  @click="sendPasswordVerificationCode">
                  {{ passwordCodeSending ? '发送中...' : '发送验证码' }}
                </button>
              </div>
              <div class="profile-update-row profile-update-row--triple">
                <input v-model="confirmPassword" type="password" placeholder="请再次输入新密码" :disabled="passwordLoading" />
                <input v-model="passwordCode" type="text" maxlength="6" placeholder="请输入 6 位邮箱验证码"
                  :disabled="passwordLoading" />
                <button class="ghost small" type="button" :disabled="passwordLoading || !profileEmail"
                  @click="submitPasswordChange">
                  {{ passwordLoading ? '保存中...' : '保存密码' }}
                </button>
              </div>
            </section>

            <section class="wallet-section account-security-section">
              <div class="wallet-header">
                <h3>消息订阅</h3>
                <small class="requirement-note">订阅后，将按你的偏好接收相关通知。</small>
              </div>
              <div class="subscription-settings">
                <label class="subscription-card">
                  <div class="subscription-copy">
                    <strong>官方活动</strong>
                    <small class="requirement-note">接收官方公告、活动和运营消息。</small>
                  </div>
                  <span class="subscription-switch-wrap">
                    <input v-model="subscriptionOfficialActivity" class="subscription-switch-input" type="checkbox"
                      :disabled="subscriptionLoading" />
                    <span class="subscription-switch" aria-hidden="true">
                      <span class="subscription-switch__thumb"></span>
                    </span>
                  </span>
                </label>

                <div class="subscription-actions">
                  <button class="ghost small" type="button" :disabled="subscriptionLoading" @click="saveSubscriptions">
                    {{ subscriptionLoading ? '保存中...' : '保存订阅设置' }}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </Teleport>

    <div v-if="payVisible && payRequirement" class="modal-wrap" @click.self="closePayModal">
      <section class="pay-modal" aria-label="需求支付弹窗">
        <h3>支付{{ payStageLabel }}</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ payRequirement.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ payRequirement.requirement_id }}</p>
        <p class="pay-line"><strong>预算：</strong>{{ formatBudget(payRequirement.budget) }}</p>
        <p v-if="!isFinalPayment" class="pay-line"><strong>定金占比：</strong>{{ depositRatioPercent.toFixed(2) }}%</p>
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
      <section class="pay-modal comment-modal" aria-label="需求评论弹窗">
        <h3>评价需求</h3>
        <div class="comment-modal__meta">
          <p class="pay-line"><strong>需求标题</strong><span>{{ commentRequirement.title }}</span></p>
          <p class="pay-line"><strong>需求编号</strong><span>{{ commentRequirement.requirement_id }}</span></p>
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
          <button class="ghost" type="button" :disabled="commentLoading" @click="submitRequirementComment">
            {{ commentLoading ? '提交中...' : '提交评论' }}
          </button>
        </div>
      </section>
    </div>

  </main>
</template>

<style scoped>
.profile-page {
  display: grid;
  gap: 16px;
}

.overview-hero,
.overview-focus-panel,
.overview-panel,
.overview-stat-card {
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

.overview-hero {
  display: grid;
  gap: 22px;
  padding: 24px;
  border-radius: 22px;
}

.overview-hero__head,
.overview-hero__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
}

.overview-hero__head {
  align-items: start;
}

.overview-hero__identity {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.profile-avatar-button {
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 76px;
  height: 76px;
  overflow: hidden;
  border: 1px solid rgba(183, 201, 238, 0.95);
  border-radius: 50%;
  background: linear-gradient(135deg, #eef5ff, #ffffff);
  color: #1d4ed8;
  cursor: pointer;
  font-size: 28px;
  font-weight: 900;
  box-shadow: 0 10px 22px rgba(76, 103, 172, 0.12);
}

.profile-avatar-button:disabled {
  cursor: wait;
  opacity: 0.78;
}

.profile-avatar-button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-avatar-button small {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 5px 0;
  background: rgba(15, 23, 42, 0.72);
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.profile-avatar-input {
  display: none;
}

.overview-hero__body {
  align-items: end;
}

.overview-hero__head h1,
.overview-section-head h2 {
  margin: 0;
  color: #0f172a;
}

.overview-hero__head h1 {
  margin-top: 6px;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.1;
}

.overview-hero__head p:not(.overview-eyebrow) {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 18px;
  line-height: 1.5;
}

.overview-hero__main p:not(.overview-eyebrow) {
  margin: 0;
  max-width: 680px;
  color: #64748b;
  line-height: 1.7;
}

.overview-eyebrow {
  margin: 0;
  color: #4f8cff;
  font-size: 12px;
  font-weight: 800;
}

.overview-hero__chips,
.overview-hero__actions,
.overview-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.overview-hero__chips {
  margin-top: 16px;
}

.overview-hero__chips span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 6px 10px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 999px;
  background: #f8fbff;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.overview-hero__actions {
  justify-content: flex-end;
}

.overview-home-link {
  flex: 0 0 auto;
  align-self: start;
  padding: 9px 14px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  text-decoration: none;
  font-size: 13px;
  font-weight: 800;
}

.overview-home-link:hover {
  border-color: rgba(125, 155, 225, 0.9);
  background: #f8fbff;
  color: #1d4ed8;
}

.overview-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.overview-stat-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 18px;
  border-radius: 18px;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.overview-stat-card:hover {
  border-color: rgba(125, 155, 225, 0.92);
  box-shadow: 0 16px 34px rgba(76, 103, 172, 0.12);
  transform: translateY(-1px);
}

.overview-stat-card span,
.overview-stat-card small,
.overview-requirement-list span,
.overview-requirement-list time,
.overview-empty-state span,
.overview-service-card span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.overview-stat-card strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 34px;
  line-height: 1;
  text-overflow: ellipsis;
}

.overview-focus-panel,
.overview-panel {
  padding: 20px;
  border-radius: 22px;
}

.overview-section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.overview-section-head h2 {
  margin-top: 5px;
  font-size: 19px;
  line-height: 1.25;
}

.overview-section-head--compact {
  margin-bottom: 12px;
}

.overview-link {
  flex: 0 0 auto;
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.overview-link:hover {
  color: #1d4ed8;
}

.overview-service-card {
  width: 100%;
  border: 1px solid rgba(209, 220, 243, 0.95);
  background: #ffffff;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.overview-service-card:hover {
  border-color: rgba(125, 155, 225, 0.92);
  background: #f8fbff;
  box-shadow: 0 12px 24px rgba(76, 103, 172, 0.1);
}

.overview-service-card strong,
.overview-requirement-list strong,
.overview-empty-state strong {
  color: #0f172a;
  font-weight: 800;
}

.overview-dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.48fr) minmax(280px, 0.72fr);
  gap: 16px;
  align-items: start;
}

.overview-side-stack,
.overview-service-list,
.overview-dev-links {
  display: grid;
  gap: 12px;
}

.overview-requirement-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.overview-requirement-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 12px;
  align-items: center;
  min-height: 64px;
  padding: 12px 14px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 16px;
  background: #ffffff;
}

.overview-requirement-list li.clickable {
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.overview-requirement-list li.clickable:hover {
  border-color: rgba(125, 155, 225, 0.92);
  background: #f8fbff;
  box-shadow: 0 12px 24px rgba(76, 103, 172, 0.1);
}

.overview-requirement-list div {
  min-width: 0;
}

.overview-requirement-list strong,
.overview-requirement-list span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.overview-status--completed,
.overview-status--final_paid {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}

.overview-status--rejected {
  background: rgba(239, 68, 68, 0.12);
  color: #b42318;
}

.overview-status--deposit_paid,
.overview-status--in_development {
  background: rgba(79, 140, 255, 0.12);
  color: #1d4ed8;
}

.overview-service-card {
  display: grid;
  gap: 5px;
  padding: 14px;
  border-radius: 16px;
}

.overview-dev-links {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.overview-dev-links a {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 14px;
  background: #ffffff;
  color: #0f172a;
  text-decoration: none;
  font-size: 13px;
  font-weight: 800;
}

.overview-dev-links a:hover {
  border-color: rgba(125, 155, 225, 0.92);
  background: #f8fbff;
  color: #1d4ed8;
}

.overview-empty-state {
  display: grid;
  gap: 6px;
  padding: 18px;
  border: 1px dashed rgba(204, 214, 237, 0.98);
  border-radius: 16px;
  background: rgba(248, 251, 255, 0.82);
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

.conversation-card-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.conversation-card {
  display: grid;
  gap: 6px;
  min-height: 112px;
  padding: 14px 16px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 16px;
  background: #ffffff;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08);
}

.conversation-card:hover {
  border-color: rgba(75, 120, 225, 0.5);
  box-shadow: 0 14px 28px rgba(76, 103, 172, 0.12);
}

.conversation-card__title {
  color: #0f172a;
  font-weight: 800;
  line-height: 1.4;
}

.conversation-card__id,
.conversation-card__meta {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.subscription-settings {
  display: grid;
  gap: 12px;
}

.subscription-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid rgba(224, 232, 255, 0.96);
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08);
  cursor: pointer;
}

.subscription-card:hover {
  border-color: rgba(125, 155, 225, 0.9);
  background: #f8fbff;
}

.subscription-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.subscription-copy strong {
  color: #0f172a;
  font-size: 15px;
  font-weight: 800;
}

.subscription-switch-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.subscription-switch-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.subscription-switch-input:disabled {
  cursor: not-allowed;
}

.subscription-switch {
  width: 52px;
  height: 30px;
  border-radius: 999px;
  background: #e8eefb;
  border: 1px solid rgba(188, 208, 245, 0.95);
  box-shadow: inset 0 1px 2px rgba(76, 103, 172, 0.14);
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  display: inline-flex;
  align-items: center;
  padding: 3px;
}

.subscription-switch__thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffffff 0%, #f6d6cc 100%);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease, background 0.2s ease;
}

.subscription-switch-input:checked+.subscription-switch {
  background: linear-gradient(135deg, rgba(255, 146, 121, 0.9) 0%, rgba(255, 105, 79, 0.95) 100%);
  border-color: rgba(255, 168, 148, 0.9);
  box-shadow: 0 0 0 4px rgba(255, 122, 94, 0.14);
}

.subscription-switch-input:checked+.subscription-switch .subscription-switch__thumb {
  transform: translateX(22px);
  background: linear-gradient(180deg, #fff7f3 0%, #ffffff 100%);
}

.subscription-switch-input:focus-visible+.subscription-switch {
  outline: 2px solid rgba(255, 181, 164, 0.95);
  outline-offset: 2px;
}

.subscription-switch-input:disabled+.subscription-switch {
  opacity: 0.55;
}

.subscription-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1180px) {
  .overview-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-dashboard-grid {
    grid-template-columns: 1fr;
  }

  .overview-side-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

}

@media (max-width: 760px) {
  .overview-hero {
    padding: 20px;
  }

  .overview-hero__head,
  .overview-hero__body {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .overview-hero__actions {
    justify-content: flex-start;
  }

  .overview-home-link {
    width: 100%;
    text-align: center;
  }

  .overview-focus-panel,
  .overview-panel {
    padding: 16px;
  }

  .overview-section-head,
  .overview-inline-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .overview-inline-actions .ghost.small,
  .overview-link {
    width: 100%;
    text-align: center;
  }

  .overview-side-stack {
    grid-template-columns: 1fr;
  }

  .overview-requirement-list li {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .overview-requirement-list .overview-status,
  .overview-requirement-list small,
  .overview-requirement-list time {
    justify-self: start;
  }

  .overview-dev-links {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .overview-stat-grid {
    grid-template-columns: 1fr;
  }

  .overview-hero__actions .ghost.small {
    flex: 1 1 140px;
  }

  .subscription-card {
    align-items: flex-start;
  }
}

.realname-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid;
  transition: all 0.2s ease;
}

.realname-badge.clickable {
  cursor: pointer;
}

.realname-badge--approved {
  background: rgba(226, 248, 236, 0.96);
  border-color: rgba(138, 208, 167, 0.95);
  color: #137a4b;
}

.realname-badge--pending {
  background: rgba(255, 245, 205, 0.96);
  border-color: rgba(248, 207, 92, 0.92);
  color: #8a5a00;
}

.realname-badge--rejected {
  background: rgba(255, 234, 234, 0.98);
  border-color: rgba(239, 154, 154, 0.95);
  color: #b42318;
}

.realname-badge--rejected:hover {
  background: rgba(255, 226, 226, 1);
  border-color: rgba(224, 102, 102, 0.95);
}

.badge-icon {
  display: inline-block;
}

.badge-text {
  display: inline-block;
}
</style>
