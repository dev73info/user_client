<script setup lang="ts">
import '@/styles/home.css'

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TIcon, ArrowRight, Files, Finished, Money, TMessage, User } from 'ui_73info'

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
import { buildDevPortalUrl } from '@/config/runtime'
import { useAuthForm } from '@/composables/useAuthForm'
import {
  buildResourceCardSummary,
  buildResourceCoverAlt,
  compareSpotlightResources,
  resolveSpotlightCover,
  spotlightAuthorLabel,
  spotlightCategoryBadge,
  spotlightMarkFor,
  spotlightTagChips,
} from '@/shared/home/resourceCardDisplay'
import {
  buildPortalNotices,
  formatMoney,
  formatTimeLabel,
  progressPercent,
  statusToLabel,
  type PortalNotice,
} from '@/shared/home/portalDisplay'
import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
} from '@/shared/requirementPayment'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import { validateRequirementRichText } from '@/utils/requirementRichText'
import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { HttpError, apiUrl } from '@/api/http'
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
import { useTagTreeStore } from '@/stores/tagTree'
import {
  invalidateResourceListCache,
  likePublicMcResource,
  listAllPublicMcResources,
  unlikePublicMcResource,
  type PublicMcResourceItem,
} from '@/api/resources'
import { doCheckin, getCheckinStatus, getResourcePromoMeta, type CheckinStatus } from '@/api/points'
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
  /** 冷启动里程碑进度：当前值 / 目标值 */
  progress?: { current: number; target: number }
  /** 附加说明文字 */
  note?: string
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

type SpotlightCard = {
  kind: 'requirement' | 'resource'
  title: string
  summary: string
  /** 卡片标签：与资源详情页同款胶囊，最多 3 个 */
  tags: string[]
  /** 封面左上：平台 / 品类 */
  badge: string
  /** 封面右上：仅精选；空字符串表示不展示 */
  mark: string
  authorLabel?: string
  metaTime?: string
  viewCount: number
  downloadCount: number
  likeCount: number
  likedByMe: boolean
  gradient?: boolean
  userColor?: string
  accent: string
  coverUrl?: string
  coverAlt?: string
  requirementId?: string
  resourceId?: number
  originLabel?: string
  originRepost?: boolean
}

/** 首页高赞阈值：由管理端积分规则 `resource_high_like_threshold` 配置，缺省 5。 */
const highLikeThreshold = ref(5)

type DeveloperRank = {
  name: string
  username: string
  avatarUrl: string
  creditScore: number | null
  deals: string
  gradient?: boolean
  userColor?: string
}

type TeamRank = {
  teamId: number
  teamName: string
  avatarUrl: string
  resourceCount: number
}

/** 冷启动里程碑目标（当前为内测期写死，后续可改为配置） */
const MILESTONE_TARGETS = {
  developers: 1000,
  resources: 50,
} as const

const failedDeveloperAvatarUrls = ref<Set<string>>(new Set())
const failedTeamAvatarUrls = ref<Set<string>>(new Set())
const failedSpotlightCoverUrls = ref<Set<string>>(new Set())

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
const tagTreeStore = useTagTreeStore()
const processedTagTree = computed(() => tagTreeStore.tree ?? ({ roots: [] } as { roots: never[] }))
const publicResources = ref<PublicMcResourceItem[]>([])
const developerBadges = ref<Record<string, UserBadge[]>>({})
const auth = useAuthStore()
const announcementPosts = ref<CommunityPost[]>([])
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

// 首页侧栏：签到卡片（未签到显示签到，已签到显示邀请有礼）
const homeCheckinStatus = ref<CheckinStatus | null>(null)
const checkinHomeSaving = ref(false)

async function loadHomeCheckin() {
  if (!auth.isAuthed || !auth.token) {
    homeCheckinStatus.value = null
    return
  }
  try {
    homeCheckinStatus.value = await getCheckinStatus(auth.token)
  } catch {
    // 静默失败，签到卡不展示
    homeCheckinStatus.value = null
  }
}

async function handleHomeCheckin() {
  if (!auth.token || checkinHomeSaving.value) {
    return
  }
  checkinHomeSaving.value = true
  try {
    const res = await doCheckin(auth.token)
    homeCheckinStatus.value = {
      username: res.username,
      today_checked_in: true,
      streak_count: res.streak_count,
      today_potential: res.total_awarded,
    }
    TMessage.success(`签到成功，获得 ${res.total_awarded} 积分`)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '签到失败')
  } finally {
    checkinHomeSaving.value = false
  }
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

const platformStats = computed<PlatformStat[]>(() => {
  const [completed] = metrics.value
  const resourceCount = publicResources.value.length
  const developerCount = publicDeveloperCount.value

  return [
    {
      label: '内测开发者',
      value: `${developerCount}/${MILESTONE_TARGETS.developers} 位`,
      icon: User,
      progress: { current: developerCount, target: MILESTONE_TARGETS.developers },
    },
    {
      label: '公开资源',
      value: `${resourceCount}/${MILESTONE_TARGETS.resources} 条`,
      icon: Files,
      progress: { current: resourceCount, target: MILESTONE_TARGETS.resources },
    },
    {
      label: '完成记录',
      value: completed?.value ?? '0 单',
      icon: Finished,
      note: completed?.value === '0 单' ? '首单在路上' : undefined,
    },
    {
      label: '担保交易',
      value: '开发中',
      icon: Money,
      note: '正在开发测试中',
    },
  ]
})

const developerRanks = computed<DeveloperRank[]>(() => {
  const failedAvatarUrls = failedDeveloperAvatarUrls.value
  const groupedResources = new Map<
    string,
    {
      name: string
      username: string
      avatarUrl: string
      creditScore: number | null
      deals: number
      latestAt: number
      gradient: boolean
      userColor?: string
    }
  >()

  for (const resource of publicResources.value) {
    const name = resource.creator.trim() || resource.author.trim() || '匿名开发者'
    const username = resource.creator.trim() || ''
    const current = groupedResources.get(username)
    const latestAt = Date.parse(resource.updated_at)
    const avatarUrl = resource.creator_avatar_url ? apiUrl(resource.creator_avatar_url) : ''
    const creditScore =
      typeof resource.creator_credit_score === 'number' ? resource.creator_credit_score : null
    const gradient = !!resource.creator_username_gradient
    const userColor = resource.creator_username_color || ''

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
      if (!current.gradient) {
        current.gradient = gradient
      }
      if (!current.userColor) {
        current.userColor = userColor
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
      gradient,
      userColor,
    })
  }

  if (groupedResources.size === 0) return []

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
      gradient: item.gradient,
      userColor: item.userColor,
    }))
})

const totalContribResources = computed<number>(() =>
  developerRanks.value.reduce((sum, developer) => {
    const match = developer.deals.match(/\d+/)
    return sum + (match ? Number(match[0]) : 0)
  }, 0),
)

function handleDeveloperAvatarError(developer: DeveloperRank) {
  if (!developer.avatarUrl) return

  const next = new Set(failedDeveloperAvatarUrls.value)
  next.add(developer.avatarUrl)
  failedDeveloperAvatarUrls.value = next
}

function handleTeamAvatarError(team: TeamRank) {
  if (!team.avatarUrl) return

  const next = new Set(failedTeamAvatarUrls.value)
  next.add(team.avatarUrl)
  failedTeamAvatarUrls.value = next
}

const teamRanks = computed<TeamRank[]>(() => {
  const failedAvatarUrls = failedTeamAvatarUrls.value
  const grouped = new Map<number, { teamName: string; avatarUrl: string; resourceCount: number }>()

  for (const resource of publicResources.value) {
    if (!resource.team_id || !resource.team_name) continue
    const avatarUrl = resource.team_avatar_url ? apiUrl(resource.team_avatar_url) : ''
    const existing = grouped.get(resource.team_id)
    if (existing) {
      existing.resourceCount += 1
      if (!existing.avatarUrl && avatarUrl) {
        existing.avatarUrl = avatarUrl
      }
    } else {
      grouped.set(resource.team_id, {
        teamName: resource.team_name,
        avatarUrl,
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
      avatarUrl: failedAvatarUrls.has(info.avatarUrl) ? '' : info.avatarUrl,
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
  return resolveSpotlightCover(card.coverUrl, failedSpotlightCoverUrls.value)
}

const spotlightCards = computed<SpotlightCard[]>(() => {
  const published = [...publicResources.value]
  const threshold = highLikeThreshold.value
  const hybrid = published.filter(
    (item) => item.is_featured || item.is_pinned || (item.like_count ?? 0) >= threshold,
  )
  // 候选为空时回退到全部已发布，按同一套排序，避免首页区块空白。
  const candidates = (hybrid.length > 0 ? hybrid : published).sort(compareSpotlightResources)

  return candidates.map((item, index) => {
    return {
      kind: 'resource' as const,
      title: item.title,
      summary: buildResourceCardSummary(item),
      tags: spotlightTagChips(item),
      badge: spotlightCategoryBadge(item),
      mark: spotlightMarkFor(item),
      authorLabel: spotlightAuthorLabel(item),
      metaTime: formatTimeLabel(item.updated_at),
      viewCount: item.view_count ?? 0,
      downloadCount: item.download_count ?? 0,
      likeCount: item.like_count ?? 0,
      likedByMe: !!item.liked_by_me,
      gradient: !!item.author_username_gradient,
      userColor: item.author_username_color || '',
      accent: ['nebula', 'sunset', 'forest', 'frost'][index % 4] ?? 'nebula',
      coverUrl: item.cover_url ? apiUrl(item.cover_url) : '',
      coverAlt: buildResourceCoverAlt(item),
      resourceId: item.id,
      originLabel: item.origin_type === 'repost' ? '转载' : '原创',
      originRepost: item.origin_type === 'repost',
    }
  })
})

const SPOTLIGHT_PAGE_SIZE = 8
const spotlightPage = ref(1)

/** 作者名溢出时启用横向滚动的资源 id 集合 */
const spotlightAuthorMarqueeIds = ref<Set<number>>(new Set())
const spotlightAuthorObservers = new Map<number, ResizeObserver>()

function isSpotlightAuthorMarquee(resourceId?: number): boolean {
  return resourceId != null && spotlightAuthorMarqueeIds.value.has(resourceId)
}

function updateSpotlightAuthorMarquee(resourceId: number, el: HTMLElement) {
  const track = el.querySelector('.portal-spotlight-card__author-text') as HTMLElement | null
  if (!track) {
    return
  }
  const overflowPx = track.scrollWidth - el.clientWidth
  const overflow = overflowPx > 1
  el.style.setProperty('--author-marquee-shift', overflow ? `${-overflowPx}px` : '0px')
  const next = new Set(spotlightAuthorMarqueeIds.value)
  if (overflow) {
    next.add(resourceId)
  } else {
    next.delete(resourceId)
  }
  if (next.size !== spotlightAuthorMarqueeIds.value.size) {
    spotlightAuthorMarqueeIds.value = next
    return
  }
  for (const id of next) {
    if (!spotlightAuthorMarqueeIds.value.has(id)) {
      spotlightAuthorMarqueeIds.value = next
      return
    }
  }
}

function bindSpotlightAuthorMarquee(el: unknown, resourceId?: number) {
  if (resourceId == null) {
    return
  }
  const prev = spotlightAuthorObservers.get(resourceId)
  if (prev) {
    prev.disconnect()
    spotlightAuthorObservers.delete(resourceId)
  }
  if (!(el instanceof HTMLElement)) {
    const next = new Set(spotlightAuthorMarqueeIds.value)
    next.delete(resourceId)
    spotlightAuthorMarqueeIds.value = next
    return
  }
  const measure = () => updateSpotlightAuthorMarquee(resourceId, el)
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(el)
  spotlightAuthorObservers.set(resourceId, observer)
}

onBeforeUnmount(() => {
  for (const observer of spotlightAuthorObservers.values()) {
    observer.disconnect()
  }
  spotlightAuthorObservers.clear()
})
const spotlightPageCount = computed(() =>
  Math.max(1, Math.ceil(spotlightCards.value.length / SPOTLIGHT_PAGE_SIZE)),
)
const pagedSpotlightCards = computed(() => {
  const start = (spotlightPage.value - 1) * SPOTLIGHT_PAGE_SIZE
  return spotlightCards.value.slice(start, start + SPOTLIGHT_PAGE_SIZE)
})

function goSpotlightPage(target: number) {
  if (target < 1 || target > spotlightPageCount.value || target === spotlightPage.value) {
    return
  }
  const gridElement = document.querySelector<HTMLElement>('.portal-spotlight-grid')
  // 移动端是紧凑列表，不必锁 min-height；桌面端仍撑住高度避免翻页跳动。
  const lockMinHeight =
    typeof window === 'undefined' || window.matchMedia('(min-width: 901px)').matches
  const previousHeight = gridElement?.offsetHeight ?? 0
  if (lockMinHeight && gridElement && previousHeight > 0) {
    gridElement.style.minHeight = `${previousHeight}px`
  }
  spotlightPage.value = target
  void nextTick(() => {
    if (!gridElement) {
      return
    }
    if (!lockMinHeight) {
      gridElement.style.minHeight = ''
      return
    }
    const nextHeight = gridElement.offsetHeight
    gridElement.style.minHeight = `${Math.max(previousHeight, nextHeight)}px`
  })
}

watch(spotlightPageCount, (next) => {
  if (spotlightPage.value > next) {
    spotlightPage.value = next
  }
})

type SpotlightPaginationItem = { key: string; label: string; page: number | null }

const SPOTLIGHT_PAGE_WINDOW = 1

const spotlightPaginationItems = computed<SpotlightPaginationItem[]>(() => {
  const total = spotlightPageCount.value
  const current = spotlightPage.value
  const items: SpotlightPaginationItem[] = []
  if (total <= 9) {
    for (let page = 1; page <= total; page += 1) {
      items.push({ key: `page-${page}`, label: String(page), page })
    }
    return items
  }
  items.push({ key: 'page-1', label: '1', page: 1 })
  const start = Math.max(2, current - SPOTLIGHT_PAGE_WINDOW)
  const end = Math.min(total - 1, current + SPOTLIGHT_PAGE_WINDOW)
  if (start > 2) {
    items.push({ key: 'ellipsis-left', label: '…', page: null })
  }
  for (let page = start; page <= end; page += 1) {
    items.push({ key: `page-${page}`, label: String(page), page })
  }
  if (end < total - 1) {
    items.push({ key: 'ellipsis-right', label: '…', page: null })
  }
  items.push({ key: `page-${total}`, label: String(total), page: total })
  return items
})

const spotlightJumpOpen = ref(false)
const spotlightJumpAnchor = ref<string | null>(null)
const spotlightJumpValue = ref('')

function toggleSpotlightJump(anchorKey: string) {
  if (spotlightJumpOpen.value && spotlightJumpAnchor.value === anchorKey) {
    spotlightJumpOpen.value = false
    return
  }
  spotlightJumpAnchor.value = anchorKey
  spotlightJumpValue.value = String(spotlightPage.value)
  spotlightJumpOpen.value = true
}

function submitSpotlightJump() {
  const parsed = Number.parseInt(spotlightJumpValue.value, 10)
  if (Number.isFinite(parsed)) {
    goSpotlightPage(Math.min(Math.max(parsed, 1), spotlightPageCount.value))
  }
  spotlightJumpOpen.value = false
}

function handleSpotlightJumpOutsideClick() {
  if (spotlightJumpOpen.value) {
    spotlightJumpOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleSpotlightJumpOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleSpotlightJumpOutsideClick)
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

watch(
  () => auth.isAuthed,
  () => {
    void loadHomeCheckin()
    // 登录态变化后重拉公开资源，补齐 / 清空 liked_by_me。
    void loadPublicPortalData(true)
  },
)

const spotlightLikeSubmittingIds = ref<Set<number>>(new Set())

function openSpotlightLikeLogin() {
  TMessage.info('请先登录后再点赞')
  openAuth('login')
}

async function toggleSpotlightLike(card: SpotlightCard, event: Event) {
  event.stopPropagation()
  event.preventDefault()

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
    publicResources.value = publicResources.value.map((item) =>
      item.id === resourceId
        ? { ...item, liked_by_me: state.liked_by_me, like_count: state.like_count }
        : item,
    )
    invalidateResourceListCache()
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
  const resourceToken = auth.isAuthed && auth.token.trim() ? auth.token : null
  const [resourcesResult, requirementsResult, announcementsResult, promoMetaResult] =
    await Promise.allSettled([
      listAllPublicMcResources(resourceToken),
      // 首页只用最新一条需求做公告，取 1 条即可。
      listPublicRequirementSpotlights(1, 1),
      listCommunityPosts({ tag: '公告', limit: 5, offset: 0 }),
      getResourcePromoMeta(resourceToken ?? undefined),
    ])
  void tagTreeStore.ensure()

  if (!isMounted) {
    return
  }

  if (promoMetaResult.status === 'fulfilled') {
    const threshold = Number(promoMetaResult.value.high_like_threshold)
    if (Number.isFinite(threshold) && threshold >= 1) {
      highLikeThreshold.value = Math.floor(threshold)
    }
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

  publishLoading.value = true

  try {
    const payload = {
      title: normalizedTitle,
      description: descriptionValidation.value,
      budget,
      acceptance_criteria: acceptanceValidation.value,
      payment_mode: publishPaymentMode.value,
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

          <section class="portal-section">
            <div class="portal-section__header">
              <div class="portal-section-title">
                <span class="portal-section-title__icon" aria-hidden="true">★</span>
                <h2>免费精选资源</h2>
              </div>
              <button
                class="portal-link-btn"
                type="button"
                @click="router.push({ name: 'resources', query: { sale: 'free' } })"
              >
                更多免费资源
              </button>
            </div>
            <template v-if="spotlightCards.length > 0">
              <div class="portal-spotlight-grid">
                <article
                  v-for="card in pagedSpotlightCards"
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
                    <span v-if="card.badge" class="portal-spotlight-card__badge">{{
                      card.badge
                    }}</span>
                    <span
                      v-if="card.mark"
                      class="portal-spotlight-card__mark portal-spotlight-card__mark--featured"
                    >
                      <span class="portal-spotlight-card__mark-dot" aria-hidden="true"></span>
                      {{ card.mark }}
                    </span>
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
                    <div v-if="card.tags.length" class="portal-spotlight-card__meta-row">
                      <strong v-for="tag in card.tags" :key="tag">{{ tag }}</strong>
                    </div>
                    <div class="portal-spotlight-card__footer">
                      <div class="portal-spotlight-card__footer-main">
                        <span class="portal-spotlight-card__stats">
                          <span class="portal-spotlight-card__stat" title="浏览量">
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            {{ card.viewCount }}
                          </span>
                          <span class="portal-spotlight-card__stat" title="下载量">
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                              <polyline points="7 10 12 15 17 10"></polyline>
                              <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            {{ card.downloadCount }}
                          </span>
                        </span>
                        <span
                          v-if="card.authorLabel"
                          class="portal-spotlight-card__author"
                          :class="{
                            'is-marquee': isSpotlightAuthorMarquee(card.resourceId),
                            'username-gradient': card.gradient && !card.userColor,
                          }"
                          :style="card.userColor ? { color: card.userColor } : undefined"
                          :title="card.authorLabel"
                          :ref="(el) => bindSpotlightAuthorMarquee(el, card.resourceId)"
                        >
                          <span class="portal-spotlight-card__author-text">{{
                            card.authorLabel
                          }}</span>
                        </span>
                      </div>
                      <div class="portal-spotlight-card__footer-bottom">
                        <div class="portal-spotlight-card__footer-leading">
                          <span
                            v-if="card.originLabel"
                            class="portal-spotlight-card__origin"
                            :class="{ 'is-repost': card.originRepost }"
                            >{{ card.originLabel }}</span
                          >
                          <button
                            type="button"
                            class="portal-spotlight-card__likes"
                            :class="{
                              'is-liked': card.likedByMe,
                              'is-busy':
                                card.resourceId != null &&
                                spotlightLikeSubmittingIds.has(card.resourceId),
                            }"
                            :title="card.likedByMe ? '取消点赞' : '点赞'"
                            :aria-pressed="card.likedByMe"
                            :aria-label="
                              card.likedByMe
                                ? `已点赞 ${card.likeCount}，点击取消`
                                : `点赞，当前 ${card.likeCount}`
                            "
                            :disabled="
                              card.resourceId != null &&
                              spotlightLikeSubmittingIds.has(card.resourceId)
                            "
                            @click="toggleSpotlightLike(card, $event)"
                            @keydown.enter.stop
                            @keydown.space.stop
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="13"
                              height="13"
                              :fill="card.likedByMe ? 'currentColor' : 'none'"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-hidden="true"
                            >
                              <path
                                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                              ></path>
                            </svg>
                            {{ card.likeCount }}
                          </button>
                        </div>
                        <span v-if="card.metaTime" class="portal-spotlight-card__time">{{
                          card.metaTime
                        }}</span>
                      </div>
                    </div>
                  </div>
                </article>
              </div>

              <nav
                v-if="spotlightPageCount > 1"
                class="portal-pagination"
                aria-label="免费资源分页"
              >
                <button
                  class="portal-pagination__nav"
                  type="button"
                  :disabled="spotlightPage <= 1"
                  @click="goSpotlightPage(spotlightPage - 1)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                  上一页
                </button>
                <template v-for="item in spotlightPaginationItems" :key="item.key">
                  <button
                    v-if="item.page"
                    class="portal-pagination__page"
                    :class="{ 'is-active': item.page === spotlightPage }"
                    type="button"
                    @click="goSpotlightPage(item.page ?? spotlightPage)"
                  >
                    {{ item.label }}
                  </button>
                  <span v-else class="portal-pagination__jump-wrap">
                    <button
                      class="portal-pagination__ellipsis"
                      type="button"
                      aria-label="跳转到指定页"
                      @click.stop="toggleSpotlightJump(item.key)"
                    >
                      {{ item.label }}
                    </button>
                    <div
                      v-if="spotlightJumpOpen && spotlightJumpAnchor === item.key"
                      class="portal-pagination__jump"
                      @click.stop
                    >
                      <span class="portal-pagination__jump-label">转到第</span>
                      <input
                        v-model="spotlightJumpValue"
                        class="portal-pagination__jump-input"
                        type="number"
                        :min="1"
                        :max="spotlightPageCount"
                        inputmode="numeric"
                        @keydown.enter.prevent="submitSpotlightJump"
                      />
                      <span class="portal-pagination__jump-label">页</span>
                      <button
                        class="portal-pagination__jump-submit"
                        type="button"
                        @click="submitSpotlightJump"
                      >
                        跳转
                      </button>
                    </div>
                  </span>
                </template>
                <button
                  class="portal-pagination__nav"
                  type="button"
                  :disabled="spotlightPage >= spotlightPageCount"
                  @click="goSpotlightPage(spotlightPage + 1)"
                >
                  下一页
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </nav>
            </template>
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
                <template v-if="homeCheckinStatus && !homeCheckinStatus.today_checked_in">
                  <span class="portal-beta-invite__title">📅 每日签到</span>
                  <p class="portal-beta-invite__text">
                    今日签到可得
                    <strong>{{ homeCheckinStatus.today_potential }}</strong>
                    积分，连续签到
                    <strong>{{ homeCheckinStatus.streak_count }}</strong>
                    天。
                  </p>
                  <button
                    class="portal-checkin-card__cta"
                    type="button"
                    :disabled="checkinHomeSaving"
                    @click="handleHomeCheckin"
                  >
                    {{ checkinHomeSaving ? '签到中…' : '立即签到' }}
                  </button>
                </template>
                <template v-else>
                  <span class="portal-beta-invite__title">🎁 邀请有礼</span>
                  <p class="portal-beta-invite__text">
                    每邀请一位好友注册，即可解锁专属徽章和排行榜荣誉
                  </p>
                  <RouterLink class="portal-beta-invite__cta" :to="{ name: 'workbench-badges' }">
                    立即邀请
                  </RouterLink>
                </template>
              </div>

              <button class="portal-beta-notice__btn" type="button" @click="openBetaGroup">
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

          <section id="portal-developers" class="portal-card portal-card--stats">
            <div class="portal-card__header portal-card__header--stats">
              <div class="portal-card__title portal-card__title--stats">
                <span class="portal-stats-head__icon" aria-hidden="true">◉</span>
                <h2>内测里程碑</h2>
              </div>
            </div>
            <div class="portal-milestone__intro">
              <button class="portal-milestone__cta" type="button" @click="openResourceInit">
                {{ isDeveloperAccount ? '发布资源 →' : '立即入驻 →' }}
              </button>
            </div>
            <div class="portal-stats-grid">
              <article
                v-for="(stat, index) in platformStats"
                :key="stat.label"
                class="portal-stat-item"
                :class="`portal-stat-item--tone-${index % 4}`"
                :style="{ '--stat-index': String(index) }"
              >
                <span class="portal-stat-item__icon" aria-hidden="true">
                  <component :is="stat.icon" />
                </span>
                <div class="portal-stat-item__copy">
                  <div class="portal-stat-item__label">
                    <span>{{ stat.label }}</span>
                    <span v-if="stat.progress" class="portal-stat-item__target">目标</span>
                  </div>
                  <strong>{{ stat.value }}</strong>
                  <span v-if="stat.note" class="portal-stat-item__note">{{ stat.note }}</span>
                  <div v-if="stat.progress" class="portal-stat-item__progress">
                    <span
                      class="portal-stat-item__progress-bar"
                      :style="{ width: progressPercent(stat.progress) }"
                    ></span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="portal-card portal-card--rank portal-contrib">
            <div class="portal-card__header portal-contrib__header">
              <div class="portal-card__title portal-card__title--rank">
                <span class="portal-card-title-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="8" r="6" />
                    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                  </svg>
                </span>
                <h2>开发者贡献榜</h2>
              </div>
            </div>
            <ol v-if="developerRanks.length > 0" class="portal-contrib-list">
              <li
                v-for="(developer, index) in developerRanks"
                :key="developer.username"
                class="portal-contrib-item"
                :class="`portal-contrib-item--rank-${index + 1}`"
                :style="{ '--rank-index': String(index) }"
                @click="
                  router.push({
                    name: 'dev-profile',
                    params: { username: developer.username },
                  })
                "
              >
                <span class="portal-contrib-item__rank">{{ index + 1 }}</span>
                <span class="portal-contrib-item__avatar">
                  <img
                    v-if="developer.avatarUrl"
                    :src="developer.avatarUrl"
                    :alt="`${developer.name} 的头像`"
                    @error="handleDeveloperAvatarError(developer)"
                  />
                  <span v-else>{{ developer.name.slice(0, 1) }}</span>
                </span>
                <div class="portal-contrib-item__meta">
                  <strong
                    :class="{ 'username-gradient': developer.gradient && !developer.userColor }"
                    :style="developer.userColor ? { color: developer.userColor } : {}"
                    >{{ developer.name }}</strong
                  >
                  <div
                    class="portal-contrib-item__badges"
                    v-if="devBadges(developer.username).length > 0"
                  >
                    <span
                      v-for="badge in devBadges(developer.username).slice(0, 3)"
                      :key="badge.code"
                      class="portal-contrib-item__badge"
                      :title="`${badge.name}：${badge.description}`"
                    >
                      <img
                        v-if="badge.icon.startsWith('badges/')"
                        :src="`/uploads/${badge.icon}`"
                        class="portal-contrib-item__badge-img"
                        alt=""
                      />
                      <template v-else>{{ badge.icon }}</template>
                    </span>
                    <span
                      v-if="devBadges(developer.username).length > 3"
                      class="portal-contrib-item__badge-more"
                    >
                      +{{ devBadges(developer.username).length - 3 }}
                    </span>
                  </div>
                </div>
                <div class="portal-contrib-item__side">
                  <strong class="portal-contrib-item__count">{{ developer.deals }}</strong>
                </div>
              </li>
            </ol>
            <div v-else class="portal-empty-state portal-empty-state--compact">
              <strong>暂无公开开发者</strong>
            </div>
            <div v-if="developerRanks.length > 0" class="portal-contrib-footer">
              本周
              <strong>{{ totalContribResources }}</strong>
              个资源 ·
              <strong>{{ developerRanks.length }}</strong>
              位开发者
            </div>
          </section>
          <section v-if="teamRanks.length > 0" class="portal-card portal-card--team">
            <div class="portal-card__header">
              <div class="portal-card__title portal-card__title--team">
                <span
                  class="portal-card-title-icon portal-card-title-icon--team"
                  aria-hidden="true"
                >
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
                @click="router.push({ name: 'team-profile', params: { teamId: team.teamId } })"
              >
                <div class="portal-rank-item__avatar">
                  <img
                    v-if="team.avatarUrl"
                    :src="team.avatarUrl"
                    :alt="`${team.teamName} 的头像`"
                    @error="handleTeamAvatarError(team)"
                  />
                  <span v-else>{{ team.teamName.slice(0, 1) }}</span>
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
