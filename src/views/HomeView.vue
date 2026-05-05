<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/auth'
import AppToast from '@/components/AppToast.vue'
import AuthModal from '@/components/AuthModal.vue'
import PublishModal from '@/components/PublishModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import { buildDevPortalUrl } from '@/config/runtime'
import { useToast } from '@/composables/useToast'
import { useAuthForm } from '@/composables/useAuthForm'
import {
  confirmPayment,
  createAlipayPagePayment,
  createPayment,
  type AlipayCreatePaymentResp,
  type AlipayPageCreatePaymentResp,
  type WechatCreatePaymentResp,
} from '@/api/payments'
import { listAvailableCoupons, type CouponItem } from '@/api/coupons'
import { HttpError } from '@/api/http'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import {
  createRequirement,
  getPublicRequirementOverview,
  listRequirements,
  resubmitRequirement,
  type RequirementStatus,
} from '@/api/requirements'
import { getMyRealnameVerification, type UserRealnameStatus } from '@/api/realname'
import { getDepositRatio } from '@/api/settings'

type Metric = {
  label: string
  value: string
  hint: string
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
}

type AuthMode = 'login' | 'register' | 'reset'
type PortalNotice = {
  title: string
  date: string
  tag?: string
}

type PortalCategory = {
  label: string
  icon: string
  summary: string
}

type WorkflowStep = {
  title: string
  detail: string
  accent: string
}

type QuickPanel = {
  title: string
  summary: string
  action: string
  tone: 'gift' | 'briefcase'
}

type SpotlightCard = {
  title: string
  summary: string
  budget: string
  status: string
  meta: string
  accent: string
}

type DeveloperRank = {
  name: string
  track: string
  rating: string
  deals: string
}

const metrics = ref<Metric[]>([
  {
    label: '累计完成',
    value: '0 单',
    hint: '已完成需求数',
  },
  {
    label: '综合评价',
    value: '5.00 分',
    hint: '好评率 100%',
  },
  {
    label: '累计成交额',
    value: '¥ 0.00',
    hint: '已支付订单累计金额',
  },
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

const pendingRequirements = ref<PendingRequirementView[]>([])
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const routeModal = computed(() => String(route.query.modal || ''))
const routeAuthMode = computed<AuthMode>(() => {
  const mode = String(route.query.mode || 'login')
  return mode === 'register' || mode === 'reset' ? mode : 'login'
})
const authVisible = computed(() => routeModal.value === 'auth')
// 发布需求功能已暂时禁用：仅在重新编辑被驳回需求（resubmit）的场景下才允许打开发布弹窗。
const publishVisible = computed(
  () => routeModal.value === 'publish' && activeResubmitRequirementId.value !== null,
)
const depositVisible = computed(() => routeModal.value === 'deposit')
const {
  authUsername,
  authPassword,
  authEmail,
  authEmailCode,
  acceptTerms,
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
const activeResubmitRequirementId = ref<string | null>(null)
const publishLoading = ref(false)
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
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()
const publishRealnameStatus = ref<UserRealnameStatus | 'none' | ''>('')
const heroSignals = [
  '免费资源共享',
  '有偿需求定制',
  '安全交易保障',
]
const portalNotices: PortalNotice[] = [
  { title: '免费资源导航升级完成', date: '05-15' },
  { title: '新增「招募设计」需求分类', date: '05-14', tag: 'NEW' },
  { title: '平台服务协议更新说明', date: '05-12' },
  { title: '关于打击恶意行为的公告', date: '05-10' },
]
const quickPanels: QuickPanel[] = [
  {
    title: '免费资源',
    summary: '开发者发布优质资源，需求方随取随用。',
    action: '立即查看',
    tone: 'gift',
  },
  {
    title: '有偿需求',
    summary: '提交需求单，开发者接单完成定制开发。',
    action: '立即发布',
    tone: 'briefcase',
  },
]
const portalCategories: PortalCategory[] = [
  { label: '编程开发', icon: '</>', summary: '插件 / SDK / 后台' },
  { label: '网站开发', icon: '◎', summary: '官网 / CMS / 企业站' },
  { label: '插画设计', icon: '✦', summary: '视觉 / 角色 / 宣传' },
  { label: 'Minecraft', icon: '▣', summary: '插件 / 模组 / 服务器' },
  { label: '移动应用', icon: '⌘', summary: 'iOS / Android / 小程序' },
  { label: '文案写作', icon: '✎', summary: '说明文档 / 宣发内容' },
]
const workflowSteps: WorkflowStep[] = [
  { title: '1. 提交需求单', detail: '明确需求并补充验收标准', accent: 'violet' },
  { title: '2. 需求审核', detail: '平台审核描述与预算完整性', accent: 'blue' },
  { title: '3. 开发者接单', detail: '开发者确认接单并开始协作', accent: 'green' },
  { title: '4. 完成交付', detail: '确认成果后支付尾款', accent: 'orange' },
  { title: '5. 评价完成', detail: '双方评价沉淀平台信用', accent: 'red' },
]
const safeguardItems = [
  '资金安全：平台托管，支持有保障的支付流程',
  '聘用保护：验收节点明确，降低履约风险',
  '信用体系：评价公开，便于筛选可靠开发者',
  '7x24 小时客服：交易问题快速响应',
]

function openDevWorkbench() {
  void router.push(buildDevPortalUrl(auth.token))
}

function scrollToSection(sectionId: string) {
  const element = document.getElementById(sectionId)
  if (!element) {
    return
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function openQuickPanel(panel: QuickPanel) {
  if (panel.tone === 'gift') {
    void router.push({ name: 'free-resources' })
    return
  }

  void openPublishModal()
}

function openSpotlight(card: SpotlightCard) {
  const target = pendingRequirements.value.find((item) => item.title === card.title)
  if (target && canOpenPayment(target)) {
    openDepositCard(target)
    return
  }

  showToast('该需求展示卡片仅作门户展示，详细能力页正在建设中', 'info')
}

function openRequirementCenter() {
  if (!auth.isAuthed) {
    showToast('登录后可查看与你相关的需求单与支付状态', 'info')
    openAuth('login')
    return
  }

  void router.push({ name: 'tickets' })
}

function openMobileProfile() {
  if (!auth.isAuthed) {
    openAuth('login')
    return
  }

  void router.push({ name: 'profile' })
}

const platformStats = computed(() => {
  const [completed, rating, turnover] = metrics.value
  return [
    { label: '成交需求', value: completed?.value ?? '0 单', icon: '◌' },
    { label: '开发者', value: `${Math.max(latestDeals.value.length * 2, 12)}+`, icon: '◎' },
    { label: '需求活跃度', value: `${Math.max(pendingRequirements.value.length * 3, 8)}+`, icon: '◈' },
    { label: '累计金额', value: turnover?.value ?? '¥ 0.00', icon: '✦' },
    { label: '综合评价', value: rating?.value ?? '0%', icon: '★' },
  ]
})

const developerRanks = computed<DeveloperRank[]>(() => {
  const fallback = [
    { name: 'Dev_小明', track: '插件开发', rating: '98', deals: '52 单' },
    { name: 'MC开发君', track: '游戏模组', rating: '96', deals: '48 单' },
    { name: '设计与Seven', track: '插画与视觉', rating: '95', deals: '34 单' },
    { name: '代码工匠', track: '企业站点', rating: '94', deals: '29 单' },
  ]

  if (latestDeals.value.length === 0) {
    return fallback
  }

  return latestDeals.value.slice(0, 4).map((deal, index) => ({
    name: fallback[index]?.name ?? `Dev_${index + 1}`,
    track: deal.title,
    rating: String(98 - index),
    deals: `${12 + index * 7} 单`,
  }))
})

const spotlightCards = computed<SpotlightCard[]>(() => {
  if (pendingRequirements.value.length > 0) {
    return pendingRequirements.value.slice(0, 4).map((item, index) => ({
      title: item.title,
      summary: item.description?.trim() || '需求描述待补充，当前展示为门户精选需求位。',
      budget: typeof item.budget === 'number' ? `¥ ${item.budget.toFixed(0)}` : '待议价',
      status: item.statusLabel,
      meta: item.updatedAtLabel,
      accent: ['nebula', 'sunset', 'forest', 'frost'][index % 4] ?? 'nebula',
    }))
  }

  return [
    {
      title: '在线教育系统开发',
      summary: '用于课程交付与付费订阅的企业级平台。',
      budget: '¥ 2000-5000',
      status: '建设中',
      meta: '3 人参与',
      accent: 'nebula',
    },
    {
      title: '游戏角色原画设计',
      summary: '角色立绘与宣传视觉物料一体交付。',
      budget: '¥ 800-1500',
      status: '邀标中',
      meta: '5 人参与',
      accent: 'sunset',
    },
    {
      title: 'RPG 服务器插件开发',
      summary: 'Minecraft 服务端玩法插件与版本维护。',
      budget: '¥ 1500-3000',
      status: '招募中',
      meta: '2 人参与',
      accent: 'forest',
    },
    {
      title: '企业官网视觉升级',
      summary: '现代化官网重构，含首页与品牌样式库。',
      budget: '¥ 3000-8000',
      status: '定制开发',
      meta: '5 小时前',
      accent: 'frost',
    },
  ]
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
  const raw = typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return ''
  }
  return raw
})

onMounted(() => {
  auth.hydrate()
  const oauthToken = typeof route.query.oauth_token === 'string' ? route.query.oauth_token.trim() : ''
  const oauthError = typeof route.query.oauth_error === 'string' ? route.query.oauth_error.trim() : ''

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
      await Promise.all([loadDepositRatio(), loadPendingRequirements(true), loadRequirementOverview()])
    } else {
      await Promise.all([loadPendingRequirements(true), loadRequirementOverview()])
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

function formatTrend(rate: number) {
  if (rate > 0) {
    return `↑ ${rate.toFixed(1)}%`
  }
  if (rate < 0) {
    return `↓ ${Math.abs(rate).toFixed(1)}%`
  }
  return '持平'
}

function openDepositCard(item: PendingRequirementView) {
  if (item.status === 'rejected') {
    publishTitle.value = item.title || ''
    publishDescription.value = item.description || ''
    publishBudget.value = item.budget ?? ''
    publishAcceptance.value = item.acceptanceCriteria || ''
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
  void fetchContractSigningStatus(auth.token, item.id).then((s) => {
    contractSigningStatus.value = s
  }).catch(() => { /* 忽略，不影响支付流程 */ })
}

function canOpenPayment(item: PendingRequirementView) {
  return item.status === 'pending_deposit' || item.status === 'pending_final' || item.status === 'rejected'
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

function openDealDetail(deal: LatestDealView) {
  selectedDeal.value = deal
  dealDetailVisible.value = true
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

const couponDiscount = computed(() => computeCouponDiscount(couponBaseAmount.value, selectedCoupon.value))

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

  const cappedDiscount = coupon.max_discount_cny != null
    ? Math.min(rawDiscount, coupon.max_discount_cny)
    : rawDiscount

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
    metrics.value = [
      {
        label: '已完成需求数',
        value: `${payload.total_orders ?? 0} 单`,
        hint: `较昨日 ${formatTrend(payload.total_orders_change_rate ?? 0)}`,
      },
      {
        label: '好评率',
        value: `${payload.positive_rate?.toFixed(1) ?? '0.0'}%`,
        hint: `较昨日 ${formatTrend(payload.positive_rate_change_rate ?? 0)}`,
      },
      {
        label: '已支付订单累计金额',
        value: `¥ ${(payload.total_turnover_cny ?? 0).toFixed(2)}`,
        hint: `较昨日 ${formatTrend(payload.total_turnover_change_rate ?? 0)}`,
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
      let createPayload: AlipayCreatePaymentResp | WechatCreatePaymentResp | AlipayPageCreatePaymentResp

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
          ...(channel === 'alipay' ? { page: '1' } : { qr_content: depositPayment.value.alipay_order_string }),
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
      message.includes('developer must sign first and user must sign after that before paying deposit')
      || message.includes('requirement contract must be signed by developer before paying deposit')
      || message.includes('contract must be created before paying deposit')
    ) {
      showToast('当前需求需先由开发者（乙方）签署，再由您（甲方）签署协议后，才能支付定金', 'warning')
    } else {
      showToast(message, 'error')
    }
  } finally {
    depositLoading.value = false
  }
}

function openAuth(mode: AuthMode) {
  resetAuthForm()
  const nextQuery: Record<string, string> = { modal: 'auth', mode }
  if (authRedirectTarget.value) {
    nextQuery.redirect_to = authRedirectTarget.value
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
    await Promise.all([loadDepositRatio(), loadPendingRequirements(), loadRequirementOverview()])
  }
}

function realnameStatusText(status: UserRealnameStatus | 'none' | '') {
  if (status === 'approved') return '已通过'
  if (status === 'pending') return '审核中'
  if (status === 'rejected') return '已驳回'
  return '未提交'
}

async function ensurePublishRealnameApproved() {
  if (!auth.isAuthed) {
    showToast('发布需求前请先登录', 'info')
    openAuth('login')
    return false
  }

  if (publishRealnameStatus.value === 'approved') {
    return true
  }

  try {
    const record = await getMyRealnameVerification(auth.token)
    publishRealnameStatus.value = record.status
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      publishRealnameStatus.value = 'none'
    } else {
      showToast(err instanceof Error ? err.message : '加载实名认证状态失败', 'error')
      return false
    }
  }

  if (publishRealnameStatus.value === 'approved') {
    return true
  }

  showToast(`请先完成实名认证后再发布需求（当前：${realnameStatusText(publishRealnameStatus.value)}）`, 'warning')
  await router.push({
    name: 'realname',
    query: {
      redirect_to: '/?modal=publish',
    },
  })
  return false
}

async function openPublishModal() {
  // 发布需求功能已暂时禁用
  showToast('发布需求功能暂未开放，敬请期待', 'info')
}

async function refreshHomeData() {
  if (homeRefreshLoading.value) {
    return
  }

  homeRefreshLoading.value = true
  try {
    if (auth.isAuthed) {
      await Promise.all([loadDepositRatio(), loadPendingRequirements(), loadRequirementOverview()])
    } else {
      await Promise.all([loadPendingRequirements(), loadRequirementOverview()])
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
  // 发布需求功能已暂时禁用：仅允许“重新编辑需求”（resubmit）流程提交。
  if (!activeResubmitRequirementId.value) {
    showToast('发布需求功能暂未开放，敬请期待', 'info')
    return
  }

  const approved = await ensurePublishRealnameApproved()
  if (!approved) {
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
    const payload = {
      title: normalizedTitle,
      description: normalizedDescription,
      budget,
      acceptance_criteria: normalizedAcceptance,
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
    activeResubmitRequirementId.value = null
    publishTitle.value = ''
    publishDescription.value = ''
    publishBudget.value = ''
    publishAcceptance.value = ''
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
                <p class="portal-eyebrow">柒叁信息门户</p>
                <h1>需求定制开发交易平台</h1>
                <p class="portal-hero__desc">连接需求与能力，让创意变为现实。免费资源、定制需求、开发协作与支付交付在同一门户闭环完成。</p>

                <div class="portal-signal-list">
                  <span v-for="signal in heroSignals" :key="signal" class="portal-signal">{{ signal }}</span>
                </div>

                <div class="portal-hero__actions">
                  <button class="portal-primary-action" type="button" @click="openPublishModal">发布需求</button>
                  <button class="portal-secondary-action" type="button" @click="openDevWorkbench">成为开发者</button>
                </div>
              </div>

              <div class="portal-hero__visual" aria-hidden="true">
                <div class="portal-stage">
                  <div class="portal-stage__halo"></div>
                  <div class="portal-stage__core">73</div>
                  <div class="portal-stage__tile portal-stage__tile--top">⌘</div>
                  <div class="portal-stage__tile portal-stage__tile--left">◫</div>
                  <div class="portal-stage__tile portal-stage__tile--right">✦</div>
                  <div class="portal-stage__tile portal-stage__tile--bottom">▣</div>
                  <div class="portal-stage__tile portal-stage__tile--accent">&lt;/&gt;</div>
                </div>
              </div>
            </div>
          </section>

          <section class="portal-quick-grid">
            <article v-for="panel in quickPanels" :key="panel.title" class="portal-quick-card"
              :class="`portal-quick-card--${panel.tone}`">
              <div class="portal-quick-card__icon">{{ panel.tone === 'gift' ? '🎁' : '💼' }}</div>
              <div class="portal-quick-card__copy">
                <h3>{{ panel.title }}</h3>
                <p>{{ panel.summary }}</p>
                <button class="portal-inline-action" type="button" @click="openQuickPanel(panel)">
                  {{ panel.action }}
                  <el-icon>
                    <ArrowRight />
                  </el-icon>
                </button>
              </div>
            </article>
          </section>

          <section id="portal-spotlight" class="portal-section">
            <div class="portal-section__header">
              <div>
                <p class="portal-section__eyebrow">热门分类</p>
                <h2>覆盖编程开发、设计创作到 Minecraft 定制</h2>
              </div>
              <button class="portal-link-btn" type="button"
                @click="router.push({ name: 'free-resources' })">全部分类</button>
            </div>
            <div class="portal-category-grid">
              <article v-for="category in portalCategories" :key="category.label" class="portal-category-card">
                <div class="portal-category-card__icon">{{ category.icon }}</div>
                <strong>{{ category.label }}</strong>
                <span>{{ category.summary }}</span>
              </article>
            </div>
          </section>

          <section class="portal-section">
            <div class="portal-section__header">
              <div>
                <p class="portal-section__eyebrow">精选需求</p>
                <h2>当前门户重点展示的需求与项目卡片</h2>
              </div>
              <button class="portal-link-btn" type="button"
                @click="router.push({ name: 'requirement-hall' })">更多需求</button>
            </div>
            <div class="portal-spotlight-grid">
              <article v-for="card in spotlightCards" :key="card.title" class="portal-spotlight-card"
                :class="`portal-spotlight-card--${card.accent}`" @click="openSpotlight(card)">
                <div class="portal-spotlight-card__cover"></div>
                <div class="portal-spotlight-card__body">
                  <div class="portal-spotlight-card__topline">
                    <span class="portal-chip">{{ card.status }}</span>
                    <span>{{ card.meta }}</span>
                  </div>
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.summary }}</p>
                  <div class="portal-spotlight-card__footer">
                    <strong>{{ card.budget }}</strong>
                    <span>查看详情</span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="portal-sidebar">
          <section class="portal-card portal-card--notice">
            <div class="portal-card__header">
              <h2>平台公告</h2>
              <button class="portal-link-btn" type="button" @click="router.push({ name: 'community' })">更多</button>
            </div>
            <ul class="portal-notice-list">
              <li v-for="notice in portalNotices" :key="`${notice.title}-${notice.date}`" class="portal-notice-item">
                <div>
                  <strong>{{ notice.title }}</strong>
                  <span v-if="notice.tag" class="portal-tag">{{ notice.tag }}</span>
                </div>
                <time>{{ notice.date }}</time>
              </li>
            </ul>
          </section>

          <section id="portal-developers" class="portal-card">
            <div class="portal-card__header">
              <h2>平台数据</h2>
              <button class="portal-link-btn" type="button" :disabled="homeRefreshLoading" @click="refreshHomeData">
                {{ homeRefreshLoading ? '刷新中' : '刷新' }}
              </button>
            </div>
            <div class="portal-stats-grid">
              <article v-for="stat in platformStats" :key="stat.label" class="portal-stat-item">
                <span class="portal-stat-item__icon">{{ stat.icon }}</span>
                <div>
                  <strong>{{ stat.value }}</strong>
                  <span>{{ stat.label }}</span>
                </div>
              </article>
            </div>
          </section>

          <section class="portal-card">
            <div class="portal-card__header">
              <h2>平台保障</h2>
            </div>
            <ul class="portal-safe-list">
              <li v-for="item in safeguardItems" :key="item">{{ item }}</li>
            </ul>
          </section>

          <section class="portal-card">
            <div class="portal-card__header">
              <h2>优选开发者</h2>
              <button class="portal-link-btn" type="button" @click="router.push({ name: 'community' })">查看动态</button>
            </div>
            <ul class="portal-rank-list">
              <li v-for="developer in developerRanks" :key="developer.name" class="portal-rank-item">
                <div class="portal-rank-item__avatar">{{ developer.name.slice(0, 1) }}</div>
                <div class="portal-rank-item__meta">
                  <strong>{{ developer.name }}</strong>
                  <span>{{ developer.track }}</span>
                </div>
                <div class="portal-rank-item__score">
                  <strong>{{ developer.deals }}</strong>
                  <span>信用 {{ developer.rating }}</span>
                </div>
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <nav class="portal-mobile-dock" aria-label="移动端快捷导航">
        <button type="button" class="portal-mobile-dock__item active" @click="scrollToSection('top')">
          <span>⌂</span>
          <small>首页</small>
        </button>
        <button type="button" class="portal-mobile-dock__item" @click="router.push({ name: 'requirement-hall' })">
          <span>◫</span>
          <small>需求</small>
        </button>
        <button type="button" class="portal-mobile-dock__item portal-mobile-dock__item--primary"
          @click="openPublishModal">
          <span>＋</span>
          <small>发布</small>
        </button>
        <button type="button" class="portal-mobile-dock__item" @click="openDevWorkbench">
          <span>⌘</span>
          <small>开发者</small>
        </button>
        <button type="button" class="portal-mobile-dock__item" @click="router.push({ name: 'community' })">
          <span>◉</span>
          <small>社区</small>
        </button>
      </nav>
    </div>

    <div v-if="dealDetailVisible && selectedDeal" class="auth-modal-wrap" @click.self="closeDealDetail">
      <section class="auth-modal" aria-label="最近成交详情">
        <h3>{{ selectedDeal.title }}</h3>
        <p class="auth-switch">需求号：{{ selectedDeal.requirementId }}</p>
        <p class="auth-switch">成交金额：{{ selectedDeal.amount }}</p>
        <p class="auth-switch">成交时间：{{ selectedDeal.at }}</p>
        <p class="auth-switch">评分：{{ selectedDeal.rating != null ? `${selectedDeal.rating.toFixed(1)} / 5` : '暂无评分' }}
        </p>
        <p class="auth-switch">评论时间：{{ selectedDeal.commentedAt || '暂无评论时间' }}</p>
        <label class="auth-label">
          <span>评论内容</span>
          <textarea :value="selectedDeal.comment || '暂无评论内容'" rows="4" readonly />
        </label>
        <div class="auth-modal-actions">
          <button class="auth-btn solid" type="button" @click="closeDealDetail">关闭</button>
        </div>
      </section>
    </div>

    <AuthModal :visible="authVisible" :authMode="routeAuthMode" :authTitle="authTitle"
      v-model:authUsername="authUsername" v-model:authPassword="authPassword" v-model:authEmail="authEmail"
      v-model:authEmailCode="authEmailCode" v-model:acceptTerms="acceptTerms" :authLoading="auth.loading"
      :githubLoginLoading="githubLoading" :sendCodeLoading="sendCodeLoading" :sendCodeCountdown="sendCodeCountdown"
      @close="closeAuth" @submit="submitAuth" @loginWithGithub="loginWithGithub" @sendAuthCode="sendAuthCode"
      @change-mode="openAuth" />

    <PublishModal :visible="publishVisible" v-model:publishTitle="publishTitle"
      v-model:publishDescription="publishDescription" v-model:publishBudget="publishBudget"
      v-model:publishAcceptance="publishAcceptance" :modalTitle="publishModalTitle" :submitText="publishModalSubmitText"
      :loadingText="publishModalLoadingText" :publishLoading="publishLoading" @close="closePublishModal"
      @submit="submitPublishRequirement" />

    <DepositModal v-if="depositVisible && depositRequirement" :visible="depositVisible"
      :depositRequirement="depositRequirement" :formattedBudget="formatMoney(depositRequirement.budget)"
      :paymentStageLabel="paymentStageLabel" :depositChannel="depositChannel" :amountCouponCode="amountCouponCode"
      :discountCouponCode="discountCouponCode" :isFinalPayment="isFinalPayment"
      :depositRatioPercent="depositRatioPercent" :couponSummary="couponSummary" :availableCoupons="availableCoupons"
      :couponLoading="couponLoading" :depositLoading="depositLoading" :depositPayment="depositPayment"
      :couponFinalAmount="couponFinalAmount" :depositPolicyAccepted="depositPolicyAccepted"
      :contractSigningStatus="contractSigningStatus" @close="closeDepositCard" @submit="submitDepositPayment"
      @update:depositPolicyAccepted="depositPolicyAccepted = $event" @update:depositChannel="depositChannel = $event"
      @selectCoupon="selectCoupon" @loadAvailableCoupons="loadAvailableCoupons" />

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />

  </main>
</template>

<style scoped>
.portal-home {
  min-height: 100vh;
  padding: 0 0 40px;
  background: #f2ede3;
  color: #1e293b;
}

.portal-shell {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.portal-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.58fr) minmax(300px, 0.72fr);
  gap: 14px;
  align-items: start;
}

.portal-main,
.portal-sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.portal-card,
.portal-quick-card,
.portal-category-card,
.portal-step-card,
.portal-spotlight-card,
.portal-hero__main {
  border: 1px solid rgba(228, 234, 246, 0.95);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 28px rgba(90, 120, 180, 0.08);
  backdrop-filter: blur(10px);
}

.portal-link-btn,
.portal-link-btn,
.portal-inline-action,
.portal-primary-action,
.portal-secondary-action {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.portal-primary-action {
  padding: 11px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 16px 28px rgba(37, 99, 235, 0.28);
}


.portal-hero {
  display: block;
}

.portal-hero__main {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
  gap: 16px;
  border-radius: 22px;
  padding: 24px;
}

.portal-hero__copy {
  display: flex;
  flex-direction: column;
  gap: 14px;
  justify-content: center;
}

.portal-eyebrow,
.portal-section__eyebrow {
  margin: 0;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.portal-hero__copy h1 {
  margin: 0;
  max-width: 11ch;
  font-size: clamp(34px, 4.8vw, 54px);
  line-height: 1.08;
  letter-spacing: -0.05em;
  color: #0f172a;
}

.portal-hero__desc {
  margin: 0;
  max-width: 52ch;
  font-size: 15px;
  line-height: 1.72;
  color: #475569;
}

.portal-signal-list,
.portal-hero__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.portal-signal {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.96);
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.portal-signal::before {
  content: '•';
}

.portal-secondary-action {
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  color: #1d4ed8;
  font-weight: 700;
  border: 1px solid rgba(96, 165, 250, 0.6);
}

.portal-hero__visual {
  position: relative;
  min-height: 308px;
  border-radius: 22px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.94);
}

.portal-stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.portal-stage__halo {
  position: absolute;
  width: 78%;
  aspect-ratio: 1 / 0.56;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(82, 126, 255, 0.18), rgba(82, 126, 255, 0.02) 70%, transparent 72%);
  filter: blur(4px);
}

.portal-stage__core {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 132px;
  height: 162px;
  border-radius: 28px;
  background: linear-gradient(180deg, #7ba4ff, #285cff);
  color: #fff;
  font-size: 54px;
  font-weight: 900;
  box-shadow: 0 24px 48px rgba(37, 99, 235, 0.24);
}

.portal-stage__tile {
  position: absolute;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  color: #3568ff;
  font-size: 22px;
  font-weight: 800;
  box-shadow: 0 16px 28px rgba(84, 109, 175, 0.12);
}

.portal-stage__tile--top {
  top: 54px;
  left: 52%;
}

.portal-stage__tile--left {
  left: 82px;
  top: 132px;
}

.portal-stage__tile--right {
  right: 74px;
  top: 108px;
}

.portal-stage__tile--bottom {
  bottom: 56px;
  right: 148px;
}

.portal-stage__tile--accent {
  bottom: 102px;
  left: 132px;
}

.portal-card {
  padding: 16px;
  border-radius: 18px;
}

.portal-card__header,
.portal-section__header,
.portal-spotlight-card__footer,
.portal-quick-card,
.portal-notice-item,
.portal-rank-item,
.portal-stat-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.portal-card__header h2,
.portal-section__header h2 {
  margin: 0;
  font-size: 18px;
}

.portal-link-btn,
.portal-inline-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  background: transparent;
  color: #2563eb;
  font-weight: 700;
}

.portal-notice-list,
.portal-safe-list,
.portal-rank-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.portal-notice-item strong,
.portal-rank-item__meta strong {
  display: inline-block;
  font-size: 14px;
}

.portal-notice-item div,
.portal-rank-item__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.portal-notice-item time,
.portal-notice-item span,
.portal-rank-item__meta span,
.portal-rank-item__score span,
.portal-stat-item span,
.portal-category-card span,
.portal-spotlight-card__topline span,
.portal-spotlight-card__body p {
  color: #64748b;
  font-size: 12px;
}

.portal-tag,
.portal-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 11px;
  font-weight: 800;
}

.portal-stats-grid,
.portal-category-grid,
.portal-workflow-grid,
.portal-spotlight-grid {
  display: grid;
  gap: 12px;
}

.portal-stats-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 12px;
}

.portal-stat-item {
  align-items: flex-start;
  justify-content: flex-start;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
}

.portal-stat-item__icon,
.portal-category-card__icon,
.portal-rank-item__avatar,
.portal-quick-card__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.portal-stat-item__icon,
.portal-rank-item__avatar {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.16), rgba(56, 189, 248, 0.16));
  color: #2563eb;
  font-weight: 800;
}

.portal-stat-item strong,
.portal-rank-item__score strong,
.portal-category-card strong,
.portal-spotlight-card h3,
.portal-quick-card h3 {
  color: #0f172a;
}

.portal-safe-list li {
  position: relative;
  padding-left: 18px;
  color: #334155;
  line-height: 1.6;
}

.portal-safe-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}

.portal-rank-item {
  align-items: center;
}

.portal-rank-item__score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.portal-quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.portal-quick-card {
  padding: 18px;
  border-radius: 18px;
  justify-content: flex-start;
}

.portal-quick-card--gift {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(240, 245, 255, 0.96)),
    linear-gradient(90deg, #ffd7d1, transparent);
}

.portal-quick-card--briefcase {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(255, 247, 237, 0.96)),
    linear-gradient(90deg, #ffd6a5, transparent);
}

.portal-quick-card__icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  font-size: 30px;
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.85);
}

.portal-quick-card__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.portal-quick-card__copy h3,
.portal-section__header h2,
.portal-spotlight-card h3 {
  margin: 0;
}

.portal-quick-card__copy p,
.portal-category-card span,
.portal-step-card p,
.portal-spotlight-card__body p {
  margin: 0;
  line-height: 1.65;
}

.portal-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.portal-category-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.portal-category-card,
.portal-step-card {
  padding: 18px 16px;
  border-radius: 18px;
}

.portal-category-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  min-height: 116px;
}

.portal-category-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(59, 130, 246, 0.2));
  color: #1d4ed8;
  font-size: 24px;
  font-weight: 800;
}

.portal-section--workflow {
  padding: 20px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(228, 234, 246, 0.95);
}

.portal-workflow-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.portal-step-card {
  min-height: 104px;
}

.portal-step-card--violet {
  box-shadow: inset 0 0 0 1px rgba(124, 58, 237, 0.12);
}

.portal-step-card--blue {
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.12);
}

.portal-step-card--green {
  box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.12);
}

.portal-step-card--orange {
  box-shadow: inset 0 0 0 1px rgba(249, 115, 22, 0.12);
}

.portal-step-card--red {
  box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.12);
}

.portal-step-card strong {
  display: block;
  margin-bottom: 8px;
}

.portal-spotlight-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.portal-spotlight-card {
  overflow: hidden;
  border-radius: 18px;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.portal-spotlight-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 28px 56px rgba(60, 94, 168, 0.18);
}

.portal-spotlight-card__cover {
  height: 142px;
}

.portal-spotlight-card--nebula .portal-spotlight-card__cover {
  background: linear-gradient(135deg, #2f3f9e, #5f7df2);
}

.portal-spotlight-card--sunset .portal-spotlight-card__cover {
  background: linear-gradient(135deg, #9a3412, #fb923c);
}

.portal-spotlight-card--forest .portal-spotlight-card__cover {
  background: linear-gradient(135deg, #2e7d32, #84cc16);
}

.portal-spotlight-card--frost .portal-spotlight-card__cover {
  background: linear-gradient(135deg, #1d4ed8, #7dd3fc);
}

.portal-spotlight-card__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.portal-spotlight-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.portal-spotlight-card__footer strong {
  font-size: 16px;
}

.portal-mobile-dock {
  position: sticky;
  bottom: 14px;
  z-index: 8;
  display: none;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 40px rgba(76, 103, 172, 0.14);
  backdrop-filter: blur(18px);
}

.portal-mobile-dock__item {
  display: grid;
  place-items: center;
  gap: 4px;
  min-height: 58px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: #475569;
  cursor: pointer;
}

.portal-mobile-dock__item span {
  font-size: 18px;
  font-weight: 700;
}

.portal-mobile-dock__item small {
  font-size: 11px;
  font-weight: 700;
}

.portal-mobile-dock__item.active,
.portal-mobile-dock__item--primary {
  color: #1d4ed8;
}

.portal-mobile-dock__item--primary {
  background: rgba(219, 234, 254, 0.88);
}

@media (max-width: 1200px) {

  .portal-layout,
  .portal-hero__main,
  .portal-category-grid,
  .portal-spotlight-grid,
  .portal-workflow-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .portal-main,
  .portal-sidebar {
    gap: 12px;
  }

  .portal-hero__copy h1 {
    max-width: none;
  }
}

@media (max-width: 900px) {
  .portal-home {
    padding: 0 0 36px;
  }

  .portal-shell {
    width: calc(100% - 16px);
  }

  .portal-layout,
  .portal-hero__actions,
  .portal-quick-grid,
  .portal-hero__main,
  .portal-category-grid,
  .portal-spotlight-grid,
  .portal-workflow-grid,
  .portal-stats-grid {
    grid-template-columns: 1fr;
  }

  .portal-mobile-dock {
    display: grid;
  }

  .portal-quick-grid,
  .portal-category-grid,
  .portal-spotlight-grid,
  .portal-workflow-grid {
    display: grid;
  }

  .portal-stage__core {
    width: 118px;
    height: 148px;
    font-size: 48px;
  }

  .portal-stage__tile {
    width: 58px;
    height: 58px;
    font-size: 18px;
  }

  .portal-stage__tile--left {
    left: 26px;
  }

  .portal-stage__tile--right {
    right: 24px;
  }

  .portal-stage__tile--accent {
    left: 52px;
  }

  .portal-stage__tile--bottom {
    right: 72px;
  }
}
</style>
