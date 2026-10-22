<script setup lang="ts">
import '@/styles/home.css'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TIcon, ArrowRight, TMessage } from 'ui_73info'

import { useAuthStore } from '@/stores/auth'
import {
  getUnionPaymentAuthorizeUrl,
  isUnionPaymentAuthorizationRequired,
  isWechatPaymentAuthorizationRequired,
} from '@/api/auth'
import AuthModal from '@/components/AuthModal.vue'
import WechatLoginQrModal from '@/components/WechatLoginQrModal.vue'
import PublishModal from '@/components/PublishModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import DeveloperRankCard from '@/components/home/DeveloperRankCard.vue'
import PortalBetaCard from '@/components/home/PortalBetaCard.vue'
import PortalMilestoneCard from '@/components/home/PortalMilestoneCard.vue'
import PortalNoticeCard from '@/components/home/PortalNoticeCard.vue'
import SpotlightResourceSection from '@/components/home/SpotlightResourceSection.vue'
import TeamRankCard from '@/components/home/TeamRankCard.vue'
import { buildDevPortalUrl } from '@/config/runtime'
import { useAuthForm } from '@/composables/useAuthForm'
import { useHomeCheckin } from '@/composables/useHomeCheckin'
import { usePortalRanks } from '@/composables/usePortalRanks'
import { usePublicResources } from '@/composables/usePublicResources'
import type { SpotlightCard } from '@/composables/useSpotlightCards'
import {
  buildMilestoneStats,
  buildPortalNotices,
  formatMoney,
  formatTimeLabel,
  statusToLabel,
  type PortalMilestoneStat,
  type PortalNotice,
} from '@/shared/home/portalDisplay'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import {
  normalizeDevelopmentCycle,
  validateDevelopmentCycleInput,
} from '@/shared/requirementArchive'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import { validateRequirementRichText } from '@/utils/requirementRichText'
import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { HttpError } from '@/api/http'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import { getMyRealnameVerification } from '@/api/realname'
import {
  createAdapayPayment,
  getAdapayPayment,
  getAdapayClientPlatform,
  type AdapayBusinessPayChannel,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import {
  createRequirement,
  getPublicRequirementOverview,
  listPublicRequirementSpotlights,
  listRequirements,
  resubmitRequirement,
  type PublicRequirementSpotlightItem,
  type RequirementPaymentMode,
  type RequirementStatus,
} from '@/api/requirements'
import { getDepositRatio } from '@/api/settings'
import { listCommunityPosts, type CommunityPost } from '@/api/community'
import {
  likePublicMcResource,
  listAllPublicMcResources,
  unlikePublicMcResource,
} from '@/api/resources'
import { getResourcePromoMeta } from '@/api/points'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

type Metric = {
  label: string
  value: string
}

type PendingRequirementView = {
  id: string
  title: string
  status: RequirementStatus
  statusLabel: string
  updatedAtLabel: string
  description?: string | null
  acceptanceCriteria?: string | null
  budget?: number | null
  paymentMode: RequirementPaymentMode
}

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

type AuthMode = 'login' | 'register' | 'reset'

type WorkflowStep = {
  step: string
  title: string
  summary: string
  icon: string
  accent: string
  actionLabel: string
  action: 'publish' | 'progress' | 'developer'
}

type QuickPanel = {
  title: string
  summary: string
  action: string
  tone: 'gift' | 'briefcase'
}

const metrics = ref<Metric[]>([
  { label: '累计完成', value: '0 单' },
  { label: '综合评价', value: '5.00 分' },
  { label: '累计成交额', value: '¥ 0.00' },
])
const AUTO_REFRESH_INTERVAL_MS = 300_000

/** 公告侧栏只展示标题与成交时间，其余成交字段无读取点，随详情弹窗一并删除。 */
type LatestDealView = {
  title: string
  at: string
}

const latestDeals = ref<LatestDealView[]>([])
const publicDeveloperCount = ref(0)
const pendingRequirements = ref<PendingRequirementView[]>([])
const publicRequirementSpotlights = ref<PublicRequirementSpotlightItem[]>([])
/**
 * 公开资源这一份状态由 `usePublicResources` 独占：侧栏榜单、公告卡、里程碑统计、
 * 精选资源区、点赞回写都读同一份，本视图不再自己建 ref（否则会出现两份数据源）。
 */
const {
  publicResources,
  highLikeThreshold,
  resolveResourceRoute,
  ensureTagTree,
  applyResourceList,
  applyHighLikeThreshold,
  applyLikeState,
} = usePublicResources()
const auth = useAuthStore()
const announcementPosts = ref<CommunityPost[]>([])
const router = useRouter()
const route = useRoute()

/** 侧栏两张榜单：资源由本视图统一请求后传进去，composable 只做聚合，不再发资源请求。 */
const { developerRanks, teamRanks, totalContribResources, developerBadges } =
  usePortalRanks(publicResources)
/** 侧栏「内测中」卡片里的每日签到（写操作 + 两个 api 都留在这支 composable 里）。 */
const {
  status: homeCheckinStatus,
  saving: checkinHomeSaving,
  load: loadHomeCheckin,
  checkin: handleHomeCheckin,
} = useHomeCheckin()

function openBetaGroup() {
  window.open(qqBetaGroupUrl, '_blank', 'noopener,noreferrer')
}

function openDeveloperProfile(username: string) {
  void router.push({ name: 'dev-profile', params: { username } })
}

function openTeamProfile(teamId: number) {
  void router.push({ name: 'team-profile', params: { teamId } })
}

function hashQueryValue(key: string) {
  const hash = route.hash.trim()
  if (!hash.startsWith('#/?')) {
    return ''
  }

  return new URLSearchParams(hash.slice(3)).get(key)?.trim() ?? ''
}

function routeQueryValue(key: string) {
  const value = route.query[key]
  if (typeof value === 'string') {
    return value.trim()
  }
  return hashQueryValue(key)
}

const routeModal = computed(() => routeQueryValue('modal'))
const routeAuthMode = computed<AuthMode>(() => {
  const mode = routeQueryValue('mode') || 'login'
  return mode === 'register' || mode === 'reset' ? mode : 'login'
})
const authVisible = computed(() => routeModal.value === 'auth')
const publishVisible = computed(() => routeModal.value === 'publish')
const depositVisible = computed(() => routeModal.value === 'deposit')
const {
  authUsername,
  authPassword,
  authEmail,
  authEmailCode,
  authInviteCode,
  authShareType,
  authShareTargetId,
  authTurnstileToken,
  acceptTerms,
  loginRequiresTwoFactor,
  sendCodeLoading,
  sendCodeCountdown,
  githubLoading,
  giteeLoading,
  wechatLoginLoading,
  qqLoginLoading,
  githubAvailable,
  wechatAvailable,
  qqAvailable,
  giteeAvailable,
  resetAuthForm,
  loginWithGithub,
  loginWithGitee,
  loginWithWechat,
  wechatQrLogin,
  closeWechatQrLogin,
  refreshWechatQrLogin,
  handleWechatQrToken,
  loginWithQq,
  sendAuthCode: sendAuthCodeAction,
  submitAuth: submitAuthAction,
} = useAuthForm(routeAuthMode)
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
let autoRefreshInFlight = false
let isMounted = true
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const depositChannel = ref<AdapayBusinessPayChannel>('alipay')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
// R014 的「开发周期（天）」：只有担保模式（`platform_guarantee`）才显示、才必填。
// 这一路必须与付款模式一起接：`PublishModal` 里输入框照样渲染，但 `emit` 无人接时
// 用户键入的值会原地丢掉 —— 后端对担保需求要求正数周期，发布必被 400 拒掉，
// 重新提交走 `PATCH`（后端不跑 `validate_new`）则**不报错、周期静默丢失**。
const publishDevelopmentCycleDays = ref<string | number>('')
const activeResubmitRequirementId = ref<string | null>(null)
const publishLoading = ref(false)
const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const depositRequirement = computed<PendingRequirementView | null>(() => {
  const id = String(route.query.requirement_id || '')
  return pendingRequirements.value.find((item) => item.id === id) ?? null
})
const depositPayment = ref<PaymentState | null>(null)
const depositLoading = ref(false)
const depositRatioPercent = ref(20)
const availableCoupons = ref<CouponItem[]>([])
const amountCouponCode = ref('')
const discountCouponCode = ref('')
const depositPolicyAccepted = ref(false)
const couponLoading = ref(false)
const contractSigningStatus = ref<ContractSigningStatus | null>(null)
function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  TMessage[type](message)
}

const heroSignals = ['免费资源共享', '需求记录留痕', '工单沟通协作']
const qqBetaGroupUrl = 'https://qm.qq.com/q/AXb3VBPurC'
const isDeveloperAccount = computed(() => auth.role === 'dev' || auth.role === 'super_admin')
const devActionLabel = computed(() => (isDeveloperAccount.value ? '我要接单' : '成为开发者'))

const portalNotices = computed<PortalNotice[]>(() => {
  const resource = publicResources.value[0]
  return buildPortalNotices({
    posts: announcementPosts.value,
    latestDeal: latestDeals.value[0],
    resource,
    resourceRoute: resource ? resolveResourceRoute(resource) : null,
    spotlight: publicRequirementSpotlights.value[0],
  })
})

const quickPanels = computed<QuickPanel[]>(() => [
  {
    title: '免费资源',
    summary: 'Minecraft、网站与工具资源\n发现并复用现成的优质内容',
    action: '立即查看',
    tone: 'gift',
  },
  {
    title: '社区交流',
    summary: '社区互动、动态分享与内容交流\n结识同好、展示成果与获取灵感',
    action: '进入社区',
    tone: 'briefcase',
  },
])

const workflowSteps: WorkflowStep[] = [
  {
    step: '1',
    title: '提交需求',
    summary: '填写需求与预算',
    icon: '▣',
    accent: 'violet',
    actionLabel: '发布需求',
    action: 'publish',
  },
  {
    step: '2',
    title: '需求审核',
    summary: 'AI+人工复核\n确认需求信息',
    icon: '☑',
    accent: 'blue',
    actionLabel: '查看进度',
    action: 'progress',
  },
  {
    step: '3',
    title: '开发者接单',
    summary: '开发者接单\n开始工作',
    icon: '⊞',
    accent: 'green',
    actionLabel: '开发者入口',
    action: 'developer',
  },
  {
    step: '4',
    title: '完成验收',
    summary: '确认需求',
    icon: '☑',
    accent: 'violet',
    actionLabel: '我的需求',
    action: 'progress',
  },
  {
    step: '5',
    title: '评价完成',
    summary: '交易完成\n双方评价',
    icon: '♥',
    accent: 'red',
    actionLabel: '评价订单',
    action: 'progress',
  },
]

async function openDevWorkbench() {
  if (isDeveloperAccount.value) {
    void router.push({ name: 'dev-requirement-hall' })
    return
  }

  if (!auth.isAuthed) {
    void router.push(buildDevPortalUrl(auth.token))
    return
  }

  await router.push({ name: 'dev-requirement-hall' })
}

function openResourceInit() {
  void router.push({ name: 'dev-plugins' })
}

function openQuickPanel(panel: QuickPanel) {
  if (panel.tone === 'gift') {
    void router.push({ name: 'resources', query: { sale: 'free' } })
    return
  }

  // briefcase（社区交流）：跳转到社区页面。
  void router.push({ name: 'community' })
}

function openWorkflowStep(step: WorkflowStep) {
  if (step.action === 'publish') {
    void openPublishModal()
    return
  }

  if (step.action === 'developer') {
    openDevWorkbench()
    return
  }

  if (!auth.isAuthed) {
    TMessage.info('登录后可查看需求进度')
    openAuth('login')
    return
  }

  void router.push({ name: 'workbench-requirements' })
}

function openPortalNotice(notice: PortalNotice) {
  if (!notice.to) {
    return
  }

  void router.push(notice.to)
}

function openSpotlight(card: SpotlightCard) {
  if (card.kind === 'resource' && card.resourceId != null) {
    const target = publicResources.value.find((item) => item.id === card.resourceId)
    if (!target) {
      TMessage.info('资源详情正在加载中')
      return
    }

    const routeParams = resolveResourceRoute(target)
    if (!routeParams) {
      TMessage.warning('资源目录暂未配置完整标签路由')
      return
    }

    void router.push(
      resourceDetailLocation({
        resourceId: target.id,
        rootSlug: routeParams.rootSlug,
        entrySlug: routeParams.entrySlug,
        sale: resourceListingSaleOf(target.price_fen, target.price_points),
      }),
    )
    return
  }

  const target = pendingRequirements.value.find((item) => item.title === card.title)
  if (target && canOpenPayment(target)) {
    openDepositCard(target)
    return
  }

  TMessage.info('请进入需求大厅查看需求')
}

const platformStats = computed<PortalMilestoneStat[]>(() =>
  buildMilestoneStats({
    developerCount: publicDeveloperCount.value,
    resourceCount: publicResources.value.length,
    completedLabel: metrics.value[0]?.value,
  }),
)

const authTitle = computed(() => {
  if (routeAuthMode.value === 'login') {
    return '登录账号'
  }
  if (routeAuthMode.value === 'register') {
    return '注册账号'
  }
  return '找回密码'
})

const authRedirectTarget = computed(() => {
  const raw = routeQueryValue('redirect_to')
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return ''
  }
  return raw
})

const routeInviteCode = computed(() => {
  const raw = routeQueryValue('invite_code')
  return raw && /^[A-Za-z0-9]{1,32}$/.test(raw) ? raw : ''
})

const routeShareType = computed(() => {
  const raw = routeQueryValue('share_type')
  return ['requirement', 'portfolio', 'resource', 'community_post'].includes(raw) ? raw : ''
})

const routeShareTargetId = computed(() => {
  const raw = routeQueryValue('share_target_id') || routeQueryValue('target_id')
  return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : ''
})

watch(
  () =>
    [
      routeInviteCode.value,
      routeShareType.value,
      routeShareTargetId.value,
      routeAuthMode.value,
    ] as const,
  ([inviteCode, shareType, shareTargetId, mode]) => {
    if (mode === 'register' && inviteCode) {
      authInviteCode.value = inviteCode
      authShareType.value = shareType
      authShareTargetId.value = shareTargetId
    }
  },
  { immediate: true },
)

watch(
  () => auth.isAuthed,
  () => {
    void loadHomeCheckin()
    // 登录态变化后重拉公开资源，补齐 / 清空 liked_by_me。
    void loadPublicPortalData(true)
  },
)

/**
 * 精选卡片的点赞提交态。卡片在 `SpotlightResourceSection` 里，只负责回抛 `like`；
 * 请求、登录门禁与 toast 留在这里（子组件不碰 token）。
 *
 * 冒泡已在子组件用 `@click.stop` 挡掉：那一下不能同时触发卡片的 `open`，
 * 所以这里**不再**接 DOM 事件 —— 传进来的只有卡片本身。
 */
const spotlightLikeSubmittingIds = ref<Set<number>>(new Set())

function openSpotlightLikeLogin() {
  TMessage.info('请先登录后再点赞')
  openAuth('login')
}

async function toggleSpotlightLike(card: SpotlightCard) {
  const resourceId = card.resourceId
  if (resourceId == null) {
    return
  }
  if (spotlightLikeSubmittingIds.value.has(resourceId)) {
    return
  }
  if (!auth.isAuthed || !auth.token.trim()) {
    openSpotlightLikeLogin()
    return
  }

  const nextSubmitting = new Set(spotlightLikeSubmittingIds.value)
  nextSubmitting.add(resourceId)
  spotlightLikeSubmittingIds.value = nextSubmitting

  try {
    const state = card.likedByMe
      ? await unlikePublicMcResource(auth.token, resourceId)
      : await likePublicMcResource(auth.token, resourceId)
    // 回写 + 失效列表缓存都在 `usePublicResources` 里，视图不自己拼那一份状态。
    applyLikeState(resourceId, state)
    TMessage.success(state.liked_by_me ? '已点赞' : '已取消点赞')
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
      openSpotlightLikeLogin()
    } else {
      TMessage.error(error instanceof Error ? error.message : '点赞操作失败')
    }
  } finally {
    const done = new Set(spotlightLikeSubmittingIds.value)
    done.delete(resourceId)
    spotlightLikeSubmittingIds.value = done
  }
}

onMounted(() => {
  setSeoMeta({
    title: '73Info 柒叁信息 - 资源与需求协作平台',
    description:
      '73Info 柒叁信息面向网站开发和小工具场景提供免费资源浏览、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
    path: '/',
  })

  auth.hydrate()
  void loadHomeCheckin()

  const oauthToken =
    typeof route.query.oauth_token === 'string' ? route.query.oauth_token.trim() : ''
  const oauthError =
    typeof route.query.oauth_error === 'string' ? route.query.oauth_error.trim() : ''

  if (oauthToken) {
    auth.setToken(oauthToken)
    TMessage.success('登录成功')
    void router.replace({ query: {} })
  } else if (oauthError) {
    TMessage.error(`登录失败: ${oauthError}`)
    const nextQuery = { ...route.query }
    delete nextQuery.oauth_token
    delete nextQuery.oauth_error
    void router.replace({ query: nextQuery })
  }

  const wechatOauthResult = routeQueryValue('wechat_oauth')
  const wechatOauthError = routeQueryValue('wechat_oauth_error')
  const unionOauthResult = routeQueryValue('union_oauth')
  const unionOauthError = routeQueryValue('union_oauth_error')
  if (wechatOauthResult === 'success') {
    TMessage.success('微信授权成功，请再次点击支付')
  } else if (wechatOauthError) {
    TMessage.error(`微信授权失败：${wechatOauthError}`)
  }
  if (unionOauthResult === 'success') {
    depositChannel.value = 'union'
    TMessage.success('云闪付授权成功，请再次点击支付')
  } else if (unionOauthError) {
    TMessage.error(`云闪付授权失败：${unionOauthError}`)
  }
  if (wechatOauthResult || wechatOauthError || unionOauthResult || unionOauthError) {
    const nextQuery = { ...route.query }
    delete nextQuery.wechat_oauth
    delete nextQuery.wechat_oauth_error
    delete nextQuery.union_oauth
    delete nextQuery.union_oauth_error
    void router.replace({ query: nextQuery })
  }

  void Promise.all([
    loadDepositRatio(),
    loadPendingRequirements(),
    loadRequirementOverview(),
    loadPublicPortalData(),
  ])

  autoRefreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') {
      return
    }
    if (publishLoading.value || depositLoading.value || auth.loading) {
      return
    }
    void runBackgroundAutoRefresh()
  }, AUTO_REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  isMounted = false
  resetSeoMeta()
  resetAuthForm()
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
})

async function runBackgroundAutoRefresh() {
  if (autoRefreshInFlight) {
    return
  }

  autoRefreshInFlight = true
  try {
    if (auth.isAuthed) {
      await Promise.all([
        loadDepositRatio(),
        loadPendingRequirements(true),
        loadRequirementOverview(),
        loadPublicPortalData(true),
      ])
    } else {
      await Promise.all([
        loadPendingRequirements(true),
        loadRequirementOverview(),
        loadPublicPortalData(true),
      ])
    }
  } finally {
    autoRefreshInFlight = false
  }
}

function openDepositCard(item: PendingRequirementView) {
  if (item.status === 'rejected') {
    publishTitle.value = item.title || ''
    publishDescription.value = item.description || ''
    publishBudget.value = item.budget ?? ''
    publishAcceptance.value = item.acceptanceCriteria || ''
    publishPaymentMode.value = item.paymentMode
    // 开发周期清空起手：`PendingRequirementView` 没有带 `development_cycle_days`（见任务报告里的迁移对照表），
    // 这里不能把上一次发布的残留值带进「重新编辑」——担保模式下用户必须自己重填，宁可多填一次也不静默丢。
    publishDevelopmentCycleDays.value = ''
    activeResubmitRequirementId.value = item.id
    router.push({ name: 'home', query: { modal: 'publish' } })
    return
  }

  if (item.status !== 'pending_deposit' && item.status !== 'pending_final') {
    return
  }
  if (!isAdapayRequirement(item)) {
    TMessage.warning('无担保订单不通过平台收款，请由双方按约定自行结算')
    return
  }

  depositPayment.value = null
  depositChannel.value = 'alipay'
  amountCouponCode.value = ''
  discountCouponCode.value = ''
  depositPolicyAccepted.value = false
  contractSigningStatus.value = null
  router.push({ name: 'home', query: { modal: 'deposit', requirement_id: item.id } })
  void loadAvailableCoupons()
  void fetchContractSigningStatus(auth.token, item.id)
    .then((s) => {
      contractSigningStatus.value = s
    })
    .catch(() => {
      /* 忽略，不影响支付流程 */
    })
}

function updateDepositChannel(channel: AdapayBusinessPayChannel) {
  if (depositChannel.value === channel) {
    return
  }
  depositChannel.value = channel
  depositPayment.value = null
}

function canOpenPayment(item: PendingRequirementView) {
  return (
    item.status === 'rejected' || (isAdapayRequirement(item) && item.status === 'pending_final')
  )
}

function selectCoupon(code: string, type: 'amount' | 'percent') {
  if (type === 'amount') {
    if (amountCouponCode.value === code) {
      amountCouponCode.value = ''
      return
    }
    amountCouponCode.value = code
    discountCouponCode.value = ''
    return
  }

  if (discountCouponCode.value === code) {
    discountCouponCode.value = ''
    return
  }

  discountCouponCode.value = code
  amountCouponCode.value = ''
}

function closeDepositCard() {
  depositPolicyAccepted.value = false
  router.replace({ name: 'home' })
}

function finalDepositAmount(item: PendingRequirementView) {
  return calculateFinalDepositAmount(item, depositRatioPercent.value)
}

function finalPaymentAmount(item: PendingRequirementView) {
  return calculateFinalPaymentAmount(item, depositRatioPercent.value)
}

function isAdapayRequirement(item: PendingRequirementView) {
  return item.paymentMode === 'platform_guarantee'
}

const isFinalPayment = computed(() => depositRequirement.value?.status === 'pending_final')

const paymentStageLabel = computed(() => (isFinalPayment.value ? '尾款' : '定金'))

const activeCouponCode = computed(() => {
  if (isFinalPayment.value) {
    return ''
  }
  return amountCouponCode.value.trim() || discountCouponCode.value.trim()
})

const selectedCoupon = computed(() => {
  const code = activeCouponCode.value
  if (!code) {
    return undefined
  }
  return availableCoupons.value.find((item) => item.code === code)
})

const couponBaseAmount = computed(() => {
  if (!depositRequirement.value) {
    return 0
  }
  if (depositRequirement.value.status === 'pending_final') {
    return finalPaymentAmount(depositRequirement.value)
  }
  return finalDepositAmount(depositRequirement.value)
})

const couponDiscount = computed(() =>
  computeCouponDiscount(couponBaseAmount.value, selectedCoupon.value),
)

const couponFinalAmount = computed(() => {
  if (depositRequirement.value && isAdapayRequirement(depositRequirement.value)) {
    return couponBaseAmount.value
  }
  if (couponDiscount.value <= 0) {
    return couponBaseAmount.value
  }
  return Number((couponBaseAmount.value - couponDiscount.value).toFixed(2))
})

const couponSummary = computed(() => {
  if (isFinalPayment.value) {
    return '尾款支付不支持使用优惠券或打折券。'
  }
  if (!activeCouponCode.value) {
    return ''
  }
  if (!selectedCoupon.value) {
    return '请选择下方可用优惠券。'
  }
  if (couponBaseAmount.value < selectedCoupon.value.min_amount_cny) {
    return `该券需满 ¥${selectedCoupon.value.min_amount_cny.toFixed(2)} 可用`
  }
  if (couponDiscount.value <= 0) {
    return '该优惠券暂无法抵扣更多金额。'
  }
  return `当前可抵扣 ¥${couponDiscount.value.toFixed(2)}, 实付 ¥${couponFinalAmount.value.toFixed(2)}`
})

async function loadDepositRatio() {
  if (!auth.isAuthed) {
    return
  }

  try {
    const payload = await getDepositRatio(auth.token)
    if (!payload || !isMounted) {
      return
    }

    if (Number.isFinite(payload.deposit_ratio_percent)) {
      depositRatioPercent.value = payload.deposit_ratio_percent
    }
  } catch {
    // Keep default ratio when settings API is unavailable.
  }
}

function computeCouponDiscount(amount: number, coupon?: CouponItem) {
  if (!coupon) {
    return 0
  }

  if (amount < coupon.min_amount_cny) {
    return 0
  }

  const rawDiscount =
    coupon.discount_type === 'amount'
      ? coupon.discount_value
      : (amount * coupon.discount_value) / 100

  const cappedDiscount =
    coupon.max_discount_cny != null ? Math.min(rawDiscount, coupon.max_discount_cny) : rawDiscount

  const discount = Math.max(0, Math.min(cappedDiscount, amount - 0.01))
  return Number(discount.toFixed(2))
}

async function loadAvailableCoupons() {
  if (!auth.isAuthed) {
    availableCoupons.value = []
    return
  }

  couponLoading.value = true
  try {
    const coupons = await listAvailableCoupons(auth.token)
    if (!isMounted) {
      return
    }
    availableCoupons.value = coupons
  } catch (err) {
    if (isMounted) {
      TMessage.error(err instanceof Error ? err.message : '加载优惠券失败')
    }
  } finally {
    if (isMounted) {
      couponLoading.value = false
    }
  }
}

async function loadPendingRequirements(silent = false) {
  if (!auth.isAuthed) {
    pendingRequirements.value = []
    return
  }

  try {
    const rows = await listRequirements(auth.token)
    if (!isMounted) {
      return
    }
    pendingRequirements.value = rows
      .filter((item) => item.status !== 'completed')
      .slice(0, 8)
      .map((item) => ({
        id: item.requirement_id,
        title: item.title,
        status: item.status,
        statusLabel: statusToLabel(item.status, item.payment_mode),
        updatedAtLabel: formatTimeLabel(item.updated_at),
        description: item.description,
        acceptanceCriteria: item.acceptance_criteria,
        budget: item.budget,
        paymentMode: item.payment_mode,
      }))
  } catch (err) {
    if (isMounted && !silent) {
      TMessage.error(err instanceof Error ? err.message : '加载需求失败')
    }
  }
}

async function loadRequirementOverview() {
  try {
    const payload = await getPublicRequirementOverview()
    if (!isMounted) {
      return
    }
    publicDeveloperCount.value = Number(payload.developer_count ?? 0)
    metrics.value = [
      {
        label: '已完成需求数',
        value: `${payload.total_orders ?? 0} 单`,
      },
      {
        label: '好评率',
        value: `${payload.positive_rate?.toFixed(1) ?? '0.0'}%`,
      },
      {
        label: '已支付订单累计金额',
        value: `¥ ${(payload.total_turnover_cny ?? 0).toFixed(2)}`,
      },
    ]

    latestDeals.value = (payload.recent_deals ?? []).map((item) => ({
      title: item.title,
      at: formatTimeLabel(item.paid_at),
    }))
  } catch {
    // Keep current values if overview API fails.
  }
}

async function loadPublicPortalData(silent = false) {
  const resourceToken = auth.isAuthed && auth.token.trim() ? auth.token : null
  const [resourcesResult, requirementsResult, announcementsResult, promoMetaResult] =
    await Promise.allSettled([
      listAllPublicMcResources(resourceToken),
      // 首页只用最新一条需求做公告，取 1 条即可。
      listPublicRequirementSpotlights(1, 1),
      listCommunityPosts({ tag: '公告', limit: 5, offset: 0 }),
      getResourcePromoMeta(resourceToken ?? undefined),
    ])
  void ensureTagTree()

  if (!isMounted) {
    return
  }

  if (promoMetaResult.status === 'fulfilled') {
    applyHighLikeThreshold(promoMetaResult.value.high_like_threshold)
  }

  // 去到重 / 排序 / 清空都在 `usePublicResources` 里，视图只负责「哪一批请求成功了」。
  applyResourceList(resourcesResult.status === 'fulfilled' ? resourcesResult.value : null)

  if (requirementsResult.status === 'fulfilled') {
    publicRequirementSpotlights.value = requirementsResult.value.items
  } else {
    publicRequirementSpotlights.value = []
  }

  if (announcementsResult.status === 'fulfilled') {
    announcementPosts.value = announcementsResult.value.filter(
      (post) => post.status === 'published',
    )
  } else {
    announcementPosts.value = []
  }

  const failedResults = [resourcesResult, requirementsResult].filter(
    (result) => result.status === 'rejected',
  )
  if (failedResults.length > 0 && failedResults.length < 2 && !silent) {
    TMessage.warning('部分首页公开数据加载失败，已显示可用数据')
  } else if (failedResults.length === 2 && !silent) {
    TMessage.warning('加载首页公开数据失败')
  }
  // 榜单成员的徽章不在这里取：`usePortalRanks` 按入榜用户名指纹自己触发，资源没变就不重复请求。
}

async function submitDepositPayment() {
  if (!depositRequirement.value) {
    return
  }

  if (depositRequirement.value.status === 'pending_deposit' && !depositPolicyAccepted.value) {
    TMessage.warning('请先确认“定金服务费与退款规则”后再支付定金')
    return
  }

  const currentStage = depositRequirement.value.status === 'pending_final' ? '尾款' : '定金'
  const channel = depositChannel.value
  const clientPlatform = getAdapayClientPlatform()
  if (!isAdapayRequirement(depositRequirement.value)) {
    TMessage.warning('无担保订单不通过平台收款，请由双方按约定自行结算')
    return
  }

  depositLoading.value = true
  try {
    if (!depositPayment.value) {
      // 定金可带券（P6 / BUG-025）：金额券与折扣券互斥，取了哪张就传哪张；尾款不接券。
      const couponCode =
        currentStage === '定金'
          ? amountCouponCode.value || discountCouponCode.value || undefined
          : undefined
      const adapayPayment: AdapayPaymentResponse = await createAdapayPayment(
        auth.token,
        depositRequirement.value.id,
        currentStage === '定金' ? 'deposit' : 'final',
        channel,
        clientPlatform,
        couponCode,
      )
      depositPayment.value = {
        payment_id: adapayPayment.paymentId,
        requirement_id: adapayPayment.requirementId,
        channel,
        amount_cny: Number(adapayPayment.amountCny),
        status: adapayPayment.status,
        alipay_order_string: adapayPayment.payUrl ?? '',
        expires_at: '',
        adapay: true,
      }
      TMessage.success(`${currentStage}支付订单已生成，正在跳转支付页`)
      router.push({
        name: 'payment',
        query: buildAdapayPaymentQuery({
          paymentId: depositPayment.value.payment_id,
          requirementId: adapayPayment.requirementId,
          channel,
          clientPlatform,
          amountCny: adapayPayment.amountCny,
          qrContent: adapayPayment.payUrl,
        }),
      })
      return
    }

    if (depositPayment.value.adapay) {
      const adapayPayment = await getAdapayPayment(auth.token, depositPayment.value.payment_id)
      if (adapayPayment.status !== 'paid' && adapayPayment.status !== 'confirmed') {
        TMessage.warning('支付尚未完成，请先完成 Adapay 支付')
        return
      }
      TMessage.success(`${currentStage}支付确认成功`)
      depositPayment.value = null
      void router.replace({ name: 'home' })
      await loadPendingRequirements()
      return
    }

    throw new Error('支付订单状态无效，请重新发起 Adapay 支付')
  } catch (err) {
    const message = err instanceof Error ? err.message : '支付失败'
    if (isWechatPaymentAuthorizationRequired(err)) {
      // 尚未绑定 open_id：直接跳转到支付页（意图模式），由支付页在微信内自动静默授权并下单，
      // 避免在 PC 侧先弹授权二维码、再点一次支付的额外步骤。
      if (!depositRequirement.value) {
        return
      }
      const expectedAmount =
        currentStage === '定金'
          ? finalDepositAmount(depositRequirement.value)
          : finalPaymentAmount(depositRequirement.value)
      router.push({
        name: 'payment',
        query: buildAdapayPaymentQuery({
          requirementId: depositRequirement.value.id,
          milestone: currentStage === '定金' ? 'deposit' : 'final',
          channel: 'wechat',
          clientPlatform,
          amountCny: expectedAmount,
          intent: true,
        }),
      })
      return
    } else if (isUnionPaymentAuthorizationRequired(err)) {
      if (clientPlatform !== 'mobile') {
        TMessage.warning('云闪付授权仅适用于移动端，请重新选择支付方式')
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
        TMessage.error(
          authorizationError instanceof Error ? authorizationError.message : '发起云闪付授权失败',
        )
        return
      }
    } else if (
      message.includes(
        'developer must sign first and user must sign after that before paying deposit',
      ) ||
      message.includes('requirement contract must be signed by developer before paying deposit') ||
      message.includes('contract must be created before paying deposit')
    ) {
      TMessage.warning('当前需求需先由开发者（乙方）签署，再由您（甲方）签署协议后，才能支付定金')
    } else {
      TMessage.error(message)
    }
  } finally {
    depositLoading.value = false
  }
}

function openAuth(mode: AuthMode, redirectTo = authRedirectTarget.value) {
  const inviteCodeToKeep = authInviteCode.value.trim() || routeInviteCode.value
  const shareTypeToKeep = authShareType.value.trim() || routeShareType.value
  const shareTargetIdToKeep = authShareTargetId.value.trim() || routeShareTargetId.value
  resetAuthForm()
  const nextQuery: Record<string, string> = { modal: 'auth', mode }
  const normalizedRedirectTo = redirectTo.trim()
  if (
    normalizedRedirectTo &&
    normalizedRedirectTo.startsWith('/') &&
    !normalizedRedirectTo.startsWith('//')
  ) {
    nextQuery.redirect_to = normalizedRedirectTo
  }
  if (inviteCodeToKeep) {
    nextQuery.invite_code = inviteCodeToKeep
  }
  if (shareTypeToKeep) {
    nextQuery.share_type = shareTypeToKeep
  }
  if (shareTargetIdToKeep) {
    nextQuery.share_target_id = shareTargetIdToKeep
  }
  if (mode === 'register' && inviteCodeToKeep) {
    authInviteCode.value = inviteCodeToKeep
    authShareType.value = shareTypeToKeep
    authShareTargetId.value = shareTargetIdToKeep
  }
  router.push({ name: 'home', query: nextQuery })
}

function closeAuth() {
  acceptTerms.value = false
  router.replace({ name: 'home' })
}

async function sendAuthCode() {
  await sendAuthCodeAction()
}

async function submitAuth() {
  const result = await submitAuthAction()
  if (result) {
    acceptTerms.value = false
    if (authRedirectTarget.value) {
      void router.replace(authRedirectTarget.value)
      return
    }

    void router.replace({ name: 'home' })
    await Promise.all([
      loadDepositRatio(),
      loadPendingRequirements(),
      loadRequirementOverview(),
      loadPublicPortalData(),
    ])
  }
}

async function ensurePublishRealnameApproved() {
  const publishRedirectTarget = router.resolve({
    name: 'home',
    query: { modal: 'publish' },
  }).fullPath

  auth.hydrate()
  if (!auth.isAuthed) {
    TMessage.info('发布需求前请先登录')
    openAuth('login', publishRedirectTarget)
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
    void router.push({ name: 'workbench-realname', query: { redirect_to: publishRedirectTarget } })
    return false
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      TMessage.warning('发布需求前请先完成实名认证')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: publishRedirectTarget },
      })
      return false
    }

    TMessage.error(err instanceof Error ? err.message : '实名认证状态校验失败')
    return false
  }
}

async function openPublishModal() {
  const approved = await ensurePublishRealnameApproved()
  if (!approved) {
    return
  }

  activeResubmitRequirementId.value = null
  publishTitle.value = ''
  publishDescription.value = ''
  publishBudget.value = ''
  publishAcceptance.value = ''
  publishPaymentMode.value = 'self_managed'
  publishDevelopmentCycleDays.value = ''
  await router.push({ name: 'home', query: { modal: 'publish' } })
}

function openPrimaryPublishAction() {
  if (isDeveloperAccount.value) {
    void router.push({ name: 'dev-plugins' })
    return
  }

  void openPublishModal()
}

function closePublishModal() {
  activeResubmitRequirementId.value = null
  router.replace({ name: 'home' })
}

const publishModalTitle = computed(() =>
  activeResubmitRequirementId.value ? '重新编辑需求' : '发布需求',
)

const publishModalSubmitText = computed(() =>
  activeResubmitRequirementId.value ? '重新提交审核' : '确认发布',
)

const publishModalLoadingText = computed(() =>
  activeResubmitRequirementId.value ? '提交中...' : '发布中...',
)

async function submitPublishRequirement() {
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

  // R014：担保需求必填「开发周期（天）」，且必须是正整数。位置排在最后一步（标题 → 描述 → 预算 → 验收标准
  // → 周期），与工厂 `validateRequirementPublishForm` 的顺序、文案同源：判定直接调
  // `validateDevelopmentCycleInput`，这里不重写规则。自管模式该步恒为空（不要求、也不展示）。
  const developmentCycleError = validateDevelopmentCycleInput(
    publishDevelopmentCycleDays.value,
    publishPaymentMode.value,
  )

  if (developmentCycleError) {
    TMessage.error(developmentCycleError)
    return
  }

  publishLoading.value = true

  try {
    const payload = {
      title: normalizedTitle,
      description: descriptionValidation.value,
      budget,
      acceptance_criteria: acceptanceValidation.value,
      payment_mode: publishPaymentMode.value,
      // 口径与工厂一致：自管模式归一化成 `undefined`（`JSON.stringify` 把键丢掉，后端收到「未填」），
      // 担保模式给填写的正整数。少了这个键，担保需求的合同有效期算不出来。
      development_cycle_days: normalizeDevelopmentCycle(
        publishDevelopmentCycleDays.value,
        publishPaymentMode.value,
      ),
    }

    if (activeResubmitRequirementId.value) {
      await resubmitRequirement(auth.token, activeResubmitRequirementId.value, payload)
    } else {
      await createRequirement(auth.token, payload)
    }

    if (!isMounted) {
      return
    }

    const wasResubmit = Boolean(activeResubmitRequirementId.value)
    const resubmitId = activeResubmitRequirementId.value
    activeResubmitRequirementId.value = null
    publishTitle.value = ''
    publishDescription.value = ''
    publishBudget.value = ''
    publishAcceptance.value = ''
    publishPaymentMode.value = 'self_managed'
    publishDevelopmentCycleDays.value = ''
    if (resubmitId) {
      publishModalRef.value?.clearDraft(`edit-${resubmitId}`)
    } else {
      publishModalRef.value?.clearDraft()
    }
    TMessage.success(wasResubmit ? '需求已重新提交，等待审核' : '需求已发布')
    void router.replace({ name: 'home' })
    await loadPendingRequirements()
  } catch (err) {
    if (isMounted) {
      TMessage.error(err instanceof Error ? err.message : '发布失败')
    }
  } finally {
    if (isMounted) {
      publishLoading.value = false
    }
  }
}
</script>

<template>
  <main id="top" class="portal-home">
    <div class="portal-shell">
      <div class="portal-layout">
        <div class="portal-main">
          <section class="portal-hero">
            <div class="portal-hero__main">
              <div class="portal-hero__copy">
                <h1>
                  <span>资源与需求</span><span class="portal-title-accent">协作</span
                  ><span>平台</span>
                </h1>

                <div v-if="heroSignals.length" class="portal-signal-list">
                  <span v-for="signal in heroSignals" :key="signal" class="portal-signal">{{
                    signal
                  }}</span>
                </div>

                <div class="portal-hero__actions">
                  <button
                    class="portal-primary-action portal-publish-action"
                    type="button"
                    @click="openPrimaryPublishAction"
                  >
                    {{ isDeveloperAccount ? '发布资源' : '发布需求' }}
                  </button>
                  <button class="portal-secondary-action" type="button" @click="openDevWorkbench">
                    {{ devActionLabel }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 移动端入口宫格：替代主视觉里的两颗按钮与下方两张大卡片，一个图标配一行字、上下排；
               主视觉在移动端只留作横幅（后期改轮播图） -->
          <nav class="portal-entry-grid" aria-label="快捷入口">
            <button
              type="button"
              class="portal-entry portal-entry--publish"
              @click="openPrimaryPublishAction"
            >
              <span class="portal-entry__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
                </svg>
              </span>
              <span class="portal-entry__label">{{
                isDeveloperAccount ? '发布资源' : '发布需求'
              }}</span>
            </button>
            <button type="button" class="portal-entry portal-entry--take" @click="openDevWorkbench">
              <span class="portal-entry__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M3 13h18" />
                </svg>
              </span>
              <span class="portal-entry__label">{{ devActionLabel }}</span>
            </button>
            <button
              type="button"
              class="portal-entry portal-entry--free"
              @click="router.push({ name: 'resources', query: { sale: 'free' } })"
            >
              <span class="portal-entry__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="8" width="18" height="4" rx="1" />
                  <path d="M12 8v13" />
                  <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                  <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
                </svg>
              </span>
              <span class="portal-entry__label">免费资源</span>
            </button>
            <button
              type="button"
              class="portal-entry portal-entry--community"
              @click="router.push({ name: 'community' })"
            >
              <span class="portal-entry__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
                  <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
                </svg>
              </span>
              <span class="portal-entry__label">社区交流</span>
            </button>
          </nav>

          <section class="portal-quick-grid">
            <article
              v-for="panel in quickPanels"
              :key="panel.title"
              class="portal-quick-card"
              :class="`portal-quick-card--${panel.tone}`"
              role="button"
              tabindex="0"
              @click="openQuickPanel(panel)"
              @keydown.enter="openQuickPanel(panel)"
              @keydown.space.prevent="openQuickPanel(panel)"
            >
              <div class="portal-quick-card__icon" aria-hidden="true">
                <svg
                  v-if="panel.tone === 'gift'"
                  class="portal-quick-card__svg"
                  viewBox="0 0 96 96"
                  focusable="false"
                >
                  <defs>
                    <linearGradient id="quickGiftRed" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stop-color="#ff8c5a" />
                      <stop offset="100%" stop-color="#ef3f5f" />
                    </linearGradient>
                    <linearGradient id="quickGiftYellow" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stop-color="#ffd75f" />
                      <stop offset="100%" stop-color="#ff9f1c" />
                    </linearGradient>
                    <filter id="quickIconShadow" x="-30%" y="-20%" width="160%" height="160%">
                      <feDropShadow
                        dx="0"
                        dy="9"
                        stdDeviation="7"
                        flood-color="#ef4444"
                        flood-opacity="0.22"
                      />
                    </filter>
                  </defs>
                  <g filter="url(#quickIconShadow)">
                    <path
                      fill="url(#quickGiftRed)"
                      d="M17 38h62v39a7 7 0 0 1-7 7H24a7 7 0 0 1-7-7V38Z"
                    />
                    <path fill="#d9274a" d="M17 38h62v16H17z" opacity="0.45" />
                    <path fill="url(#quickGiftYellow)" d="M43 38h10v46H43zM12 28h72v16H12z" />
                    <path
                      fill="url(#quickGiftRed)"
                      d="M24 14c10-5 20 8 24 17-12 2-27 1-30-6-2-4 1-8 6-11Zm48 0c-10-5-20 8-24 17 12 2 27 1 30-6 2-4-1-8-6-11Z"
                    />
                    <path fill="url(#quickGiftYellow)" d="M42 20h12l-6 18-6-18Z" />
                  </g>
                </svg>
                <svg v-else class="portal-quick-card__svg" viewBox="0 0 96 96" focusable="false">
                  <defs>
                    <linearGradient id="quickCaseOrange" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stop-color="#ffb15c" />
                      <stop offset="100%" stop-color="#f97316" />
                    </linearGradient>
                    <filter id="quickCaseShadow" x="-30%" y="-20%" width="160%" height="160%">
                      <feDropShadow
                        dx="0"
                        dy="9"
                        stdDeviation="7"
                        flood-color="#f97316"
                        flood-opacity="0.2"
                      />
                    </filter>
                  </defs>
                  <g filter="url(#quickCaseShadow)">
                    <path
                      fill="url(#quickCaseOrange)"
                      d="M20 30a12 12 0 0 1 12-12h32a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H44l-14 10v-10h-6a12 12 0 0 1-4-23z"
                    />
                    <circle cx="36" cy="44" r="4" fill="#fff7ed" />
                    <circle cx="48" cy="44" r="4" fill="#fff7ed" />
                    <circle cx="60" cy="44" r="4" fill="#fff7ed" />
                  </g>
                </svg>
              </div>
              <div class="portal-quick-card__copy">
                <h3>{{ panel.title }}</h3>
                <p>{{ panel.summary }}</p>
                <span class="portal-inline-action">
                  {{ panel.action }}
                  <TIcon>
                    <ArrowRight />
                  </TIcon>
                </span>
              </div>
            </article>
          </section>

          <section class="portal-section portal-section--workflow">
            <div class="portal-section__header">
              <div class="portal-section-title portal-section-title--plain">
                <h2>定制流程</h2>
              </div>
            </div>
            <div class="portal-workflow-grid" aria-label="定制流程">
              <div
                v-for="(step, index) in workflowSteps"
                :key="step.step + step.title"
                class="portal-workflow-item"
              >
                <button
                  class="portal-step-card"
                  :class="`portal-step-card--${step.accent}`"
                  type="button"
                  @click="openWorkflowStep(step)"
                >
                  <span class="portal-step-card__icon" aria-hidden="true">{{ step.icon }}</span>
                  <span class="portal-step-card__body">
                    <strong
                      ><i class="portal-step-card__no">{{ step.step }}. </i>{{ step.title }}</strong
                    >
                    <span>{{ step.summary }}</span>
                  </span>
                </button>
                <span
                  v-if="index < workflowSteps.length - 1"
                  class="portal-step-card__arrow"
                  aria-hidden="true"
                  >›</span
                >
              </div>
            </div>
          </section>

          <!-- 精选资源区（卡片映射 / 分页 / 跑马灯 / 点赞回抛）在 components/home/SpotlightResourceSection.vue -->
          <SpotlightResourceSection
            :resources="publicResources"
            :high-like-threshold="highLikeThreshold"
            :like-submitting-ids="spotlightLikeSubmittingIds"
            @open="openSpotlight"
            @like="toggleSpotlightLike"
            @more="router.push({ name: 'resources', query: { sale: 'free' } })"
          />
        </div>

        <aside class="portal-sidebar">
          <PortalBetaCard
            :is-authed="auth.isAuthed"
            :checkin="homeCheckinStatus"
            :checkin-saving="checkinHomeSaving"
            @checkin="handleHomeCheckin"
            @open-group="openBetaGroup"
          />

          <PortalNoticeCard
            :notices="portalNotices"
            @open-notice="openPortalNotice"
            @more="router.push({ name: 'community' })"
          />

          <PortalMilestoneCard
            :stats="platformStats"
            :is-developer-account="isDeveloperAccount"
            @open-resource-init="openResourceInit"
          />

          <DeveloperRankCard
            :ranks="developerRanks"
            :badges="developerBadges"
            :total-resources="totalContribResources"
            @open-developer="openDeveloperProfile"
          />
          <TeamRankCard
            v-if="teamRanks.length > 0"
            :ranks="teamRanks"
            @open-team="openTeamProfile"
          />
        </aside>
      </div>
    </div>

    <AuthModal
      :visible="authVisible"
      :authMode="routeAuthMode"
      :authTitle="authTitle"
      v-model:authUsername="authUsername"
      v-model:authPassword="authPassword"
      v-model:authEmail="authEmail"
      v-model:authEmailCode="authEmailCode"
      v-model:authInviteCode="authInviteCode"
      v-model:turnstileToken="authTurnstileToken"
      v-model:acceptTerms="acceptTerms"
      :authLoading="auth.loading"
      :loginRequiresTwoFactor="loginRequiresTwoFactor"
      :githubLoginLoading="githubLoading"
      :wechatLoginLoading="wechatLoginLoading"
      :qqLoginLoading="qqLoginLoading"
      :giteeLoginLoading="giteeLoading"
      :githubLoginAvailable="githubAvailable"
      :wechatLoginAvailable="wechatAvailable"
      :qqLoginAvailable="qqAvailable"
      :giteeLoginAvailable="giteeAvailable"
      :sendCodeLoading="sendCodeLoading"
      :sendCodeCountdown="sendCodeCountdown"
      @close="closeAuth"
      @submit="submitAuth"
      @loginWithGithub="loginWithGithub"
      @loginWithWechat="loginWithWechat"
      @loginWithQq="loginWithQq"
      @loginWithGitee="loginWithGitee"
      @sendAuthCode="sendAuthCode"
      @change-mode="openAuth"
    />

    <WechatLoginQrModal
      :visible="wechatQrLogin.visible"
      :url="wechatQrLogin.url"
      :state="wechatQrLogin.state"
      :poll-secret="wechatQrLogin.pollSecret"
      @close="closeWechatQrLogin"
      @refresh="refreshWechatQrLogin"
      @logged-in="handleWechatQrToken"
    />

    <PublishModal
      ref="publishModalRef"
      :visible="publishVisible"
      v-model:publishTitle="publishTitle"
      v-model:publishDescription="publishDescription"
      v-model:publishBudget="publishBudget"
      v-model:publishAcceptance="publishAcceptance"
      v-model:publishPaymentMode="publishPaymentMode"
      v-model:publishDevelopmentCycleDays="publishDevelopmentCycleDays"
      :modalTitle="publishModalTitle"
      :submitText="publishModalSubmitText"
      :loadingText="publishModalLoadingText"
      :publishLoading="publishLoading"
      :draft-scope="
        activeResubmitRequirementId
          ? `edit-${activeResubmitRequirementId}`
          : auth.isAuthed
            ? auth.username
            : 'default'
      "
      @close="closePublishModal"
      @notify="notify"
      @submit="submitPublishRequirement"
    />

    <DepositModal
      v-if="depositVisible && depositRequirement"
      :visible="depositVisible"
      :depositRequirement="depositRequirement"
      :formattedBudget="formatMoney(depositRequirement.budget)"
      :paymentStageLabel="paymentStageLabel"
      :depositChannel="depositChannel"
      :amountCouponCode="amountCouponCode"
      :discountCouponCode="discountCouponCode"
      :isFinalPayment="isFinalPayment"
      :depositRatioPercent="depositRatioPercent"
      :couponSummary="couponSummary"
      :availableCoupons="availableCoupons"
      :couponLoading="couponLoading"
      :depositLoading="depositLoading"
      :depositPayment="depositPayment"
      :couponFinalAmount="couponFinalAmount"
      :isEscrowPayment="depositRequirement.paymentMode === 'platform_guarantee'"
      :depositPolicyAccepted="depositPolicyAccepted"
      :contractSigningStatus="contractSigningStatus"
      @close="closeDepositCard"
      @submit="submitDepositPayment"
      @update:depositPolicyAccepted="depositPolicyAccepted = $event"
      @update:depositChannel="updateDepositChannel"
      @selectCoupon="selectCoupon"
      @loadAvailableCoupons="loadAvailableCoupons"
    />
  </main>
</template>
