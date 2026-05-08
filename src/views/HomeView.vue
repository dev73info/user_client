<script setup lang="ts">
import '@/styles/home.css'

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/auth'
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
  type RequirementPaymentMode,
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
  paymentMode: RequirementPaymentMode
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
  step: string
  title: string
  hint: string
  icon: string
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
  badge: string
  metaSecondary: string
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
const publishVisible = computed(() => routeModal.value === 'publish')
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
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
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
const { showToast } = useToast()
const publishRealnameStatus = ref<UserRealnameStatus | 'none' | ''>('')
const heroSignals = [
  '免费资源共享',
  '有偿需求定制',
  '安全交易保障',
]
const portalNotices: PortalNotice[] = [
  { title: '信用点商城全新上线', date: '05-15' },
  { title: '新增「绘画设计」需求分类', date: '05-14', tag: 'NEW' },
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
  { step: '1.', title: '提交需求', hint: '填写需求并补充验收标准', icon: '◫', accent: 'violet' },
  { step: '2.', title: '需求审核', hint: '平台审核描述与预算完整性', icon: '☑', accent: 'blue' },
  { step: '3.', title: '开发者接单', hint: '平台撮合并进入协作阶段', icon: '⌘', accent: 'green' },
  { step: '4.', title: '完成验收', hint: '根据验收节点完成交付确认', icon: '✉', accent: 'orange' },
  { step: '5.', title: '评价完成', hint: '沉淀信用记录与后续复购依据', icon: '♥', accent: 'red' },
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

const platformStats = computed(() => {
  const [completed, , turnover] = metrics.value
  const developerCount = Math.max(latestDeals.value.length * 2, 12)
  const registeredCount = Math.max(developerCount * 3, 36)

  return [
    { label: '注册用户', value: `${registeredCount}+`, icon: '◌' },
    { label: '开发者', value: `${developerCount}+`, icon: '◎' },
    { label: '需求完成', value: completed?.value ?? '0 单', icon: '◈' },
    { label: '交易金额', value: turnover?.value ?? '¥ 0.00', icon: '✦' },
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
      badge: item.paymentMethod?.trim() || '平台担保',
      metaSecondary: '查看详情',
      accent: ['nebula', 'sunset', 'forest', 'frost'][index % 4] ?? 'nebula',
    }))
  }

  return [
    {
      title: '在线教育系统开发',
      summary: '用于课程交付与付费订阅的企业级平台。',
      budget: '¥ 2000-5000',
      status: '建设中',
      badge: '定制',
      metaSecondary: '1 小时前',
      accent: 'nebula',
    },
    {
      title: '游戏角色原画设计',
      summary: '角色立绘与宣传视觉物料一体交付。',
      budget: '¥ 800-1500',
      status: '邀标中',
      badge: '美术',
      metaSecondary: '3 小时前',
      accent: 'sunset',
    },
    {
      title: 'RPG 服务器插件开发',
      summary: 'Minecraft 服务端玩法插件与版本维护。',
      budget: '¥ 1500-3000',
      status: '招募中',
      badge: '插件',
      metaSecondary: '6 小时前',
      accent: 'forest',
    },
    {
      title: '企业官网视觉升级',
      summary: '现代化官网重构，含首页与品牌样式库。',
      budget: '¥ 3000-8000',
      status: '定制开发',
      badge: '官网',
      metaSecondary: '5 小时前',
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
    name: 'workbench-realname',
    query: {
      redirect_to: '/?modal=publish',
    },
  })
  return false
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
    activeResubmitRequirementId.value = null
    publishTitle.value = ''
    publishDescription.value = ''
    publishBudget.value = ''
    publishAcceptance.value = ''
    publishPaymentMode.value = 'self_managed'
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

          <section class="portal-section portal-section--workflow">
            <div class="portal-section__header">
              <div>
                <p class="portal-section__eyebrow">交易流程</p>
              </div>
            </div>
            <div class="portal-workflow-grid" aria-label="需求交易流程">
              <div v-for="(step, index) in workflowSteps" :key="step.step + step.title" class="portal-workflow-item">
                <article class="portal-step-card" :class="`portal-step-card--${step.accent}`">
                  <div class="portal-step-card__copy">
                    <strong><span>{{ step.step }}</span>{{ step.title }}</strong>
                    <div class="portal-step-card__meta">
                      <div class="portal-step-card__icon">{{ step.icon }}</div>
                      <small>{{ step.hint }}</small>
                    </div>
                  </div>
                </article>
                <span v-if="index < workflowSteps.length - 1" class="portal-step-card__arrow"
                  aria-hidden="true">›</span>
              </div>
            </div>
          </section>

          <section class="portal-section">
            <div class="portal-section__header">
              <div>
                <p class="portal-section__eyebrow">精选需求</p>
              </div>
              <button class="portal-link-btn" type="button"
                @click="router.push({ name: 'requirement-hall' })">更多需求</button>
            </div>
            <div class="portal-spotlight-grid">
              <article v-for="card in spotlightCards" :key="card.title" class="portal-spotlight-card"
                :class="`portal-spotlight-card--${card.accent}`" @click="openSpotlight(card)">
                <div class="portal-spotlight-card__cover">
                  <span class="portal-spotlight-card__badge">{{ card.badge }}</span>
                  <div class="portal-spotlight-card__screen portal-spotlight-card__screen--primary"></div>
                  <div class="portal-spotlight-card__screen portal-spotlight-card__screen--secondary"></div>
                  <div class="portal-spotlight-card__screen portal-spotlight-card__screen--tertiary"></div>
                </div>
                <div class="portal-spotlight-card__body">
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.summary }}</p>
                  <div class="portal-spotlight-card__price-row">
                    <strong>{{ card.budget }}</strong>
                    <span class="portal-spotlight-card__status">{{ card.status }}</span>
                  </div>
                  <div class="portal-spotlight-card__footer">
                    <span>{{ card.metaSecondary }}</span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="portal-sidebar">
          <section class="portal-card portal-card--notice">
            <div class="portal-card__header portal-card__header--notice">
              <div class="portal-card__title portal-card__title--notice">
                <span class="portal-notice-head__icon" aria-hidden="true">◔</span>
                <h2>平台公告</h2>
              </div>
              <button class="portal-link-btn portal-link-btn--notice" type="button"
                @click="router.push({ name: 'community' })">
                更多
                <span aria-hidden="true">›</span>
              </button>
            </div>
            <ul class="portal-notice-list">
              <li v-for="notice in portalNotices" :key="`${notice.title}-${notice.date}`" class="portal-notice-item">
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
                <h2>平台数据</h2>
              </div>
              <button class="portal-link-btn" type="button" :disabled="homeRefreshLoading" @click="refreshHomeData">
                {{ homeRefreshLoading ? '刷新中' : '刷新' }}
              </button>
            </div>
            <div class="portal-stats-grid">
              <article v-for="(stat, index) in platformStats" :key="stat.label" class="portal-stat-item"
                :class="`portal-stat-item--tone-${index % 4}`">
                <span class="portal-stat-item__icon">{{ stat.icon }}</span>
                <div class="portal-stat-item__copy">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </div>
              </article>
            </div>
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
      v-model:publishAcceptance="publishAcceptance" v-model:publishPaymentMode="publishPaymentMode"
      :modalTitle="publishModalTitle" :submitText="publishModalSubmitText" :loadingText="publishModalLoadingText"
      :publishLoading="publishLoading" @close="closePublishModal" @submit="submitPublishRequirement" />

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
  </main>
</template>
