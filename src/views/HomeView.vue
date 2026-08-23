<script setup lang="ts">
import '@/styles/home.css'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Files, Finished, Money, User } from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/auth'
import AuthModal from '@/components/AuthModal.vue'
import PublishModal from '@/components/PublishModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import { buildDevPortalUrl } from '@/config/runtime'
import { useToast } from '@/composables/useToast'
import { useAuthForm } from '@/composables/useAuthForm'
import { validateRequirementRichText } from '@/utils/requirementRichText'
import {
  confirmPayment,
  createAlipayPagePayment,
  createPayment,
  type AlipayCreatePaymentResp,
  type AlipayPageCreatePaymentResp,
  type WechatCreatePaymentResp,
} from '@/api/payments'
import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { HttpError, apiUrl } from '@/api/http'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import { getMyRealnameVerification } from '@/api/realname'
import { requestDevRole } from '@/dev/api/auth'
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
import { getResourceDetailSlug, normalizeTagName } from '@/api/resourceTags'
import { useTagTreeStore } from '@/stores/tagTree'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import { getUserBadges, type UserBadge } from '@/api/invite'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

type Metric = {
  label: string
  value: string
}

type PlatformStat = {
  label: string
  value: string
  icon: typeof User
  disabledReason?: string
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
  paymentMethod?: string | null
  paymentMode: RequirementPaymentMode
}

type AuthMode = 'login' | 'register' | 'reset'
type PortalNotice = {
  title: string
  date: string
  tag?: string
  to?: RouteLocationRaw
}

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

type SpotlightCard = {
  kind: 'requirement' | 'resource'
  title: string
  summary: string
  budget: string
  status: string
  badge: string
  metaSecondary: string
  accent: string
  coverUrl?: string
  coverAlt?: string
  requirementId?: string
  resourceId?: number
}

type DeveloperRank = {
  name: string
  username: string
  avatarUrl: string
  creditScore: number | null
  deals: string
}

type TeamRank = {
  teamId: number
  teamName: string
  resourceCount: number
}

const TOP_LIKED_RESOURCE_LIMIT = 16

const mockDeveloperRanks: DeveloperRank[] = [
  {
    name: '示例开发者',
    username: 'demo-developer',
    avatarUrl: '',
    creditScore: 98,
    deals: '3 个资源',
  },
  {
    name: '资源创作者',
    username: 'resource-maker',
    avatarUrl: '',
    creditScore: 95,
    deals: '2 个资源',
  },
]

const failedDeveloperAvatarUrls = ref<Set<string>>(new Set())
const failedSpotlightCoverUrls = ref<Set<string>>(new Set())

const metrics = ref<Metric[]>([
  { label: '累计完成', value: '0 单' },
  { label: '综合评价', value: '5.00 分' },
  { label: '累计成交额', value: '¥ 0.00' },
])
const AUTO_REFRESH_INTERVAL_MS = 300_000

type LatestDealView = {
  paymentId: string
  requirementId: string
  title: string
  amount: string
  at: string
  rating?: number | null
  comment?: string | null
  commentedAt?: string | null
}

const latestDeals = ref<LatestDealView[]>([])
const selectedDeal = ref<LatestDealView | null>(null)
const dealDetailVisible = ref(false)
const publicDeveloperCount = ref(0)
const pendingRequirements = ref<PendingRequirementView[]>([])
const publicRequirementSpotlights = ref<PublicRequirementSpotlightItem[]>([])
const tagTreeStore = useTagTreeStore()
const processedTagTree = computed(() => tagTreeStore.tree ?? ({ roots: [] } as { roots: never[] }))
const publicResources = ref<PublicMcResourceItem[]>([])
const developerBadges = ref<Record<string, UserBadge[]>>({})
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

function openBetaGroup() {
  window.open(qqBetaGroupUrl, '_blank', 'noopener,noreferrer')
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
  acceptTerms,
  loginRequiresTwoFactor,
  sendCodeLoading,
  sendCodeCountdown,
  githubLoading,
  resetAuthForm,
  loginWithGithub,
  sendAuthCode: sendAuthCodeAction,
  submitAuth: submitAuthAction,
} = useAuthForm(routeAuthMode)
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
let autoRefreshInFlight = false
let isMounted = true
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const depositChannel = ref<'alipay' | 'wechat'>('alipay')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
const activeResubmitRequirementId = ref<string | null>(null)
const publishLoading = ref(false)
const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
const homeRefreshLoading = ref(false)
const depositRequirement = computed<PendingRequirementView | null>(() => {
  const id = String(route.query.requirement_id || '')
  return pendingRequirements.value.find((item) => item.id === id) ?? null
})
const depositPayment = ref<AlipayCreatePaymentResp | null>(null)
const depositLoading = ref(false)
const depositRatioPercent = ref(20)
const availableCoupons = ref<CouponItem[]>([])
const amountCouponCode = ref('')
const discountCouponCode = ref('')
const depositPolicyAccepted = ref(false)
const couponLoading = ref(false)
const contractSigningStatus = ref<ContractSigningStatus | null>(null)
const { showToast } = useToast()
const heroSignals = ['免费资源共享', '需求记录留痕', '工单沟通协作']
const qqBetaGroupUrl = 'https://qm.qq.com/q/AXb3VBPurC'
const isDeveloperAccount = computed(() => auth.role === 'dev' || auth.role === 'super_admin')
const devActionLabel = computed(() =>
  isDeveloperAccount.value ? '开始接单' : '成为开发者',
)

const portalNotices = computed<PortalNotice[]>(() => {
  const notices: PortalNotice[] = []

  if (latestDeals.value[0]) {
    notices.push({
      title: `最新成交：${latestDeals.value[0].title}`,
      date: latestDeals.value[0].at,
      tag: 'HOT',
    })
  }

  if (publicResources.value[0]) {
    const resourceRoute = resolveResourceRoute(publicResources.value[0])
    notices.push({
      title: `公开资源：${publicResources.value[0].title}`,
      date: formatTimeLabel(publicResources.value[0].updated_at),
      tag: normalizeTagName(publicResources.value[0].platform),
      to: resourceRoute
        ? {
          name: 'resource-detail',
          params: {
            rootSlug: resourceRoute.rootSlug,
            entrySlug: resourceRoute.entrySlug,
            resourceSlug: getResourceDetailSlug(
              publicResources.value[0].id,
              publicResources.value[0].creator || publicResources.value[0].author,
            ),
          },
        }
        : { name: 'free-resources' },
    })
  }

  if (publicRequirementSpotlights.value[0]) {
    notices.push({
      title: `需求：${publicRequirementSpotlights.value[0].title}`,
      date: formatTimeLabel(publicRequirementSpotlights.value[0].updated_at),
      tag: statusToLabel(publicRequirementSpotlights.value[0].status),
      to: { name: 'requirement-hall' },
    })
  }

  if (pendingRequirements.value[0]) {
    notices.push({
      title: `我的需求：${pendingRequirements.value[0].title}`,
      date: pendingRequirements.value[0].updatedAtLabel,
      tag: pendingRequirements.value[0].statusLabel,
      to: { name: 'workbench-requirements' },
    })
  }

  return notices.slice(0, 4)
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
  // 已成为开发者：进入需求大厅（开始接单）。
  if (isDeveloperAccount.value) {
    void router.push({ name: 'dev-requirement-hall' })
    return
  }

  // 未登录：先去登录
  if (!auth.isAuthed) {
    void router.push(buildDevPortalUrl(auth.token))
    return
  }

  // 双轨制：dev 角色仅需实名成年即可授予（不再强制签署《开发者入驻协议》）。
  // 直接申请开发者角色；未实名/未成年则由后端 403 提示，前端引导去实名认证。
  try {
    const result = await requestDevRole(auth.token)
    if (result.role) {
      await auth.fetchProfile(true)
      showToast('开发者权限已开通，正在进入需求大厅', 'success')
      void router.push({ name: 'dev-requirement-hall' })
      return
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      const message = error.message || '申请开发者权限失败'
      if (message.includes('实名')) {
        showToast('请先完成实名认证后再申请开发者权限', 'warning')
        void router.push({
          name: 'workbench-realname',
          query: { redirect_to: '/workbench/developer/resources/plugins-init' },
        })
        return
      }
      showToast(message, 'warning')
      return
    }
    showToast(error instanceof Error ? error.message : '申请开发者权限失败', 'error')
  }

  // 兜底：进入 dev 入口（由路由守卫 ensureDevAccess 处理）
  void router.push(buildDevPortalUrl(auth.token))
}

function openQuickPanel(panel: QuickPanel) {
  if (panel.tone === 'gift') {
    void router.push({ name: 'free-resources' })
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
    showToast('登录后可查看需求进度', 'info')
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
      showToast('资源详情正在加载中', 'info')
      return
    }

    const routeParams = resolveResourceRoute(target)
    if (!routeParams) {
      showToast('资源目录暂未配置完整标签路由', 'warning')
      return
    }

    void router.push({
      name: 'resource-detail',
      params: {
        rootSlug: routeParams.rootSlug,
        entrySlug: routeParams.entrySlug,
        resourceSlug: getResourceDetailSlug(target.id, target.creator || target.author),
      },
    })
    return
  }

  const target = pendingRequirements.value.find((item) => item.title === card.title)
  if (target && canOpenPayment(target)) {
    openDepositCard(target)
    return
  }

  showToast('请进入需求大厅查看需求', 'info')
}

const platformStats = computed<PlatformStat[]>(() => {
  const [completed, , turnover] = metrics.value
  const resourceCount = publicResources.value.length

  return [
    { label: '内测开发者', value: `${publicDeveloperCount.value} 位`, icon: User },
    { label: '公开资源', value: `${resourceCount} 条`, icon: Files },
    { label: '完成记录', value: completed?.value ?? '0 单', icon: Finished },
    {
      label: '担保交易',
      value: '暂未开放',
      icon: Money,
      disabledReason: `历史支付统计：${turnover?.value ?? '¥ 0.00'}。涉及许可的交易担保、资金托管、代收代付和自动分账服务暂未开放。`,
    },
  ]
})

const developerRanks = computed<DeveloperRank[]>(() => {
  const failedAvatarUrls = failedDeveloperAvatarUrls.value
  const groupedResources = new Map<
    string,
    { name: string; username: string; avatarUrl: string; creditScore: number | null; deals: number; latestAt: number }
  >()

  for (const resource of publicResources.value) {
    const name = resource.creator.trim() || resource.author.trim() || '匿名开发者'
    const username = resource.creator.trim() || ''
    const current = groupedResources.get(username)
    const latestAt = Date.parse(resource.updated_at)
    const avatarUrl = resource.creator_avatar_url ? apiUrl(resource.creator_avatar_url) : ''
    const creditScore =
      typeof resource.creator_credit_score === 'number' ? resource.creator_credit_score : null

    if (current) {
      current.deals += 1
      current.latestAt = Math.max(
        current.latestAt,
        Number.isNaN(latestAt) ? current.latestAt : latestAt,
      )
      if (!current.avatarUrl && avatarUrl) {
        current.avatarUrl = avatarUrl
      }
      if (current.creditScore == null && creditScore != null) {
        current.creditScore = creditScore
      }
      continue
    }

    groupedResources.set(username, {
      name,
      username,
      avatarUrl,
      creditScore,
      deals: 1,
      latestAt: Number.isNaN(latestAt) ? 0 : latestAt,
    })
  }

  if (groupedResources.size === 0) return mockDeveloperRanks

  return [...groupedResources.values()]
    .sort(
      (left, right) =>
        right.deals - left.deals ||
        right.latestAt - left.latestAt ||
        left.username.localeCompare(right.username, 'zh-CN'),
    )
    .slice(0, 4)
    .map((item) => ({
      name: item.name,
      username: item.username,
      avatarUrl: failedAvatarUrls.has(item.avatarUrl) ? '' : item.avatarUrl,
      creditScore: item.creditScore,
      deals: `${item.deals} 个资源`,
    }))
})

function handleDeveloperAvatarError(developer: DeveloperRank) {
  if (!developer.avatarUrl) return

  const next = new Set(failedDeveloperAvatarUrls.value)
  next.add(developer.avatarUrl)
  failedDeveloperAvatarUrls.value = next
}

const teamRanks = computed<TeamRank[]>(() => {
  const grouped = new Map<number, { teamName: string; resourceCount: number }>()

  for (const resource of publicResources.value) {
    if (!resource.team_id || !resource.team_name) continue
    const existing = grouped.get(resource.team_id)
    if (existing) {
      existing.resourceCount += 1
    } else {
      grouped.set(resource.team_id, {
        teamName: resource.team_name,
        resourceCount: 1,
      })
    }
  }

  if (grouped.size === 0) return []

  return [...grouped.entries()]
    .sort(([, a], [, b]) => b.resourceCount - a.resourceCount)
    .slice(0, 4)
    .map(([teamId, info]) => ({
      teamId,
      teamName: info.teamName,
      resourceCount: info.resourceCount,
    }))
})

function handleSpotlightCoverError(url: string | undefined) {
  if (!url) return
  const next = new Set(failedSpotlightCoverUrls.value)
  next.add(url)
  failedSpotlightCoverUrls.value = next
}

function spotlightCoverSrc(card: { coverUrl?: string }) {
  return card.coverUrl && !failedSpotlightCoverUrls.value.has(card.coverUrl) ? card.coverUrl : ''
}

function formatCreditScore(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return '暂无'
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

const spotlightCards = computed<SpotlightCard[]>(() => {
  const resourceCards = [...publicResources.value]
    .sort((left, right) => {
      const likeDelta = (right.like_count ?? 0) - (left.like_count ?? 0)
      if (likeDelta !== 0) {
        return likeDelta
      }

      const leftUpdatedAt = Date.parse(left.updated_at)
      const rightUpdatedAt = Date.parse(right.updated_at)
      const updatedDelta =
        (Number.isNaN(rightUpdatedAt) ? 0 : rightUpdatedAt) -
        (Number.isNaN(leftUpdatedAt) ? 0 : leftUpdatedAt)
      if (updatedDelta !== 0) {
        return updatedDelta
      }

      return right.id - left.id
    })
    .slice(0, TOP_LIKED_RESOURCE_LIMIT)
    .map((item, index) => ({
      kind: 'resource' as const,
      title: item.title,
      summary: buildResourceCardSummary(item),
      budget: summarizeResourceTags(item) || normalizeTagName(item.platform) || '公开资源',
      status: `${item.like_count ?? 0} 赞`,
      badge: normalizeTagName(item.platform) || '平台资源',
      metaSecondary: `${item.author || item.creator || '匿名作者'} · ${formatTimeLabel(item.updated_at)}`,
      accent: ['nebula', 'sunset', 'forest', 'frost'][index % 4] ?? 'nebula',
      coverUrl: item.cover_url ? apiUrl(item.cover_url) : '',
      coverAlt: buildResourceCoverAlt(item),
      resourceId: item.id,
    }))

  return resourceCards
})

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

onMounted(() => {
  setSeoMeta({
    title: '73Info 柒叁信息 - 资源与需求协作平台',
    description:
      '73Info 柒叁信息面向 Minecraft、网站开发和小工具场景提供免费资源浏览、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
    path: '/',
  })

  auth.hydrate()

  const oauthToken =
    typeof route.query.oauth_token === 'string' ? route.query.oauth_token.trim() : ''
  const oauthError =
    typeof route.query.oauth_error === 'string' ? route.query.oauth_error.trim() : ''

  if (oauthToken) {
    auth.setToken(oauthToken)
    showToast('GitHub 登录成功', 'success')
    void router.replace({ query: {} })
  } else if (oauthError) {
    showToast(`GitHub 登录失败: ${oauthError}`, 'error')
    const nextQuery = { ...route.query }
    delete nextQuery.oauth_token
    delete nextQuery.oauth_error
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
    if (homeRefreshLoading.value || publishLoading.value || depositLoading.value || auth.loading) {
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

function statusToLabel(status: RequirementStatus): string {
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

function formatMoney(budget?: number | null) {
  if (budget == null) {
    return '待议价'
  }

  return `¥${budget}`
}

function formatTimeLabel(iso: string): string {
  const date = new Date(iso)
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

function openDepositCard(item: PendingRequirementView) {
  if (item.status === 'rejected') {
    publishTitle.value = item.title || ''
    publishDescription.value = item.description || ''
    publishBudget.value = item.budget ?? ''
    publishAcceptance.value = item.acceptanceCriteria || ''
    publishPaymentMode.value = item.paymentMode
    activeResubmitRequirementId.value = item.id
    router.push({ name: 'home', query: { modal: 'publish' } })
    return
  }

  if (item.status !== 'pending_deposit' && item.status !== 'pending_final') {
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

function canOpenPayment(item: PendingRequirementView) {
  return (
    item.status === 'pending_deposit' ||
    item.status === 'pending_final' ||
    item.status === 'rejected'
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

function closeDealDetail() {
  dealDetailVisible.value = false
  selectedDeal.value = null
}

function depositAmount(item: PendingRequirementView) {
  if (typeof item.budget === 'number') {
    return item.budget
  }

  return 1
}

function finalDepositAmount(item: PendingRequirementView) {
  const base = Number(depositAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }

  const ratio = Number(depositRatioPercent.value)
  const scaled = Number.isFinite(ratio) && ratio > 0 ? (base * ratio) / 100 : base
  const raw = Math.max(0.01, scaled)

  return Number(raw.toFixed(2))
}

function finalPaymentAmount(item: PendingRequirementView) {
  const base = Number(depositAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }

  const tail = Math.max(0.01, base - finalDepositAmount(item))
  return Number(tail.toFixed(2))
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
      showToast(err instanceof Error ? err.message : '加载优惠券失败', 'error')
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
        statusLabel: statusToLabel(item.status),
        updatedAtLabel: formatTimeLabel(item.updated_at),
        description: item.description,
        acceptanceCriteria: item.acceptance_criteria,
        budget: item.budget,
        paymentMethod: item.payment_method,
        paymentMode: item.payment_mode,
      }))
  } catch (err) {
    if (isMounted && !silent) {
      showToast(err instanceof Error ? err.message : '加载需求失败', 'error')
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
      paymentId: item.payment_id,
      requirementId: item.requirement_id,
      title: item.title,
      amount: `¥${item.amount_cny.toFixed(2)}`,
      at: formatTimeLabel(item.paid_at),
      rating: item.comment_rating ?? null,
      comment: item.comment_text ?? null,
      commentedAt: item.commented_at ? formatTimeLabel(item.commented_at) : null,
    }))
  } catch {
    // Keep current values if overview API fails.
  }
}

function summarizeResourceTags(resource: PublicMcResourceItem): string {
  const tags = Array.from(
    new Set(
      resource.tag_selections.flatMap((item) =>
        item.tag_names.map((tag) => normalizeTagName(tag)).filter(Boolean),
      ),
    ),
  )
  return tags.slice(0, 2).join(' / ')
}

function normalizeInlineText(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function uniqueTextParts(parts: Array<string | null | undefined>): string[] {
  return Array.from(new Set(parts.map((part) => normalizeInlineText(part)).filter(Boolean)))
}

function buildResourceCardSummary(resource: PublicMcResourceItem): string {
  const description = normalizeInlineText(resource.description)
  const title = normalizeInlineText(resource.title) || '73Info 免费资源'
  const context = uniqueTextParts([
    normalizeTagName(resource.platform),
    summarizeResourceTags(resource),
  ])

  if (description.length >= 24 || context.length === 0) {
    return description || `${title}，可在 73Info 免费资源区查看详情与下载。`
  }

  const contextText = context.join('、')

  if (description) {
    return `${description}，面向 ${contextText} 场景。`
  }

  return `${title}，面向 ${contextText} 场景，可查看详情与下载。`
}

function buildResourceCoverAlt(resource: PublicMcResourceItem): string {
  const title = normalizeInlineText(resource.title) || '73Info 免费资源'
  const context = uniqueTextParts([
    normalizeTagName(resource.platform),
    summarizeResourceTags(resource),
  ])

  if (context.length === 0) {
    return `${title} 的资源封面图`
  }

  return `${title} 的资源封面图，分类为 ${context.join('、')}`
}

function resolveResourceRoute(
  resource: PublicMcResourceItem,
): { rootSlug: string; entrySlug: string } | null {
  for (const root of processedTagTree.value.roots) {
    const entry = root.entries.find((item) => item.platform === resource.platform)
    if (entry) {
      return {
        rootSlug: root.key,
        entrySlug: entry.key,
      }
    }
  }

  const fallbackRoot = processedTagTree.value.roots[0]
  const fallbackEntry = fallbackRoot?.entries[0]
  if (fallbackRoot && fallbackEntry) {
    return {
      rootSlug: fallbackRoot.key,
      entrySlug: fallbackEntry.key,
    }
  }

  return null
}

async function loadPublicPortalData(silent = false) {
  const [resourcesResult, requirementsResult] = await Promise.allSettled([
    listAllPublicMcResources(),
    listPublicRequirementSpotlights(),
  ])
  void tagTreeStore.ensure()

  if (!isMounted) {
    return
  }

  if (resourcesResult.status === 'fulfilled') {
    publicResources.value = resourcesResult.value
      .filter(
        (resource, index, array) => array.findIndex((item) => item.id === resource.id) === index,
      )
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
  } else {
    publicResources.value = []
  }

  if (requirementsResult.status === 'fulfilled') {
    publicRequirementSpotlights.value = requirementsResult.value
  } else {
    publicRequirementSpotlights.value = []
  }

  const failedResults = [resourcesResult, requirementsResult].filter(
    (result) => result.status === 'rejected',
  )
  if (failedResults.length > 0 && failedResults.length < 2 && !silent) {
    showToast('部分首页公开数据加载失败，已显示可用数据', 'warning')
  } else if (failedResults.length === 2 && !silent) {
    showToast('加载首页公开数据失败', 'warning')
  }

  void loadDeveloperBadges()
}

async function loadDeveloperBadges() {
  const usernames = [
    ...new Set(
      developerRanks.value.map((dev) => dev.username).filter((username) => username.length > 0),
    ),
  ]
  if (usernames.length === 0) {
    developerBadges.value = {}
    return
  }

  const entries = await Promise.all(
    usernames.map(async (username): Promise<[string, UserBadge[]]> => {
      try {
        const response = await getUserBadges(username)
        return [username, response.badges.filter((badge) => badge.equipped)]
      } catch {
        return [username, []]
      }
    }),
  )
  developerBadges.value = Object.fromEntries(entries)
}

function devBadges(username: string): UserBadge[] {
  return developerBadges.value[username] ?? []
}

async function submitDepositPayment() {
  if (!depositRequirement.value) {
    return
  }

  if (depositRequirement.value.status === 'pending_deposit' && !depositPolicyAccepted.value) {
    showToast('请先确认“定金服务费与退款规则”后再支付定金', 'warning')
    return
  }

  const currentStage = depositRequirement.value.status === 'pending_final' ? '尾款' : '定金'
  const channel = depositChannel.value

  depositLoading.value = true
  try {
    if (!depositPayment.value) {
      let createPayload:
        | AlipayCreatePaymentResp
        | WechatCreatePaymentResp
        | AlipayPageCreatePaymentResp

      if (channel === 'alipay') {
        createPayload = await createAlipayPagePayment(auth.token, {
          requirement_id: depositRequirement.value.id,
          amount_cny: couponBaseAmount.value,
          coupon_code: activeCouponCode.value || undefined,
          description: `需求 ${depositRequirement.value.id} ${currentStage}`,
        })

        depositPayment.value = {
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
          requirement_id: depositRequirement.value.id,
          amount_cny: couponBaseAmount.value,
          coupon_code: activeCouponCode.value || undefined,
          description: `需求 ${depositRequirement.value.id} ${currentStage}`,
        })

        const wechatPayload = createPayload as WechatCreatePaymentResp
        depositPayment.value = {
          payment_id: wechatPayload.payment_id,
          requirement_id: wechatPayload.requirement_id,
          channel: wechatPayload.channel,
          amount_cny: wechatPayload.amount_cny,
          status: wechatPayload.status,
          alipay_order_string: wechatPayload.code_url,
          expires_at: wechatPayload.expires_at,
        }
      }

      showToast(`${currentStage}支付订单已生成，正在跳转支付页`, 'success')
      router.push({
        name: 'payment',
        query: {
          payment_id: depositPayment.value.payment_id,
          requirement_id: depositRequirement.value.id,
          channel,
          amount_cny: depositPayment.value.amount_cny.toString(),
          expires_at: depositPayment.value.expires_at,
          coupon_code: activeCouponCode.value || undefined,
          ...(channel === 'alipay'
            ? { page: '1' }
            : { qr_content: depositPayment.value.alipay_order_string }),
        },
      })
      return
    }

    const confirmResult = await confirmPayment(auth.token, channel, depositPayment.value.payment_id)

    if (!confirmResult.ok) {
      throw new Error(confirmResult.message || `确认${currentStage}支付失败`)
    }

    showToast(`${currentStage}支付确认成功`, 'success')
    void router.replace({ name: 'home' })
    await loadPendingRequirements()
  } catch (err) {
    const message = err instanceof Error ? err.message : '支付失败'
    if (
      message.includes(
        'developer must sign first and user must sign after that before paying deposit',
      ) ||
      message.includes('requirement contract must be signed by developer before paying deposit') ||
      message.includes('contract must be created before paying deposit')
    ) {
      showToast(
        '当前需求需先由开发者（乙方）签署，再由您（甲方）签署协议后，才能支付定金',
        'warning',
      )
    } else {
      showToast(message, 'error')
    }
  } finally {
    depositLoading.value = false
  }
}

function openAuth(mode: AuthMode) {
  const inviteCodeToKeep = authInviteCode.value.trim() || routeInviteCode.value
  const shareTypeToKeep = authShareType.value.trim() || routeShareType.value
  const shareTargetIdToKeep = authShareTargetId.value.trim() || routeShareTargetId.value
  resetAuthForm()
  const nextQuery: Record<string, string> = { modal: 'auth', mode }
  if (authRedirectTarget.value) {
    nextQuery.redirect_to = authRedirectTarget.value
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
  auth.hydrate()
  if (!auth.isAuthed) {
    showToast('发布需求前请先登录', 'info')
    openAuth('login')
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
    void router.push({ name: 'workbench-realname', query: { redirect_to: route.fullPath || '/' } })
    return false
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      showToast('发布需求前请先完成实名认证', 'warning')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: route.fullPath || '/' },
      })
      return false
    }

    showToast(err instanceof Error ? err.message : '实名认证状态校验失败', 'error')
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
  await router.push({ name: 'home', query: { modal: 'publish' } })
}

async function refreshHomeData() {
  if (homeRefreshLoading.value) {
    return
  }

  homeRefreshLoading.value = true
  try {
    if (auth.isAuthed) {
      await Promise.all([
        loadDepositRatio(),
        loadPendingRequirements(),
        loadRequirementOverview(),
        loadPublicPortalData(),
      ])
    } else {
      await Promise.all([
        loadPendingRequirements(),
        loadRequirementOverview(),
        loadPublicPortalData(),
      ])
    }

    if (isMounted) {
      showToast('已刷新最新数据', 'success')
    }
  } finally {
    if (isMounted) {
      homeRefreshLoading.value = false
    }
  }
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
    const payload = {
      title: normalizedTitle,
      description: descriptionValidation.value,
      budget,
      acceptance_criteria: acceptanceValidation.value,
      payment_mode: 'self_managed' as RequirementPaymentMode,
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
    if (resubmitId) {
      publishModalRef.value?.clearDraft(`edit-${resubmitId}`)
    } else {
      publishModalRef.value?.clearDraft()
    }
    showToast(wasResubmit ? '需求已重新提交，等待审核' : '需求已发布', 'success')
    void router.replace({ name: 'home' })
    await loadPendingRequirements()
  } catch (err) {
    if (isMounted) {
      showToast(err instanceof Error ? err.message : '发布失败', 'error')
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
                <p class="portal-hero__lead">你要的资源免费拿，你想做的事找人做</p>

                <div v-if="heroSignals.length" class="portal-signal-list">
                  <span
                    v-for="signal in heroSignals"
                    :key="signal"
                    class="portal-signal"
                    >{{ signal }}</span
                  >
                </div>

                <div class="portal-hero__actions">
                  <button
                    class="portal-primary-action"
                    type="button"
                    @click="openPublishModal"
                  >
                    发布需求
                  </button>
                  <button
                    class="portal-secondary-action"
                    type="button"
                    @click="openDevWorkbench"
                  >
                    {{ devActionLabel }}
                  </button>
                </div>
              </div>
            </div>
          </section>

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
                    <filter
                      id="quickIconShadow"
                      x="-30%"
                      y="-20%"
                      width="160%"
                      height="160%"
                    >
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
                    <path
                      fill="url(#quickGiftYellow)"
                      d="M43 38h10v46H43zM12 28h72v16H12z"
                    />
                    <path
                      fill="url(#quickGiftRed)"
                      d="M24 14c10-5 20 8 24 17-12 2-27 1-30-6-2-4 1-8 6-11Zm48 0c-10-5-20 8-24 17 12 2 27 1 30-6 2-4-1-8-6-11Z"
                    />
                    <path fill="url(#quickGiftYellow)" d="M42 20h12l-6 18-6-18Z" />
                  </g>
                </svg>
                <svg
                  v-else
                  class="portal-quick-card__svg"
                  viewBox="0 0 96 96"
                  focusable="false"
                >
                  <defs>
                    <linearGradient id="quickCaseOrange" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stop-color="#ffb15c" />
                      <stop offset="100%" stop-color="#f97316" />
                    </linearGradient>
                    <filter
                      id="quickCaseShadow"
                      x="-30%"
                      y="-20%"
                      width="160%"
                      height="160%"
                    >
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
                  <el-icon>
                    <ArrowRight />
                  </el-icon>
                </span>
              </div>
            </article>
          </section>

          <section class="portal-section portal-section--workflow">
            <div class="portal-section__header">
              <div class="portal-section-title portal-section-title--plain">
                <h2>需求流程</h2>
              </div>
            </div>
            <div class="portal-workflow-grid" aria-label="需求流程">
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
                  <span class="portal-step-card__icon" aria-hidden="true">{{
                    step.icon
                  }}</span>
                  <span class="portal-step-card__body">
                    <strong>{{ step.step }}. {{ step.title }}</strong>
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

          <section class="portal-section">
            <div class="portal-section__header">
              <div class="portal-section-title">
                <span class="portal-section-title__icon" aria-hidden="true">★</span>
                <h2>免费资源</h2>
              </div>
              <button
                class="portal-link-btn"
                type="button"
                @click="router.push({ name: 'free-resources' })"
              >
                更多免费资源
              </button>
            </div>
            <div v-if="spotlightCards.length > 0" class="portal-spotlight-grid">
              <article
                v-for="card in spotlightCards"
                :key="card.resourceId ?? card.title"
                class="portal-spotlight-card"
                :class="`portal-spotlight-card--${card.accent}`"
                role="button"
                tabindex="0"
                @click="openSpotlight(card)"
                @keydown.enter="openSpotlight(card)"
                @keydown.space.prevent="openSpotlight(card)"
              >
                <div class="portal-spotlight-card__cover">
                  <img
                    v-if="spotlightCoverSrc(card)"
                    class="portal-spotlight-card__cover-img"
                    :src="card.coverUrl"
                    :alt="card.coverAlt || `${card.title} 的资源封面图`"
                    @error="handleSpotlightCoverError(card.coverUrl)"
                  />
                  <span v-else class="portal-spotlight-card__cover-text">{{
                    card.title.slice(0, 1).toUpperCase()
                  }}</span>
                  <span class="portal-spotlight-card__badge">{{ card.badge }}</span>
                  <div
                    class="portal-spotlight-card__screen portal-spotlight-card__screen--primary"
                  ></div>
                  <div
                    class="portal-spotlight-card__screen portal-spotlight-card__screen--secondary"
                  ></div>
                  <div
                    class="portal-spotlight-card__screen portal-spotlight-card__screen--tertiary"
                  ></div>
                </div>
                <div class="portal-spotlight-card__body">
                  <h3>{{ card.title }}</h3>
                  <p v-if="card.summary">{{ card.summary }}</p>
                  <div class="portal-spotlight-card__meta-row">
                    <strong>{{ card.budget }}</strong>
                    <span class="portal-spotlight-card__status">{{ card.status }}</span>
                  </div>
                  <div class="portal-spotlight-card__footer">
                    <span>{{ card.metaSecondary }}</span>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="portal-empty-state">
              <strong>暂无免费资源</strong>
            </div>
          </section>
        </div>

        <aside class="portal-sidebar">
          <section class="portal-card portal-section--beta">
            <div class="portal-beta-notice">
              <span class="portal-beta-notice__badge">内测中</span>

              <div v-if="auth.isAuthed" class="portal-beta-invite">
                <span class="portal-beta-invite__title">🎁 邀请有礼</span>
                <p class="portal-beta-invite__text">
                  每邀请一位好友注册，即可解锁专属徽章和排行榜荣誉
                </p>
                <RouterLink
                  class="portal-beta-invite__cta"
                  :to="{ name: 'workbench-invite' }"
                >
                  立即邀请
                </RouterLink>
              </div>

              <button
                class="portal-beta-notice__btn"
                type="button"
                @click="openBetaGroup"
              >
                加入QQ群
              </button>
            </div>
          </section>

          <section class="portal-card portal-card--notice">
            <div class="portal-card__header portal-card__header--notice">
              <div class="portal-card__title portal-card__title--notice">
                <span class="portal-notice-head__icon" aria-hidden="true">◔</span>
                <h2>平台公告</h2>
              </div>
              <button
                class="portal-link-btn portal-link-btn--notice"
                type="button"
                @click="router.push({ name: 'community' })"
              >
                更多
                <span aria-hidden="true">›</span>
              </button>
            </div>
            <ul class="portal-notice-list">
              <li
                v-for="(notice, index) in portalNotices"
                :key="`${notice.title}-${notice.date}`"
                class="portal-notice-item"
                :class="{ 'portal-notice-item--clickable': notice.to }"
                :role="notice.to ? 'button' : undefined"
                :tabindex="notice.to ? 0 : undefined"
                :style="{ '--notice-index': String(index) }"
                @click="openPortalNotice(notice)"
                @keydown.enter="openPortalNotice(notice)"
                @keydown.space.prevent="openPortalNotice(notice)"
              >
                <div class="portal-notice-item__main">
                  <strong>{{ notice.title }}</strong>
                  <span v-if="notice.tag" class="portal-tag">{{ notice.tag }}</span>
                </div>
                <time>{{ notice.date }}</time>
              </li>
            </ul>
          </section>

          <section
            id="portal-developers"
            class="portal-card portal-card--stats"
            :class="{ 'is-refreshing': homeRefreshLoading }"
          >
            <div class="portal-card__header portal-card__header--stats">
              <div class="portal-card__title portal-card__title--stats">
                <span class="portal-stats-head__icon" aria-hidden="true">◉</span>
                <h2>公开数据</h2>
              </div>
            </div>
            <div class="portal-stats-grid">
              <article
                v-for="(stat, index) in platformStats"
                :key="stat.label"
                class="portal-stat-item"
                :class="[
                  `portal-stat-item--tone-${index % 4}`,
                  { 'is-disabled': stat.disabledReason },
                ]"
                :style="{ '--stat-index': String(index) }"
                :aria-disabled="stat.disabledReason ? 'true' : undefined"
              >
                <span class="portal-stat-item__icon" aria-hidden="true">
                  <component :is="stat.icon" />
                </span>
                <div class="portal-stat-item__copy">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </div>
                <div
                  v-if="stat.disabledReason"
                  class="portal-stat-item__disabled"
                  aria-live="polite"
                >
                  <strong>暂未开放</strong>
                  <span>{{ stat.disabledReason }}</span>
                </div>
              </article>
            </div>
          </section>

          <section class="portal-card portal-card--rank">
            <div class="portal-card__header">
              <div class="portal-card__title portal-card__title--rank">
                <span class="portal-card-title-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="m8 9-4 3 4 3" />
                    <path d="m16 9 4 3-4 3" />
                    <path d="m14 5-4 14" />
                  </svg>
                </span>
                <h2>活跃开发者</h2>
              </div>
            </div>
            <ul v-if="developerRanks.length > 0" class="portal-rank-list">
              <li
                v-for="(developer, index) in developerRanks"
                :key="developer.username"
                class="portal-rank-item"
                :style="{ '--rank-index': String(index) }"
                @click="
                  router.push({
                    name: 'dev-profile',
                    params: { username: developer.username },
                  })
                "
              >
                <div class="portal-rank-item__avatar">
                  <img
                    v-if="developer.avatarUrl"
                    :src="developer.avatarUrl"
                    :alt="`${developer.name} 的头像`"
                    @error="handleDeveloperAvatarError(developer)"
                  />
                  <span v-else>{{ developer.name.slice(0, 1) }}</span>
                </div>
                <div class="portal-rank-item__meta">
                  <strong>{{ developer.name }}</strong>
                  <div class="portal-rank-item__badges" v-if="devBadges(developer.username).length > 0">
                    <span
                      v-for="badge in devBadges(developer.username).slice(0, 3)"
                      :key="badge.code"
                      class="portal-rank-item__badge"
                      :title="`${badge.name}：${badge.description}`"
                    >
                      <img
                        v-if="badge.icon.startsWith('badges/')"
                        :src="`/uploads/${badge.icon}`"
                        class="portal-rank-item__badge-img"
                        alt=""
                      />
                      <template v-else>{{ badge.icon }}</template>
                    </span>
                    <span v-if="devBadges(developer.username).length > 3" class="portal-rank-item__badge-more">
                      +{{ devBadges(developer.username).length - 3 }}
                    </span>
                  </div>
                </div>
                <div class="portal-rank-item__score">
                  <strong>{{ developer.deals }}</strong>
                  <span>信用 {{ formatCreditScore(developer.creditScore) }}</span>
                </div>
              </li>
            </ul>
            <div v-else class="portal-empty-state portal-empty-state--compact">
              <strong>暂无公开开发者</strong>
            </div>
          </section>
          <section v-if="teamRanks.length > 0" class="portal-card portal-card--team">
            <div class="portal-card__header">
              <div class="portal-card__title portal-card__title--team">
                <span class="portal-card-title-icon portal-card-title-icon--team" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <h2>活跃团队</h2>
              </div>
            </div>
            <ul class="portal-rank-list">
              <li
                v-for="(team, index) in teamRanks"
                :key="team.teamId"
                class="portal-rank-item"
                :style="{ '--rank-index': String(index) }"
                @click="
                  router.push({ name: 'team-profile', params: { teamId: team.teamId } })
                "
              >
                <div class="portal-rank-item__avatar">
                  <span>{{ team.teamName.slice(0, 1) }}</span>
                </div>
                <div class="portal-rank-item__meta">
                  <strong>{{ team.teamName }}</strong>
                </div>
                <div class="portal-rank-item__score">
                  <strong>{{ team.resourceCount }} 个资源</strong>
                </div>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>

    <div
      v-if="dealDetailVisible && selectedDeal"
      class="auth-modal-wrap"
      @click.self="closeDealDetail"
    >
      <section class="auth-modal" aria-label="最近成交详情">
        <h3>{{ selectedDeal.title }}</h3>
        <p class="auth-switch">需求号：{{ selectedDeal.requirementId }}</p>
        <p class="auth-switch">成交金额：{{ selectedDeal.amount }}</p>
        <p class="auth-switch">成交时间：{{ selectedDeal.at }}</p>
        <p class="auth-switch">
          评分：{{
            selectedDeal.rating != null
              ? `${selectedDeal.rating.toFixed(1)} / 5`
              : "暂无评分"
          }}
        </p>
        <p class="auth-switch">
          评论时间：{{ selectedDeal.commentedAt || "暂无评论时间" }}
        </p>
        <label class="auth-label">
          <span>评论内容</span>
          <textarea :value="selectedDeal.comment || '暂无评论内容'" rows="4" readonly />
        </label>
        <div class="auth-modal-actions">
          <button class="auth-btn solid" type="button" @click="closeDealDetail">
            关闭
          </button>
        </div>
      </section>
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
      v-model:acceptTerms="acceptTerms"
      :authLoading="auth.loading"
      :loginRequiresTwoFactor="loginRequiresTwoFactor"
      :githubLoginLoading="githubLoading"
      :sendCodeLoading="sendCodeLoading"
      :sendCodeCountdown="sendCodeCountdown"
      @close="closeAuth"
      @submit="submitAuth"
      @loginWithGithub="loginWithGithub"
      @sendAuthCode="sendAuthCode"
      @change-mode="openAuth"
    />

    <PublishModal
      ref="publishModalRef"
      :visible="publishVisible"
      v-model:publishTitle="publishTitle"
      v-model:publishDescription="publishDescription"
      v-model:publishBudget="publishBudget"
      v-model:publishAcceptance="publishAcceptance"
      v-model:publishPaymentMode="publishPaymentMode"
      :modalTitle="publishModalTitle"
      :submitText="publishModalSubmitText"
      :loadingText="publishModalLoadingText"
      :allowPlatformGuarantee="false"
      :publishLoading="publishLoading"
      :draft-scope="activeResubmitRequirementId ? `edit-${activeResubmitRequirementId}` : (auth.isAuthed ? auth.username : 'default')"
      @close="closePublishModal"
      @notify="showToast"
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
      :depositPolicyAccepted="depositPolicyAccepted"
      :contractSigningStatus="contractSigningStatus"
      @close="closeDepositCard"
      @submit="submitDepositPayment"
      @update:depositPolicyAccepted="depositPolicyAccepted = $event"
      @update:depositChannel="depositChannel = $event"
      @selectCoupon="selectCoupon"
      @loadAvailableCoupons="loadAvailableCoupons"
    />
  </main>
</template>
