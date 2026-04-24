<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import HomeHeroSection from '@/components/home/HomeHeroSection.vue'
import AppToast from '@/components/AppToast.vue'
import PublishModal from '@/components/PublishModal.vue'
import { buildDevPortalUrl } from '@/config/runtime'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { getMyRealnameVerification, type UserRealnameStatus } from '@/api/realname'
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
  completeRequirement as completeRequirementApi,
  commentRequirement as commentRequirementApi,
  listRequirements,
  requestRequirementFinalPayment as requestRequirementFinalPaymentApi,
  reviewRequirementResourceDelete as reviewRequirementResourceDeleteApi,
  resubmitRequirement as resubmitRequirementApi,
  updateRequirementSubscription as updateRequirementSubscriptionApi,
  updateRequirementResourceVisibility as updateRequirementResourceVisibilityApi,
  type RequirementItem,
  type RequirementPendingResourceVersionDeleteRequest,
  type RequirementResourceVisibility,
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
} from '@/api/settings'

const router = useRouter()
const auth = useAuthStore()
const menuOpen = ref(false)
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
const securityVisible = ref(false)
const editRequirement = ref<RequirementItem | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const editBudget = ref<string | number>('')
const editAcceptance = ref('')
const editLoading = ref(false)
const realnameStatus = ref<UserRealnameStatus | 'none' | ''>('')
const realnameLoading = ref(false)
const requirementSubscriptionLoadingId = ref<string | null>(null)
const resourceVisibilityLoadingId = ref<string | null>(null)
const resourceVersionDeleteReviewLoadingId = ref<string | null>(null)
const finalPaymentConfirmVisible = ref(false)
const finalPaymentConfirmTarget = ref<RequirementItem | null>(null)
const completionConfirmVisible = ref(false)
const completionConfirmTarget = ref<RequirementItem | null>(null)
const completionLoading = ref(false)
const expandedVersionDeleteReviewRequirementId = ref<string | null>(null)
const versionDeleteRejectTargetId = ref<number | null>(null)
const versionDeleteRejectNotes = ref<Record<number, string>>({})
const depositRatioPercent = ref(20)
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

const amountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'amount'))
const discountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'percent'))

function formatRange(item: CouponItem) {
  if (!item.starts_at && !item.ends_at) {
    return '永久有效'
  }

  const parts: string[] = []
  if (item.starts_at) {
    parts.push(`起始：${item.starts_at.replace('T', ' ')}`)
  }
  if (item.ends_at) {
    parts.push(`截止：${item.ends_at.replace('T', ' ')}`)
  }
  return parts.join('，')
}

function formatDiscount(item: CouponItem) {
  if (item.discount_type === 'amount') {
    return `减免 ¥${item.discount_value.toFixed(2)}`
  }
  return `折扣 ${item.discount_value.toFixed(1)}%${item.max_discount_cny != null ? `，上限 ¥${item.max_discount_cny.toFixed(2)}` : ''}`
}

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

function canPay(status: RequirementStatus) {
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
    return '尾款后可设置'
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
  if (!canPay(item.status)) {
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
    showToast('只有开发中的需求单才能结束开发并支付尾款', 'warning')
    return
  }

  if (publishedVersionCount(item) <= 0) {
    showToast('开发者至少发布一个资源版本后，才能结束开发并支付尾款', 'warning')
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
    showToast('请支付尾款', 'success')
    await loadMyRequirements()
    openPayModal(updated)
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
  editVisible.value = true
}

function openAuth(mode: 'login' | 'register') {
  router.push({ name: 'home', query: { modal: 'auth', mode } })
}

function toggleUserMenu() {
  menuOpen.value = !menuOpen.value
}

function closeUserMenu() {
  menuOpen.value = false
}

function goProfile() {
  closeUserMenu()
  router.push({ name: 'profile' })
}

function logout() {
  auth.logout()
  closeUserMenu()
  showToast('已退出登录', 'info')
  router.push({ name: 'home' })
}

function openRealnameEditModal() {
  if (realnameStatus.value === 'rejected') {
    router.push({ name: 'realname' })
  }
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

async function loadRealnameStatus() {
  if (!auth.token.trim()) {
    realnameStatus.value = ''
    return
  }

  realnameLoading.value = true
  try {
    const record = await getMyRealnameVerification(auth.token)
    realnameStatus.value = record.status
  } catch {
    realnameStatus.value = 'none'
  } finally {
    realnameLoading.value = false
  }
}

async function refreshProfileData() {
  await Promise.all([loadCoupons(), loadMyRequirements(), loadDepositRatio(), loadProfile(), loadRealnameStatus()])
  showToast('资料已刷新', 'success')
}

function handleRequirementAction(item: RequirementItem) {
  if (hasPendingResourceVersionDeleteReview(item)) {
    toggleVersionDeleteReviewCard(item)
    return
  }

  if (canPay(item.status)) {
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

async function loadProfile() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  try {
    const profile = await getProfile(auth.token)
    newUsername.value = profile.username
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
    showToast('需求必须在已付尾款后，才能设置资源为公开或私有', 'warning')
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
  if (!auth.isAuthed || !item || !hasPendingResourceVersionDeleteReview(item) || !request) {
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

const newUsername = ref('')
const usernameLoading = ref(false)
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

async function copyCouponCode(code: string) {
  const value = code.trim()
  if (!value) {
    showToast('券码为空，无法复制', 'error')
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    showToast('券码已复制', 'success')
  } catch {
    showToast('复制失败，请手动复制', 'error')
  }
}

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


onMounted(async () => {
  auth.hydrate()
  newUsername.value = auth.username
  await Promise.all([loadCoupons(), loadMyRequirements(), loadDepositRatio(), loadProfile(), loadRealnameStatus()])
})

const heroNavLinks = computed(() => {
  const links = [
    { label: '返回首页', to: { name: 'home' } },
    { label: '个人中心', to: { name: 'profile' }, active: true },
    { label: '我的工单', to: { name: 'tickets' } },
    { label: '我的定制资源', to: { name: 'my-custom-resources' } },
    { label: '开发者端', href: buildDevPortalUrl(auth.token) },
  ]

  return links
})
</script>

<template>
  <main class="page-shell custom-page-shell">
    <HomeHeroSection :isAuthed="auth.isAuthed" :username="auth.username" :menuOpen="menuOpen" :navLinks="heroNavLinks"
      @open-auth="openAuth" @toggle-user-menu="toggleUserMenu" @go-profile="goProfile" @logout="logout">
      <div class="hero-meta">
        <div class="hero">
          <h1>{{ auth.username ? `${auth.username} 的个人中心` : '个人中心' }}</h1>
          <p class="desc">管理你的账户、优惠券与需求单，统一使用页面布局标准。</p>
        </div>
        <div class="hero-actions">
          <div v-if="realnameStatus" class="realname-badge"
            :class="[`realname-badge--${realnameStatus}`, { clickable: realnameStatus === 'rejected' }]"
            @click="openRealnameEditModal">
            <span class="badge-icon">实名认证：</span>
            <span class="badge-text">
              {{ realnameStatus === 'approved' ? '已认证' : realnameStatus === 'pending' ? '审核中' : '已驳回' }}
            </span>
          </div>
          <button class="publish-btn" type="button" @click="openSecurityModal">账户安全</button>
          <button class="refresh-btn" type="button" :disabled="loading || requirementLoading"
            @click="refreshProfileData">
            {{ loading || requirementLoading ? '刷新中...' : '刷新资料' }}
          </button>
        </div>
      </div>
    </HomeHeroSection>

    <div class="wallet-overview">
      <div class="wallet-card summary-card">
        <strong>{{ amountCoupons.length }}</strong>
        <span>优惠卷</span>
      </div>
      <div class="wallet-card summary-card">
        <strong>{{ discountCoupons.length }}</strong>
        <span>折扣券</span>
      </div>
    </div>

    <section class="wallet-section">
      <div class="wallet-header">
        <h3>我提交的需求单</h3>
        <button class="ghost small" type="button" :disabled="requirementLoading" @click="loadMyRequirements">
          {{ requirementLoading ? '刷新中...' : '刷新' }}
        </button>
      </div>
      <div v-if="myRequirements.length === 0" class="empty">暂无已提交需求单</div>
      <ul v-else class="requirement-list">
        <template v-for="item in myRequirements" :key="item.requirement_id">
          <li class="requirement-row"
            :class="{ clickable: hasPendingResourceVersionDeleteReview(item) || canPay(item.status) || canComplete(item) || canComment(item.status) || canResubmit(item.status), expanded: isVersionDeleteReviewExpanded(item) }"
            @click="handleRequirementAction(item)">
            <div class="requirement-main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.requirement_id }}</span>
              <small v-if="hasBoundResource(item)" class="requirement-resource-visibility">{{
                formatResourceVisibility(item) }}</small>
              <small v-if="hasBoundResource(item)" class="requirement-note">已发布版本：{{ publishedVersionCount(item)
                }}</small>
              <small v-if="hasBoundResource(item) && !canToggleRequirementResourceVisibility(item)"
                class="requirement-note">资源公开/私有切换需在已付尾款后开放</small>
              <small v-if="hasPendingResourceVersionDeleteReview(item)" class="requirement-note">
                <strong>待审核删除版本：</strong>
                <span
                  style="display: inline-flex; align-items: center; margin-left: 6px; padding: 2px 10px; border-radius: 999px; background: rgba(255,255,255,0.14); font-weight: 700; color: #fff;">
                  {{ pendingResourceVersionDeleteRequests(item).length }} 个待审核
                </span>
                <span style="margin-left: 8px; opacity: 0.8;">共 {{ pendingResourceVersionDeleteRequests(item).length
                  }} 个</span>
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
                class="requirement-note">开发者至少发布 1 个版本后，用户才能结束开发并支付尾款</small>
              <small v-if="item.status === 'rejected' && item.review_note" class="requirement-note">驳回原因：{{
                item.review_note }}</small>
              <small class="requirement-note">{{ item.subscribe_status_change ? '已订阅该需求的状态变化通知' : '未订阅该需求的状态变化通知'
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
              <button v-if="canRequestFinalPayment(item)" class="ghost small" type="button"
                @click.stop="requestFinalPayment(item)">支付尾款</button>
              <button v-if="canComplete(item)" class="ghost small" type="button"
                @click.stop="openCompletionConfirm(item)">确认完成</button>
              <button v-if="canResubmit(item.status)" class="ghost small" type="button"
                @click.stop="openRequirementEditModal(item)">重新编辑</button>
              <button v-else-if="canPay(item.status)" class="ghost small" type="button"
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
                        {{ resourceVersionDeleteReviewLoadingId === item.requirement_id ? '处理中...' : '同意删除' }}
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
                      <small class="requirement-note">已输入 {{ pendingVersionRejectNote(request).length }} / 500
                        字</small>
                    </label>
                    <div class="requirement-review-card__actions">
                      <button class="ghost small" type="button" @click.stop="cancelRejectVersion">取消</button>
                      <button class="ghost small" type="button"
                        :disabled="resourceVersionDeleteReviewLoadingId === item.requirement_id"
                        @click.stop="submitVersionDeleteReview(item, request, 'reject')">
                        {{ resourceVersionDeleteReviewLoadingId === item.requirement_id ? '处理中...' : '确认拒绝删除' }}
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
      v-model:publishAcceptance="editAcceptance" :publishLoading="editLoading" @close="closeEditModal"
      @submit="submitRequirementResubmit" />

    <div v-if="securityVisible" class="modal-wrap" @click.self="closeSecurityModal">
      <section class="pay-modal account-security-modal" aria-label="账户安全设置弹窗">
        <div class="account-security-header">
          <div>
            <h3>账户安全</h3>
            <p>在这里修改用户名、绑定邮箱和登录密码。</p>
          </div>
          <button class="ghost small" type="button" @click="closeSecurityModal">关闭</button>
        </div>

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
            <input v-model="emailCode" type="text" maxlength="6" placeholder="请输入 6 位邮箱验证码" :disabled="emailLoading" />
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
              :disabled="passwordLoading || passwordCodeSending || !profileEmail" @click="sendPasswordVerificationCode">
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
      </section>
    </div>

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
        <h3>确认进入尾款支付</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ finalPaymentConfirmTarget.title }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ finalPaymentConfirmTarget.requirement_id }}</p>
        <p class="tip">确认后会将当前需求推进到待付尾款，并立即进入支付流程。</p>

        <div class="actions">
          <button class="ghost" type="button" @click="closeFinalPaymentConfirm">取消</button>
          <button class="ghost" type="button" @click="confirmFinalPaymentRequest">确认进入尾款支付</button>
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

    <section class="wallet-section">
      <div class="wallet-header">
        <h3>优惠卷背包</h3>
        <button class="ghost small" type="button" :disabled="loading" @click="loadCoupons">
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
      </div>
      <div v-if="amountCoupons.length === 0" class="empty">暂无优惠卷</div>
      <div v-else class="coupon-items">
        <button v-for="item in amountCoupons" :key="item.code" type="button" class="coupon-item"
          @click="copyCouponCode(item.code)">
          <div class="coupon-head">
            <strong>{{ item.code }}</strong>
            <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用' }}</span>
          </div>
          <small>{{ item.name }}</small>
          <p>{{ formatDiscount(item) }}</p>
          <p class="coupon-meta">门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}</p>
        </button>
      </div>
    </section>

    <section class="wallet-section">
      <div class="wallet-header">
        <h3>折扣券背包</h3>
        <button class="ghost small" type="button" :disabled="loading" @click="loadCoupons">
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
      </div>
      <div v-if="discountCoupons.length === 0" class="empty">暂无折扣券</div>
      <div v-else class="coupon-items">
        <button v-for="item in discountCoupons" :key="item.code" type="button" class="coupon-item"
          @click="copyCouponCode(item.code)">
          <div class="coupon-head">
            <strong>{{ item.code }}</strong>
            <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用' }}</span>
          </div>
          <small>{{ item.name }}</small>
          <p>{{ formatDiscount(item) }}</p>
          <p class="coupon-meta">门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}</p>
        </button>
      </div>
    </section>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>

<style scoped>
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
}

.subscription-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
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
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.28);
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

@media (max-width: 640px) {
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
  background: rgba(149, 213, 178, 0.18);
  border-color: rgba(149, 213, 178, 0.6);
  color: #a8ffe8;
}

.realname-badge--pending {
  background: rgba(255, 225, 139, 0.18);
  border-color: rgba(255, 225, 139, 0.6);
  color: #fff9d6;
}

.realname-badge--rejected {
  background: rgba(255, 145, 145, 0.18);
  border-color: rgba(255, 145, 145, 0.6);
  color: #ffcccc;
}

.realname-badge--rejected:hover {
  background: rgba(255, 145, 145, 0.28);
  border-color: rgba(255, 145, 145, 0.8);
}

.badge-icon {
  display: inline-block;
}

.badge-text {
  display: inline-block;
}
</style>
