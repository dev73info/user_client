<script setup lang="ts">
import {
  TButton,
  TIcon,
  Aim,
  Box,
  Check,
  Close,
  Compass,
  Document,
  EditPen,
  Files,
  Refresh,
  Suitcase,
  Tickets,
  Wallet,
} from 'ui_73info'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PublishModal from '@/components/PublishModal.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import WechatAuthorizationModal from '@/components/WechatAuthorizationModal.vue'
import {
  getUnionPaymentAuthorizeUrl,
  isUnionPaymentAuthorizationRequired,
  isWechatPaymentAuthorizationRequired,
} from '@/api/auth'
import { HttpError, apiUrl } from '@/api/http'
import { getMyRealnameVerification } from '@/api/realname'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import {
  createAdapayPayment,
  getAdapayPayment,
  getAdapayClientPlatform,
  type AdapayBusinessPayChannel,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import {
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
  uploadProfileAvatar,
} from '@/api/settings'
import { validateRequirementRichText } from '@/utils/requirementRichText'
import { dispatchProfileAvatarUpdated } from '@/shared/profileEvents'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const loading = ref(false)
const coupons = ref<CouponItem[]>([])
const requirementLoading = ref(false)
const myRequirements = ref<RequirementItem[]>([])
const contractSigningStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const payVisible = ref(false)
const payRequirement = ref<RequirementItem | null>(null)
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
const editVisible = ref(false)
const publishVisible = ref(false)
const editRequirement = ref<RequirementItem | null>(null)
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
const publishLoading = ref(false)
const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const editModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const editBudget = ref<string | number>('')
const editAcceptance = ref('')
const editPaymentMode = ref<RequirementPaymentMode>('self_managed')
const editLoading = ref(false)
const finalPaymentConfirmVisible = ref(false)
const finalPaymentConfirmTarget = ref<RequirementItem | null>(null)
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
const depositRatioPercent = ref(20)
const { showToast } = useToast()
const failedProfileAvatarUrls = ref<Set<string>>(new Set())

const avatarCropDefaultFrameSize = 320
const avatarCropOutputSize = 512
const avatarCropMaxSourceSize = 8 * 1024 * 1024
const avatarCropMaxUploadSize = 2 * 1024 * 1024

type ProfileAvatarCropOffset = {
  left: number
  top: number
}

type ProfileAvatarCropDragStart = {
  pointerId: number
  clientLeft: number
  clientTop: number
  offsetLeft: number
  offsetTop: number
}

const conversationCards = computed(() => myRequirements.value.filter((item) => {
  if (!hasBoundResource(item)) {
    return false
  }

  return requirementConversationMap.value[item.requirement_id]?.status !== 'closed'
}))
const availableConversationCount = computed(() => conversationCards.value.length)
const usableCouponCount = computed(() => coupons.value.filter((item) => item.status !== 'used').length)
const accountEmailLabel = computed(() => profileEmail.value || '未绑定邮箱')
const profileAvatarSrc = computed(() => {
  const avatarUrl = profileAvatarUrl.value.trim()
  if (!avatarUrl || failedProfileAvatarUrls.value.has(avatarUrl)) {
    return ''
  }

  const src = apiUrl(avatarUrl)
  if (!profileAvatarCacheKey.value) {
    return src
  }

  return `${src}${src.includes('?') ? '&' : '?'}v=${profileAvatarCacheKey.value}`
})
const profileInitial = computed(() => Array.from(auth.username || '用')[0] ?? '用')
const timeGreeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了，注意休息'
  if (hour < 11) return '早上好，开启美好的一天'
  if (hour < 14) return '中午好，记得按时吃饭'
  if (hour < 18) return '下午好，继续加油'
  if (hour < 23) return '晚上好，辛苦了'
  return '夜深了，早点休息'
})
const profileAvatarCropMaxScale = computed(() => profileAvatarCropMinScale.value * 3)
const profileAvatarCropZoomPercent = computed(() =>
  Math.round((profileAvatarCropScale.value / Math.max(profileAvatarCropMinScale.value, 0.001)) * 100),
)
const profileAvatarCropImageStyle = computed(() => {
  const frameSize = profileAvatarCropFrameSize.value
  const imageWidth = profileAvatarCropImageWidth.value * profileAvatarCropScale.value
  const imageHeight = profileAvatarCropImageHeight.value * profileAvatarCropScale.value
  const imageLeft = (frameSize - imageWidth) / 2 + profileAvatarCropOffset.value.left
  const imageTop = (frameSize - imageHeight) / 2 + profileAvatarCropOffset.value.top

  return {
    width: `${imageWidth}px`,
    height: `${imageHeight}px`,
    transform: `translate(${imageLeft}px, ${imageTop}px)`,
  }
})
const subscriptionLabel = computed(() => (subscriptionOfficialActivity.value ? '已订阅' : '未订阅'))
const requirementStats = computed(() => ({
  total: myRequirements.value.length,
  pending: myRequirements.value.filter((item) => item.status === 'pending_review' || item.status === 'pending_deposit').length,
  active: myRequirements.value.filter((item) => item.status === 'deposit_paid' || item.status === 'in_development' || item.status === 'pending_final' || item.status === 'pending_settlement').length,
  payment: myRequirements.value.filter((item) => canPay(item.status, item)).length,
  completed: myRequirements.value.filter((item) => item.status === 'completed').length,
}))
const sortedRequirements = computed(() =>
  [...myRequirements.value].sort((left, right) => requirementTimeValue(right.updated_at) - requirementTimeValue(left.updated_at)),
)
const actionableRequirements = computed(() =>
  sortedRequirements.value
    .filter((item) => hasPendingResourceVersionDeleteReview(item) || canRequestFinalPayment(item) || canPay(item.status, item) || canResubmit(item.status) || canComment(item.status))
    .slice(0, 4),
)
const recentRequirements = computed(() => sortedRequirements.value.slice(0, 5))
const recentConversationCards = computed(() =>
  [...conversationCards.value]
    .sort((left, right) => conversationTimeValue(right) - conversationTimeValue(left))
    .slice(0, 3),
)

/** 状态文案走全站统一口径；`deposit_paid` 一码两义，拿到支付模式就传进去（见 `requirementStatusLabel`）。 */
function formatRequirementStatus(status: RequirementStatus, paymentMode?: RequirementPaymentMode) {
  return requirementStatusLabel(status, paymentMode)
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

function formatRequirementDisplayStatus(item: RequirementItem) {
  if (isSelfManagedRequirement(item) || item.status !== 'pending_deposit') {
    return formatRequirementStatus(item.status, item.payment_mode)
  }
  if (item.bound_resource_id == null) {
    return '待开发者接单'
  }

  const status = contractSigningStatusMap.value[item.requirement_id]
  return status?.has_contract && status.party_a_signed && status.party_b_signed
    ? '待付定金'
    : '待签合同'
}

function isRequirementContractSigned(item: RequirementItem) {
  const status = contractSigningStatusMap.value[item.requirement_id]
  return Boolean(status?.has_contract && status.party_a_signed && status.party_b_signed)
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
  if (item && !isRequirementContractSigned(item)) {
    return false
  }

  return status === 'pending_deposit' || status === 'pending_final'
}

function publishedVersionCount(item: RequirementItem) {
  return item.bound_resource_version_count ?? 0
}

function canRequestFinalPayment(item: RequirementItem) {
  return hasBoundResource(item) && item.status === 'in_development' && publishedVersionCount(item) > 0
}

function canResubmit(status: RequirementStatus) {
  // 与后端一致：被驳回的需求改完可以再提；过审后撤回（已取消）的需求同样保留着，也能改完重新提交审核。
  return status === 'rejected' || status === 'cancelled'
}

function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
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

  try {
    const conversations = await listRequirementConversations(auth.token)
    requirementConversationMap.value = Object.fromEntries(
      conversations.map((item) => [item.requirement_id, item]),
    )
  } catch (error) {
    requirementConversationMap.value = {}
    showToast(error instanceof Error ? error.message : '加载沟通会话失败', 'error')
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

function updatePayChannel(channel: AdapayBusinessPayChannel) {
  if (payChannel.value === channel) {
    return
  }
  payChannel.value = channel
  currentPayment.value = null
}

function closeFinalPaymentConfirm() {
  finalPaymentConfirmVisible.value = false
  finalPaymentConfirmTarget.value = null
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

function publishRedirectTarget() {
  return router.resolve({
    name: 'workbench',
    query: { ...route.query, modal: 'publish' },
  }).fullPath
}

async function ensurePublishRealnameApproved() {
  const redirectTarget = publishRedirectTarget()
  auth.hydrate()
  if (!auth.isAuthed) {
    showToast('发布需求前请先登录', 'info')
    void router.push({
      name: 'home',
      query: { modal: 'auth', mode: 'login', redirect_to: redirectTarget },
    })
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
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      showToast('发布需求前请先完成实名认证', 'warning')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: redirectTarget },
      })
      return false
    }

    showToast(error instanceof Error ? error.message : '实名认证状态校验失败', 'error')
    return false
  }
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

/** 需求详情浮层已去掉：需求正文在需求详情里看（会话标题栏的「需求详情」抽屉、开发者需求详情页），
    这里只跳到「我的需求」列表。 */
function handleRequirementAction(item: RequirementItem) {
  void router.push({ name: 'workbench-requirements' })
}

function openProfileAvatarPicker() {
  if (profileAvatarUploading.value) {
    return
  }

  profileAvatarInput.value?.click()
}

function handleProfileAvatarChange(event: Event) {
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

  if (file.size > avatarCropMaxSourceSize) {
    showToast('原图请控制在 8MB 以内', 'warning')
    if (input) input.value = ''
    return
  }

  openProfileAvatarCrop(file)
  if (input) input.value = ''
}

function handleProfileAvatarError() {
  const avatarUrl = profileAvatarUrl.value.trim()
  if (!avatarUrl) return

  const next = new Set(failedProfileAvatarUrls.value)
  next.add(avatarUrl)
  failedProfileAvatarUrls.value = next
}

function openProfileAvatarCrop(file: File) {
  resetProfileAvatarCrop()
  profileAvatarCropFile.value = file
  profileAvatarCropImageUrl.value = URL.createObjectURL(file)
  profileAvatarCropVisible.value = true
  void nextTick(() => measureProfileAvatarCropFrame())
}

function resetProfileAvatarCrop() {
  if (profileAvatarCropImageUrl.value) {
    URL.revokeObjectURL(profileAvatarCropImageUrl.value)
  }

  profileAvatarCropVisible.value = false
  profileAvatarCropFile.value = null
  profileAvatarCropImageUrl.value = ''
  profileAvatarCropImage.value = null
  profileAvatarCropImageWidth.value = 0
  profileAvatarCropImageHeight.value = 0
  profileAvatarCropMinScale.value = 1
  profileAvatarCropScale.value = 1
  profileAvatarCropOffset.value = { left: 0, top: 0 }
  profileAvatarCropDragStart.value = null
  profileAvatarCropDragging.value = false
}

function closeProfileAvatarCrop() {
  if (profileAvatarUploading.value) {
    return
  }

  resetProfileAvatarCrop()
}

function handleProfileAvatarCropImageLoad(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image?.naturalWidth || !image.naturalHeight) {
    showToast('无法读取头像图片', 'error')
    resetProfileAvatarCrop()
    return
  }

  profileAvatarCropImage.value = image
  profileAvatarCropImageWidth.value = image.naturalWidth
  profileAvatarCropImageHeight.value = image.naturalHeight
  resetProfileAvatarCropFrame()
}

function measureProfileAvatarCropFrame() {
  const frameWidth = profileAvatarCropFrame.value?.clientWidth ?? avatarCropDefaultFrameSize
  profileAvatarCropFrameSize.value = frameWidth > 0 ? frameWidth : avatarCropDefaultFrameSize
}

function resetProfileAvatarCropFrame() {
  measureProfileAvatarCropFrame()

  const shortestSide = Math.min(profileAvatarCropImageWidth.value, profileAvatarCropImageHeight.value)
  if (shortestSide <= 0) {
    return
  }

  profileAvatarCropMinScale.value = profileAvatarCropFrameSize.value / shortestSide
  profileAvatarCropScale.value = profileAvatarCropMinScale.value
  profileAvatarCropOffset.value = { left: 0, top: 0 }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampProfileAvatarCropOffsetValue(nextOffset: ProfileAvatarCropOffset) {
  const frameSize = profileAvatarCropFrameSize.value
  const imageWidth = profileAvatarCropImageWidth.value * profileAvatarCropScale.value
  const imageHeight = profileAvatarCropImageHeight.value * profileAvatarCropScale.value
  const horizontalLimit = Math.max(0, (imageWidth - frameSize) / 2)
  const verticalLimit = Math.max(0, (imageHeight - frameSize) / 2)

  return {
    left: clampNumber(nextOffset.left, -horizontalLimit, horizontalLimit),
    top: clampNumber(nextOffset.top, -verticalLimit, verticalLimit),
  }
}

function clampProfileAvatarCropOffset() {
  profileAvatarCropOffset.value = clampProfileAvatarCropOffsetValue(profileAvatarCropOffset.value)
}

function setProfileAvatarCropScale(nextScale: number, focus?: ProfileAvatarCropOffset) {
  if (!profileAvatarCropImage.value) {
    return
  }

  const frameSize = profileAvatarCropFrameSize.value
  const oldScale = profileAvatarCropScale.value
  const clampedScale = clampNumber(nextScale, profileAvatarCropMinScale.value, profileAvatarCropMaxScale.value)
  const focusPoint = focus ?? { left: frameSize / 2, top: frameSize / 2 }

  if (Math.abs(clampedScale - oldScale) < 0.0001) {
    return
  }

  const oldImageWidth = profileAvatarCropImageWidth.value * oldScale
  const oldImageHeight = profileAvatarCropImageHeight.value * oldScale
  const oldImageLeft = (frameSize - oldImageWidth) / 2 + profileAvatarCropOffset.value.left
  const oldImageTop = (frameSize - oldImageHeight) / 2 + profileAvatarCropOffset.value.top
  const sourceLeft = (focusPoint.left - oldImageLeft) / oldScale
  const sourceTop = (focusPoint.top - oldImageTop) / oldScale
  const newImageWidth = profileAvatarCropImageWidth.value * clampedScale
  const newImageHeight = profileAvatarCropImageHeight.value * clampedScale
  const newImageLeft = focusPoint.left - sourceLeft * clampedScale
  const newImageTop = focusPoint.top - sourceTop * clampedScale

  profileAvatarCropScale.value = clampedScale
  profileAvatarCropOffset.value = clampProfileAvatarCropOffsetValue({
    left: newImageLeft - (frameSize - newImageWidth) / 2,
    top: newImageTop - (frameSize - newImageHeight) / 2,
  })
}

function handleProfileAvatarCropWheel(event: WheelEvent) {
  if (!profileAvatarCropImage.value || profileAvatarUploading.value) {
    return
  }

  const frame = profileAvatarCropFrame.value
  if (!frame) {
    return
  }

  const wheelDelta =
    event.deltaMode === 1
      ? event.deltaY * 16
      : event.deltaMode === 2
        ? event.deltaY * profileAvatarCropFrameSize.value
        : event.deltaY
  const zoomFactor = Math.exp(-wheelDelta * 0.0015)
  const rect = frame.getBoundingClientRect()

  setProfileAvatarCropScale(profileAvatarCropScale.value * zoomFactor, {
    left: event.clientX - rect.left,
    top: event.clientY - rect.top,
  })
}

function handleProfileAvatarCropPointerDown(event: PointerEvent) {
  if (!profileAvatarCropImage.value) {
    return
  }

  event.preventDefault()
  profileAvatarCropDragging.value = true
  profileAvatarCropDragStart.value = {
    pointerId: event.pointerId,
    clientLeft: event.clientX,
    clientTop: event.clientY,
    offsetLeft: profileAvatarCropOffset.value.left,
    offsetTop: profileAvatarCropOffset.value.top,
  }
  const stage = event.currentTarget as HTMLElement
  stage.setPointerCapture(event.pointerId)
}

function handleProfileAvatarCropPointerMove(event: PointerEvent) {
  const dragStart = profileAvatarCropDragStart.value
  if (!dragStart || dragStart.pointerId !== event.pointerId) {
    return
  }

  const nextOffset = {
    left: dragStart.offsetLeft + event.clientX - dragStart.clientLeft,
    top: dragStart.offsetTop + event.clientY - dragStart.clientTop,
  }
  profileAvatarCropOffset.value = clampProfileAvatarCropOffsetValue(nextOffset)
}

function stopProfileAvatarCropDrag(event: PointerEvent) {
  const dragStart = profileAvatarCropDragStart.value
  if (!dragStart || dragStart.pointerId !== event.pointerId) {
    return
  }

  const target = event.currentTarget as HTMLElement | null
  if (target?.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }
  profileAvatarCropDragStart.value = null
  profileAvatarCropDragging.value = false
}

function handleProfileAvatarCropResize() {
  if (!profileAvatarCropVisible.value || !profileAvatarCropImage.value) {
    return
  }

  const previousMinScale = Math.max(profileAvatarCropMinScale.value, 0.001)
  const zoomRatio = profileAvatarCropScale.value / previousMinScale
  measureProfileAvatarCropFrame()

  const shortestSide = Math.min(profileAvatarCropImageWidth.value, profileAvatarCropImageHeight.value)
  if (shortestSide <= 0) {
    return
  }

  profileAvatarCropMinScale.value = profileAvatarCropFrameSize.value / shortestSide
  profileAvatarCropScale.value = clampNumber(
    profileAvatarCropMinScale.value * zoomRatio,
    profileAvatarCropMinScale.value,
    profileAvatarCropMaxScale.value,
  )
  clampProfileAvatarCropOffset()
}

function profileAvatarCropOutputName(file: File) {
  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'avatar'
  return `${baseName}-cropped.jpg`
}

async function createCroppedProfileAvatarFile() {
  const sourceFile = profileAvatarCropFile.value
  const image = profileAvatarCropImage.value
  if (!sourceFile || !image) {
    throw new Error('请先选择头像图片')
  }

  const frameSize = profileAvatarCropFrameSize.value
  const imageWidth = profileAvatarCropImageWidth.value * profileAvatarCropScale.value
  const imageHeight = profileAvatarCropImageHeight.value * profileAvatarCropScale.value
  const imageLeft = (frameSize - imageWidth) / 2 + profileAvatarCropOffset.value.left
  const imageTop = (frameSize - imageHeight) / 2 + profileAvatarCropOffset.value.top
  const sourceSize = frameSize / profileAvatarCropScale.value
  const maxSourceLeft = Math.max(0, profileAvatarCropImageWidth.value - sourceSize)
  const maxSourceTop = Math.max(0, profileAvatarCropImageHeight.value - sourceSize)
  const sourceLeft = clampNumber(-imageLeft / profileAvatarCropScale.value, 0, maxSourceLeft)
  const sourceTop = clampNumber(-imageTop / profileAvatarCropScale.value, 0, maxSourceTop)
  const canvas = document.createElement('canvas')
  canvas.width = avatarCropOutputSize
  canvas.height = avatarCropOutputSize

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法生成裁剪图片')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    image,
    sourceLeft,
    sourceTop,
    sourceSize,
    sourceSize,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blobValue) => {
        if (blobValue) {
          resolve(blobValue)
          return
        }

        reject(new Error('生成裁剪图片失败'))
      },
      'image/jpeg',
      0.9,
    )
  })

  return new File([blob], profileAvatarCropOutputName(sourceFile), {
    type: blob.type || 'image/jpeg',
    lastModified: Date.now(),
  })
}

async function submitProfileAvatarCrop() {
  if (!auth.isAuthed) {
    showToast('请先登录后上传头像', 'error')
    return
  }

  if (profileAvatarUploading.value) {
    return
  }

  profileAvatarUploading.value = true
  try {
    const file = await createCroppedProfileAvatarFile()
    if (file.size > avatarCropMaxUploadSize) {
      showToast('裁剪后图片仍超过 2MB，请缩小图片后重试', 'warning')
      return
    }

    const profile = await uploadProfileAvatar(auth.token, file)
    const nextAvatarUrl = profile.avatar_url ?? ''
    if (nextAvatarUrl) {
      const nextFailedUrls = new Set(failedProfileAvatarUrls.value)
      nextFailedUrls.delete(nextAvatarUrl)
      failedProfileAvatarUrls.value = nextFailedUrls
    }
    profileAvatarUrl.value = nextAvatarUrl
    profileAvatarCacheKey.value = Date.now()
    dispatchProfileAvatarUpdated()
    showToast('头像已更新', 'success')
    resetProfileAvatarCrop()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '上传头像失败', 'error')
  } finally {
    profileAvatarUploading.value = false
  }
}

async function loadProfile() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  try {
    const profile = await getProfile(auth.token)
    profileAvatarUrl.value = profile.avatar_url ?? ''
    profileEmail.value = profile.email ?? ''
    subscriptionOfficialActivity.value = Boolean(profile.subscribe_official_activity)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载个人资料失败', 'error')
  }
}

function closePayModal() {
  payVisible.value = false
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

function clearPublishModalQuery() {
  if (route.query.modal !== 'publish') {
    return
  }

  const nextQuery = { ...route.query }
  delete nextQuery.modal
  void router.replace({ query: nextQuery })
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

  if (Number.isNaN(budget) || budget < 0) {
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

    showToast('需求已发布', 'success')
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

const profileAvatarUrl = ref('')
const profileAvatarCacheKey = ref(0)
const profileAvatarInput = ref<HTMLInputElement | null>(null)
const profileAvatarUploading = ref(false)
const profileAvatarCropVisible = ref(false)
const profileAvatarCropFile = ref<File | null>(null)
const profileAvatarCropImageUrl = ref('')
const profileAvatarCropImage = ref<HTMLImageElement | null>(null)
const profileAvatarCropFrame = ref<HTMLDivElement | null>(null)
const profileAvatarCropFrameSize = ref(avatarCropDefaultFrameSize)
const profileAvatarCropImageWidth = ref(0)
const profileAvatarCropImageHeight = ref(0)
const profileAvatarCropMinScale = ref(1)
const profileAvatarCropScale = ref(1)
const profileAvatarCropOffset = ref<ProfileAvatarCropOffset>({ left: 0, top: 0 })
const profileAvatarCropDragStart = ref<ProfileAvatarCropDragStart | null>(null)
const profileAvatarCropDragging = ref(false)
const profileEmail = ref('')
const subscriptionOfficialActivity = ref(false)

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
    // 不截断：这一页的「待办」「可操作需求」与统计都由这份列表算出来，
    // 此前 `slice(0, 20)` 会让需求多的账号漏掉第 21 条起的全部待办。
    // 展示侧仍有各自的 slice（最近需求 5 条等），取数与展示不再混为一谈。
    // ponytail: 下方合同签署状态按条发起，请求数随需求数线性增长；
    // 上限的真正解法是服务端分页 + 批量状态接口。
    myRequirements.value = rows
    const guaranteedRows = myRequirements.value.filter((item) => !isSelfManagedRequirement(item))
    const entries = await Promise.allSettled(
      guaranteedRows.map((item) =>
        fetchContractSigningStatus(auth.token, item.requirement_id).then((status) => ({
          requirementId: item.requirement_id,
          status,
        })),
      ),
    )
    const statusMap: Record<string, ContractSigningStatus | null> = {}
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        statusMap[entry.value.requirementId] = entry.value.status
      }
    }
    contractSigningStatusMap.value = statusMap
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


onMounted(async () => {
  window.addEventListener('resize', handleProfileAvatarCropResize)
  auth.hydrate()
  await Promise.all([
    loadCoupons(),
    loadMyRequirements(),
    loadRequirementConversations(),
    loadDepositRatio(),
    loadProfile(),
  ])

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
    if (value === 'publish' && !publishVisible.value) {
      forceClosePublishModal()
      publishVisible.value = true
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  profileAvatarCacheKey.value = Date.now()
  window.removeEventListener('resize', handleProfileAvatarCropResize)
  resetProfileAvatarCrop()
})

</script>

<template>
  <main id="overview" class="page-shell custom-page-shell profile-page">
    <!-- 顶部读数条：沿用「我的需求」等菜单页的 .wb-strip 形状（四格读数 + 页面级刷新），
         放在头像卡上方作为页面第一条读数带；≤900px 时整条被 WorkbenchBarSlot 搬进工作台顶栏 -->
    <WorkbenchBarSlot>
      <nav class="wb-strip overview-strip" aria-label="工作台关键数据">
        <RouterLink class="wb-strip__item" :to="{ name: 'workbench-requirements' }" title="全部需求">
          <span class="wb-strip__label">需求</span>
          <span class="wb-strip__value">{{ requirementStats.total }}</span>
        </RouterLink>
        <div class="wb-strip__divider" />
        <RouterLink class="wb-strip__item" :to="{ name: 'workbench-requirements' }" title="待处理的需求">
          <span class="wb-strip__label">待处理</span>
          <span class="wb-strip__value">{{ actionableRequirements.length }}</span>
        </RouterLink>
        <div class="wb-strip__divider" />
        <RouterLink class="wb-strip__item" :to="{ name: 'workbench-messages' }" title="沟通会话">
          <span class="wb-strip__label">会话</span>
          <span class="wb-strip__value">{{ availableConversationCount }}</span>
        </RouterLink>
        <div class="wb-strip__divider" />
        <RouterLink class="wb-strip__item" :to="{ name: 'workbench-account' }" title="可用优惠券">
          <span class="wb-strip__label">可用券</span>
          <span class="wb-strip__value">{{ usableCouponCount }}</span>
        </RouterLink>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading || requirementLoading" aria-label="刷新" title="刷新"
            @click="refreshProfileData">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </nav>
    </WorkbenchBarSlot>

    <section class="overview-hero">
      <div class="overview-hero__head">
        <div class="overview-hero__identity">
          <button class="profile-avatar-button" type="button" :disabled="profileAvatarUploading"
            @click="openProfileAvatarPicker">
            <img v-if="profileAvatarSrc" :src="profileAvatarSrc" alt="用户头像" @error="handleProfileAvatarError" />
            <span v-else>{{ profileInitial }}</span>
            <small>{{ profileAvatarUploading ? '上传中' : '更换' }}</small>
          </button>
          <input ref="profileAvatarInput" class="profile-avatar-input" type="file"
            accept="image/png,image/jpeg,image/webp,image/gif" @change="handleProfileAvatarChange" />
          <div>
            <h1>
              <RouterLink v-if="auth.username" class="overview-hero__name-link"
                :to="{ name: 'dev-profile', params: { username: auth.username } }">{{ auth.username }}</RouterLink>
              <template v-else>欢迎回来</template>
            </h1>
            <p>{{ timeGreeting }}</p>
          </div>
        </div>
      </div>

      <div class="overview-hero__body">
        <div class="overview-hero__main">
          <div class="overview-hero__chips">
            <span>{{ accountEmailLabel }}</span>
            <span>官方活动：{{ subscriptionLabel }}</span>
          </div>
        </div>
        <div class="overview-hero__actions">
          <button class="ghost small" type="button" :disabled="!auth.username"
            @click="router.push({ name: 'dev-profile', params: { username: auth.username } })">
            我的主页
          </button>
        </div>

      </div>

      <!-- 移动端快捷入口：App 式宫格图标，顶替下方「快捷入口」面板（该面板移动端隐藏）。
           第一行是需求方自己的事（发需求 → 看定制 → 签合同 → 开发票），
           第二行是开发者侧（找需求 → 接单 → 做资源 → 收钱），各按做事先后排。 -->
      <nav class="overview-hero__quick" aria-label="快捷入口">
        <!-- 带 modal=publish 回到总览即弹出发布需求窗口（见 route.query.modal 的 watch），关闭时会清掉这个参数 -->
        <RouterLink :to="{ name: 'workbench', query: { modal: 'publish' } }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><EditPen /></TIcon></span>
          <span>我有需求</span>
        </RouterLink>
        <RouterLink :to="{ name: 'workbench-requirements' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Suitcase /></TIcon></span>
          <span>我的定制</span>
        </RouterLink>
        <RouterLink :to="{ name: 'workbench-signatures' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Files /></TIcon></span>
          <span>我的合同</span>
        </RouterLink>
        <RouterLink :to="{ name: 'workbench-invoices' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Document /></TIcon></span>
          <span>我的发票</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dev-requirement-hall' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Compass /></TIcon></span>
          <span>需求大厅</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dev-my-requirements' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Tickets /></TIcon></span>
          <span>我的接单</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dev-plugins' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Box /></TIcon></span>
          <span>资源初始化</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dev-wallet' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Wallet /></TIcon></span>
          <span>收益钱包</span>
        </RouterLink>
      </nav>
    </section>

    <section class="overview-focus-panel">
      <div class="overview-section-head">
        <div>
          <h2>需求进度</h2>
        </div>
        <RouterLink class="overview-link" :to="{ name: 'workbench-requirements' }">查看需求单</RouterLink>
      </div>
      <div v-if="recentRequirements.length === 0" class="overview-empty-state">
        <strong>暂无需求单</strong>
      </div>
      <ul v-else class="overview-requirement-list">
        <li v-for="item in recentRequirements" :key="item.requirement_id" class="clickable" role="button" tabindex="0"
          :aria-label="`查看需求：${item.title}`" @click="handleRequirementAction(item)"
          @keydown.enter.prevent="handleRequirementAction(item)" @keydown.space.prevent="handleRequirementAction(item)">
          <div class="overview-requirement-meta">
            <strong>{{ item.title }}</strong>
            <span>{{ item.requirement_id }} · {{ paymentModeLabel(item) }}</span>
          </div>
          <span class="overview-status" :class="`overview-status--${item.status}`">{{
            formatRequirementDisplayStatus(item) }}</span>
          <small>{{ formatBudget(item.budget) }}</small>
          <time>{{ formatRequirementTime(item.updated_at) }}</time>
          <div class="overview-requirement-progress" @click.stop>
            <RequirementProgressGuide :requirement="item" :payment-mode="item.payment_mode"
              :contract-status="contractSigningStatusMap[item.requirement_id]" />
          </div>
        </li>
      </ul>
    </section>

    <div class="overview-dashboard-grid">
      <section class="overview-panel overview-panel--main overview-panel--messages">
        <div class="overview-section-head">
          <div>
            <h2>最近沟通</h2>
          </div>
          <div class="overview-inline-actions">
            <RouterLink class="overview-link" :to="{ name: 'workbench-messages' }">消息中心</RouterLink>
          </div>
        </div>
        <div v-if="recentConversationCards.length === 0" class="overview-empty-state">
          <strong>暂无可用会话</strong>
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
              <h2>快捷入口</h2>
            </div>
          </div>
          <div class="overview-dev-links">
            <RouterLink :to="{ name: 'dev-plugins' }">资源初始化</RouterLink>
            <RouterLink :to="{ name: 'dev-requirement-hall' }">需求大厅</RouterLink>
            <RouterLink :to="{ name: 'dev-wallet' }">收益钱包</RouterLink>
            <RouterLink :to="{ name: 'dev-my-requirements' }">我的接单</RouterLink>
          </div>
        </section>
      </aside>
    </div>

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
      <div v-if="profileAvatarCropVisible" class="modal-wrap modal-wrap--avatar-crop"
        @click.self="closeProfileAvatarCrop">
        <section class="pay-modal profile-avatar-crop-modal" aria-label="头像裁剪弹窗">
          <div class="profile-avatar-crop-header">
            <h3>头像裁剪</h3>
            <button class="ghost small" type="button" :disabled="profileAvatarUploading"
              @click="closeProfileAvatarCrop">关闭</button>
          </div>

          <div class="profile-avatar-crop-body">
            <div class="profile-avatar-crop-stage-wrap">
              <div ref="profileAvatarCropFrame" class="profile-avatar-crop-stage"
                :class="{ 'is-dragging': profileAvatarCropDragging }" @pointerdown="handleProfileAvatarCropPointerDown"
                @pointermove="handleProfileAvatarCropPointerMove" @pointerup="stopProfileAvatarCropDrag"
                @pointercancel="stopProfileAvatarCropDrag" @wheel.prevent="handleProfileAvatarCropWheel">
                <img v-if="profileAvatarCropImageUrl" class="profile-avatar-crop-image" :src="profileAvatarCropImageUrl"
                  :style="profileAvatarCropImageStyle" alt="头像裁剪预览" draggable="false"
                  @load="handleProfileAvatarCropImageLoad" />
                <span class="profile-avatar-crop-ring" aria-hidden="true"></span>
              </div>
            </div>

            <div class="profile-avatar-crop-controls">
              <div class="profile-avatar-crop-zoom">缩放 {{ profileAvatarCropZoomPercent }}%</div>
              <div class="profile-avatar-crop-actions">
                <button class="ghost small profile-avatar-crop-action profile-avatar-crop-action--utility" type="button"
                  :disabled="profileAvatarUploading || !profileAvatarCropImage" @click="resetProfileAvatarCropFrame">
                  <TIcon>
                    <Aim />
                  </TIcon>
                  <span>居中</span>
                </button>
                <button class="ghost small profile-avatar-crop-action profile-avatar-crop-action--cancel" type="button"
                  :disabled="profileAvatarUploading" @click="closeProfileAvatarCrop">
                  <TIcon>
                    <Close />
                  </TIcon>
                  <span>取消</span>
                </button>
                <button class="ghost small profile-avatar-crop-action profile-avatar-crop-action--primary" type="button"
                  :disabled="profileAvatarUploading || !profileAvatarCropImage" @click="submitProfileAvatarCrop">
                  <TIcon v-if="!profileAvatarUploading">
                    <Check />
                  </TIcon>
                  {{ profileAvatarUploading ? '上传中...' : '保存头像' }}
                </button>
              </div>
            </div>
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
            <button type="button" class="payment-option"
              :class="{ active: payChannel === 'alipay', 'payment-option--alipay': payChannel === 'alipay' }"
              @click="updatePayChannel('alipay')">
              <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
              支付宝
            </button>
          </div>
        </div>

        <div class="actions">
          <button class="ghost" type="button" @click="closePayModal">取消</button>
          <button class="ghost primary" type="button" :disabled="payLoading" @click="submitRequirementPayment">
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
          <button class="ghost primary" type="button" @click="confirmFinalPaymentRequest">{{ finalPaymentConfirmButton
          }}</button>
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
.profile-page {
  display: grid;
  gap: 16px;
  max-width: 1024px;
  min-height: calc(100vh - 113px);
  margin: 0 auto;
  padding: 32px 20px 56px;
}

.overview-hero,
.overview-focus-panel,
.overview-panel {
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
  appearance: none;
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 76px;
  height: 76px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(183, 201, 238, 0.95);
  border-radius: 50%;
  background: linear-gradient(135deg, #eef5ff, #ffffff);
  color: #1d4ed8;
  cursor: pointer;
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 10px 22px rgba(76, 103, 172, 0.12);
}

.profile-avatar-button:disabled {
  cursor: wait;
  opacity: 0.78;
}

.profile-avatar-button img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-avatar-button span {
  position: relative;
  z-index: 1;
}

.profile-avatar-button small {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
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

.modal-wrap--avatar-crop {
  --profile-card-bg: rgba(255, 255, 255, 0.94);
  --profile-card-bg-strong: #ffffff;
  --profile-card-border: rgba(224, 232, 255, 0.96);
  --profile-card-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
  --profile-text-main: #0f172a;
  --profile-text-sub: #64748b;
  --profile-accent: #4f8cff;
  background: rgba(15, 23, 42, 0.26);
  backdrop-filter: blur(4px);
  z-index: 120;
}

.profile-avatar-crop-modal {
  width: min(720px, calc(100vw - 36px));
  padding: 0;
  overflow: hidden;
  border-color: rgba(209, 220, 243, 0.95);
  background: #ffffff;
  box-shadow: 0 26px 70px rgba(30, 58, 138, 0.18);
}

.profile-avatar-crop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(224, 232, 255, 0.9);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.profile-avatar-crop-header h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.profile-avatar-crop-body {
  display: grid;
  grid-template-columns: minmax(300px, 368px) minmax(0, 1fr);
  gap: 22px;
  align-items: center;
  padding: 22px;
}

.profile-avatar-crop-stage-wrap {
  display: grid;
  place-items: center;
  padding: 16px;
  border: 1px solid rgba(224, 232, 255, 0.9);
  border-radius: 24px;
  background: linear-gradient(135deg, #f8fbff 0%, #ffffff 100%);
}

.profile-avatar-crop-stage {
  position: relative;
  width: min(320px, 100%);
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid rgba(183, 201, 238, 0.95);
  border-radius: 50%;
  background: linear-gradient(135deg, #eef5ff, #ffffff);
  box-shadow: 0 18px 38px rgba(76, 103, 172, 0.18);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.profile-avatar-crop-stage.is-dragging {
  cursor: grabbing;
}

.profile-avatar-crop-image {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  max-width: none;
  transform-origin: top left;
  pointer-events: none;
  user-select: none;
}

.profile-avatar-crop-ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: inherit;
  box-shadow: inset 0 0 0 999px rgba(15, 23, 42, 0.02), inset 0 0 24px rgba(15, 23, 42, 0.14);
  pointer-events: none;
}

.profile-avatar-crop-controls {
  display: grid;
  gap: 16px;
  min-width: 0;
  align-content: center;
}

.profile-avatar-crop-zoom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  width: fit-content;
  padding: 8px 12px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 999px;
  background: #f8fbff;
  color: var(--profile-text-sub);
  font-size: 14px;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.profile-avatar-crop-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.modal-wrap--avatar-crop button.ghost,
.modal-wrap--avatar-crop button.ghost.small {
  border-color: rgba(209, 220, 243, 0.95);
  background: #ffffff;
  color: var(--profile-text-main);
  box-shadow: 0 8px 20px rgba(76, 103, 172, 0.06);
}

.modal-wrap--avatar-crop button.ghost:hover:not(:disabled) {
  background: #f8fbff;
  border-color: rgba(125, 155, 225, 0.92);
  box-shadow: 0 12px 24px rgba(76, 103, 172, 0.1);
}

.profile-avatar-crop-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  min-width: 76px;
  line-height: 1;
  white-space: nowrap;
}

.profile-avatar-crop-action .t73-icon {
  flex: 0 0 auto;
  font-size: 15px;
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--utility.ghost {
  border-color: rgba(147, 197, 253, 0.9);
  background: #eff6ff;
  color: #1d4ed8;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--cancel.ghost {
  border-color: rgba(203, 213, 225, 0.95);
  background: #ffffff;
  color: #64748b;
  box-shadow: none;
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--primary.ghost {
  min-width: 116px;
  border-color: rgba(37, 99, 235, 0.95);
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22);
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--utility.ghost:hover:not(:disabled) {
  border-color: rgba(96, 165, 250, 0.95);
  background: #dbeafe;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.12);
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--cancel.ghost:hover:not(:disabled) {
  border-color: rgba(148, 163, 184, 0.95);
  background: #f8fafc;
  color: #334155;
  box-shadow: 0 10px 20px rgba(100, 116, 139, 0.1);
}

.modal-wrap--avatar-crop .profile-avatar-crop-action--primary.ghost:hover:not(:disabled) {
  border-color: rgba(29, 78, 216, 0.98);
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 16px 30px rgba(37, 99, 235, 0.28);
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
  overflow: hidden;
  font-size: clamp(22px, 3.6vw, 40px);
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-hero__head p {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 18px;
  line-height: 1.5;
}

.overview-hero__identity > div {
  min-width: 0;
}

.overview-hero__main p {
  margin: 0;
  max-width: 680px;
  color: #64748b;
  line-height: 1.7;
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

.overview-hero__name-link {
  color: inherit;
  text-decoration: none;
}

.overview-hero__name-link:hover {
  color: #1d4ed8;
}

/* 顶部读数条复用菜单页的 .wb-strip（形状见 portal-workbench.css），
   只是读数项带跳转：去掉链接默认下划线，hover 时用主色提示可点 */
.overview-strip a.wb-strip__item {
  color: inherit;
  text-decoration: none;
}

.overview-strip a.wb-strip__item:hover .wb-strip__value {
  color: #1d4ed8;
}

.overview-requirement-list span,
.overview-requirement-list time,
.overview-empty-state span,
.overview-service-card span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.overview-focus-panel,
.overview-panel {
  padding: 20px;
  border-radius: 18px;
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
  padding: 16px 18px;
  border: 1px solid rgba(191, 219, 254, 0.78);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
}

.overview-requirement-list .overview-requirement-meta {
  min-width: 0;
}

.overview-requirement-list .overview-requirement-progress {
  grid-column: 1 / -1;
  margin-top: 6px;
}

.overview-requirement-progress :deep(.req-progress) {
  padding: 16px 18px 14px;
  border-color: rgba(191, 219, 254, 0.76);
  border-radius: 12px;
  background: rgba(248, 251, 255, 0.78);
}

.overview-requirement-list li.clickable {
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.overview-requirement-list li.clickable:hover {
  border-color: rgba(125, 155, 225, 0.92);
  background: rgba(248, 251, 255, 0.98);
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

.overview-status--completed {
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

/* 头像卡下方的 App 式快捷入口：只在移动端出现（见 760px 断点） */
.overview-hero__quick {
  display: none;
}

.overview-hero__quick a {
  display: grid;
  justify-items: center;
  gap: 6px;
  min-width: 0;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.overview-hero__quick a>span:last-child {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-hero__quick-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: #ffffff;
  color: #2563eb;
  box-shadow: 0 4px 10px rgba(76, 103, 172, 0.08);
}

@media (max-width: 1180px) {
  .overview-dashboard-grid {
    grid-template-columns: 1fr;
  }

  .overview-side-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

}

@media (max-width: 760px) {
  .profile-page.page-shell {
    gap: 12px;
    padding: 0 0 24px;
  }

  /* 移动端总览的卡片统一一套语言：白底卡 + 18px 圆角 + 16px 内边距，
     卡内的次级块（标签、入口区、进度条）一律 #f6f9ff 浅蓝底、无描边，强调色统一用蓝 */
  .overview-hero {
    gap: 14px;
    padding: 16px;
    border-radius: 18px;
  }

  .profile-avatar-button {
    width: 60px;
    height: 60px;
    border: 3px solid #ffffff;
    font-size: 24px;
    box-shadow: 0 8px 18px rgba(76, 103, 172, 0.18);
  }

  .profile-avatar-button small {
    padding: 3px 0;
    font-size: 10px;
  }

  /* 用户名可点进个人主页：移动端补一个箭头提示 */
  .overview-hero__name-link::after {
    content: '›';
    margin-left: 6px;
    color: #94a3b8;
    font-weight: 600;
  }

  /* 头像行只剩头像 + 用户名，单列排布即可 */
  .overview-hero__head {
    align-items: center;
    gap: 10px;
  }

  .overview-hero__body {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 12px;
  }

  .overview-hero__identity {
    gap: 12px;
  }

  .overview-hero__head h1 {
    margin-top: 0;
    font-size: 19px;
    font-weight: 800;
  }

  .overview-hero__head p {
    margin-top: 4px;
    color: #64748b;
    font-size: 13px;
  }

  .overview-section-head h2 {
    font-size: 17px;
  }

  /* 邮箱与订阅状态压成一行：邮箱过长时省略，订阅状态不缩 */
  .overview-hero__chips {
    flex-wrap: nowrap;
    gap: 8px;
    margin-top: 0;
  }

  .overview-hero__chips span {
    min-height: 26px;
    max-width: 100%;
    padding: 4px 10px;
    overflow: hidden;
    border-color: transparent;
    background: #f6f9ff;
    color: #475569;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .overview-hero__chips span:first-child {
    flex: 0 1 auto;
    min-width: 0;
  }

  .overview-hero__chips span:last-child {
    flex: 0 0 auto;
  }

  /* 移动端最近沟通走底部导航「消息」与顶栏「会话」读数，总览里不再铺一块 */
  .overview-panel--messages {
    display: none;
  }

  /* 快捷入口改成头像卡里的四宫格图标，右侧面板整列收起 */
  .overview-side-stack {
    display: none;
  }

  .overview-hero__quick {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px 8px;
    padding: 14px 4px;
    border-radius: 12px;
    background: #f6f9ff;
  }

  /* 移动端：主页走「点用户名」，操作区整排收起 */
  .overview-hero__actions {
    display: none;
  }

  .overview-focus-panel,
  .overview-panel {
    padding: 16px;
    border-radius: 18px;
  }

  /* 头像卡与需求进度合成一张卡：上下两半去掉相接处的圆角与描边，中间只留一条内缩分隔线。
     阴影一并去掉——后一个兄弟的阴影会画在前一个的底色上，接缝处会露出一道灰影。 */
  .overview-hero {
    border-bottom: 0;
    border-radius: 18px 18px 0 0;
    box-shadow: none;
  }

  .overview-focus-panel {
    position: relative;
    margin-top: -12px;
    border-top: 0;
    border-radius: 0 0 18px 18px;
    box-shadow: none;
  }

  /* 区块标题：左侧蓝色短竖条 + 15px 标题；右侧链接降为次级文字加箭头 */
  .overview-focus-panel .overview-section-head {
    align-items: center;
    margin-bottom: 12px;
  }

  .overview-focus-panel .overview-section-head h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 0;
    font-size: 15px;
    font-weight: 800;
  }

  .overview-focus-panel .overview-section-head h2::before {
    content: '';
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: #2563eb;
  }

  .overview-focus-panel .overview-link {
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
  }

  .overview-focus-panel .overview-link::after {
    content: '›';
    margin-left: 4px;
  }

  .overview-focus-panel::before {
    content: '';
    position: absolute;
    top: 0;
    right: 16px;
    left: 16px;
    height: 1px;
    background: rgba(224, 232, 255, 0.96);
  }

  .overview-section-head,
  .overview-inline-actions {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .overview-inline-actions .ghost.small,
  .overview-link {
    width: auto;
    text-align: center;
  }

  .overview-side-stack {
    grid-template-columns: 1fr;
  }

  /* 需求卡：标题与编号一块，状态 / 时间 / 金额压成一行（金额靠右加粗），进度条横排收紧 */
  .overview-requirement-list li {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'meta meta meta'
      'status time budget'
      'progress progress progress';
    gap: 10px 8px;
    align-items: center;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  /* 需求卡不再套一层描边卡片，多条之间只用分隔线 */
  .overview-requirement-list li + li {
    padding-top: 14px;
    border-top: 1px solid rgba(224, 232, 255, 0.96);
  }

  .overview-requirement-list li.clickable:hover {
    border-color: rgba(224, 232, 255, 0.96);
    background: transparent;
    box-shadow: none;
  }

  .overview-requirement-list .overview-requirement-meta {
    grid-area: meta;
    display: grid;
    gap: 4px;
  }

  .overview-requirement-list .overview-requirement-meta strong {
    display: -webkit-box;
    font-size: 15px;
    line-height: 1.4;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .overview-requirement-list .overview-status {
    grid-area: status;
    min-height: 24px;
    padding: 3px 10px;
    font-size: 12px;
  }

  .overview-requirement-list time {
    grid-area: time;
    color: #94a3b8;
    font-size: 12px;
  }

  .overview-requirement-list small {
    grid-area: budget;
    color: #0f172a;
    font-size: 16px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .overview-requirement-list .overview-requirement-progress {
    grid-area: progress;
    margin-top: 0;
  }

  .overview-requirement-progress :deep(.req-progress) {
    padding: 12px 6px 10px;
    border: 0;
    border-radius: 12px;
    background: #f6f9ff;
  }

  /* 组件在 720px 以下会改成竖排五行，总览里保持横排：只留圆点和步骤名，说明文字收起 */
  .overview-requirement-progress :deep(.req-progress__steps) {
    flex-direction: row;
    align-items: flex-start;
    gap: 0;
  }

  .overview-requirement-progress :deep(.req-progress__step) {
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }

  .overview-requirement-progress :deep(.req-progress__dot) {
    width: 22px;
    height: 22px;
    font-size: 11px;
  }

  .overview-requirement-progress :deep(.req-progress__step-title) {
    font-size: 11px;
    white-space: nowrap;
  }

  .overview-requirement-progress :deep(.req-progress__step-desc) {
    display: none;
  }

  .overview-requirement-progress :deep(.req-progress__connector) {
    display: block;
    top: 11px;
    left: calc(50% + 14px);
    right: calc(-50% + 14px);
  }

  .overview-dev-links {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
}

@media (max-width: 640px) {
  .profile-avatar-crop-body {
    grid-template-columns: 1fr;
  }

  .profile-avatar-crop-zoom {
    width: 100%;
  }

  .profile-avatar-crop-actions .ghost.small {
    flex: 1 1 120px;
  }
}

@media (max-width: 380px) {
  .overview-dev-links {
    grid-template-columns: 1fr;
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
