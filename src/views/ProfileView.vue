<script setup lang="ts">
import {
  TButton,
  TIcon,
  Box,
  Compass,
  Document,
  EditPen,
  Files,
  Refresh,
  Suitcase,
  Tickets,
  TMessage,
  Wallet,
} from 'ui_73info'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProfileAvatarCropModal from '@/components/profile/ProfileAvatarCropModal.vue'
import PublishModal from '@/components/PublishModal.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { HttpError, apiUrl } from '@/api/http'
import { getMyRealnameVerification } from '@/api/realname'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import { useAvatarCrop } from '@/composables/useAvatarCrop'
import { useAvatarCropModalBindings } from '@/composables/useAvatarCropModalBindings'
import { useAuthStore } from '@/stores/auth'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import {
  createRequirement as createRequirementApi,
  listRequirements,
  type RequirementItem,
  type RequirementPaymentMode,
  type RequirementStatus,
} from '@/api/requirements'
import { getProfile } from '@/api/settings'
import { validateRequirementRichText } from '@/utils/requirementRichText'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const loading = ref(false)
const coupons = ref<CouponItem[]>([])
const requirementLoading = ref(false)
const myRequirements = ref<RequirementItem[]>([])
const contractSigningStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
const publishVisible = ref(false)
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
const publishLoading = ref(false)
const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const conversationVisible = ref(false)
const conversationRequirement = ref<RequirementItem | null>(null)
const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  TMessage[type](message)
}
const failedProfileAvatarUrls = ref<Set<string>>(new Set())

/** 原图上限：超过就不进裁剪（先缩图，否则 blob 与 canvas 都会跟着重）。 */
const avatarCropMaxSourceSize = 8 * 1024 * 1024

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
    TMessage.error(error instanceof Error ? error.message : '加载沟通会话失败')
  }
}

function hasPendingResourceVersionDeleteReview(item: RequirementItem) {
  return hasBoundResource(item) && (item.pending_resource_version_delete_requests?.length ?? 0) > 0
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
    TMessage.info('发布需求前请先登录')
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
      TMessage.warning('实名认证审核中，通过后可发布需求')
      return false
    }

    TMessage.warning('实名认证未通过，请重新提交后再发布需求')
    void router.push({
      name: 'workbench-realname',
      query: { redirect_to: redirectTarget },
    })
    return false
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      TMessage.warning('发布需求前请先完成实名认证')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: redirectTarget },
      })
      return false
    }

    TMessage.error(error instanceof Error ? error.message : '实名认证状态校验失败')
    return false
  }
}

async function refreshProfileData() {
  await Promise.all([
    loadCoupons(),
    loadMyRequirements(),
    loadRequirementConversations(),
    loadProfile(),
  ])
  TMessage.success('资料已刷新')
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
    TMessage.error('请先登录后上传头像')
    return
  }

  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    TMessage.warning('头像仅支持图片格式')
    if (input) input.value = ''
    return
  }

  if (file.size > avatarCropMaxSourceSize) {
    TMessage.warning('原图请控制在 8MB 以内')
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
    TMessage.error(err instanceof Error ? err.message : '加载个人资料失败')
  }
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

function closePublishModal() {
  if (publishLoading.value) {
    return
  }
  forceClosePublishModal()
  clearPublishModalQuery()
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
    TMessage.error('需求标题至少 4 个字符')
    return
  }

  if (descriptionValidation.error) {
    TMessage.error(descriptionValidation.error)
    return
  }

  if (!budgetRaw) {
    TMessage.error('预算不能为空')
    return
  }

  const budget = Number(budgetRaw)

  if (Number.isNaN(budget) || budget < 0) {
    TMessage.error('预算必须是大于等于0的数字')
    return
  }

  if (acceptanceValidation.error) {
    TMessage.error(acceptanceValidation.error)
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

    TMessage.success('需求已发布')
    forceClosePublishModal()
    clearPublishModalQuery()
    publishModalRef.value?.clearDraft()
    await loadMyRequirements()
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发布失败')
  } finally {
    publishLoading.value = false
  }
}

const profileAvatarUrl = ref('')
const profileAvatarCacheKey = ref(0)
const profileAvatarInput = ref<HTMLInputElement | null>(null)
const profileEmail = ref('')

/**
 * 头像裁剪整块（缩放 / 拖拽 / 边界钳制 / Canvas 出图 / 上传）在 `useAvatarCrop`，
 * 弹窗只渲染、只 emit，挂点由 `useAvatarCropModalBindings` 一行铺平。
 *
 * 视图这边只剩两件事：**选图入口**（`<input type=file>` 在这里）与**上传后回写头像地址**
 * （`onUploaded`）。预览 blob 的 revoke 也归 composable —— 早先挂在本页 `onBeforeUnmount` 上，
 * 拆走一层就会漏一处。
 */
const avatarCrop = useAvatarCrop({ onUploaded: applyUploadedAvatar })
const { uploading: profileAvatarUploading, open: openProfileAvatarCrop } = avatarCrop
const { modalBindings: avatarCropModal } = useAvatarCropModalBindings(avatarCrop)

/** 上传成功后回写头像：剔除失败集合里的旧地址，再换缓存键让页面顶部那颗头像重新拉图。 */
function applyUploadedAvatar(avatarUrl: string) {
  if (avatarUrl) {
    const nextFailedUrls = new Set(failedProfileAvatarUrls.value)
    nextFailedUrls.delete(avatarUrl)
    failedProfileAvatarUrls.value = nextFailedUrls
  }
  profileAvatarUrl.value = avatarUrl
  profileAvatarCacheKey.value = Date.now()
}

const subscriptionOfficialActivity = ref(false)

async function loadCoupons() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  loading.value = true
  try {
    coupons.value = await listAvailableCoupons(auth.token)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '加载券包失败')
  } finally {
    loading.value = false
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
    TMessage.error(err instanceof Error ? err.message : '加载需求单失败')
  } finally {
    requirementLoading.value = false
  }
}

onMounted(async () => {
  auth.hydrate()
  await Promise.all([
    loadCoupons(),
    loadMyRequirements(),
    loadRequirementConversations(),
    loadProfile(),
  ])

  const oauthResult = typeof route.query.wechat_oauth === 'string' ? route.query.wechat_oauth : ''
  const oauthError =
    typeof route.query.wechat_oauth_error === 'string' ? route.query.wechat_oauth_error : ''
  const unionOauthResult = typeof route.query.union_oauth === 'string' ? route.query.union_oauth : ''
  const unionOauthError =
    typeof route.query.union_oauth_error === 'string' ? route.query.union_oauth_error : ''
  if (oauthResult === 'success') {
    TMessage.success('微信授权成功，请再次点击支付')
  } else if (oauthError) {
    TMessage.error(`微信授权失败：${oauthError}`)
  }
  if (unionOauthResult === 'success') {
    TMessage.success('云闪付授权成功，请再次点击支付')
  } else if (unionOauthError) {
    TMessage.error(`云闪付授权失败：${unionOauthError}`)
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
      :draft-scope="auth.isAuthed ? auth.username : 'default'" @close="closePublishModal" @notify="notify"
      @submit="submitRequirementPublish" />

    <RequirementConversationModal :visible="conversationVisible" :token="auth.token" :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirement_id ?? ''" :title="conversationRequirement?.title"
      @updated="applyConversationDetail" @close="closeConversation" />

    <!-- 头像裁剪弹窗：模板、样式（含 Teleport 出去后的 205 行细节样式与 @640 单列布局）全在组件里，
         这里只有挂点——props 与监听由 `useAvatarCropModalBindings` 一行铺平。 -->
    <ProfileAvatarCropModal v-bind="avatarCropModal" />
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
.overview-empty-state span {
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

@media (max-width: 380px) {
  .overview-dev-links {
    grid-template-columns: 1fr;
  }
}
</style>
