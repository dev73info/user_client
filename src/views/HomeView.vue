<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import AppToast from '@/components/AppToast.vue'
import AuthModal from '@/components/AuthModal.vue'
import PublishModal from '@/components/PublishModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import HomeHeroSection from '@/components/home/HomeHeroSection.vue'
import HomeSummarySection from '@/components/home/HomeSummarySection.vue'
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
import {
  createRequirement,
  getRequirementOverview,
  listRequirements,
  type RequirementStatus,
} from '@/api/requirements'
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
  budget?: number | null
  paymentMethod?: string | null
}

type AuthMode = 'login' | 'register' | 'reset'

const metrics = ref<Metric[]>([
  {
    label: '累计完成',
    value: '0 单',
    hint: '已完成需求数',
  },
  {
    label: '综合评价',
    value: '5.00 分',
    hint: '好评率 99.1%',
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
const heroNavLinks = computed(() => {
  const links: Array<{ label: string; to?: { name: string }; href?: string }> = [
    { label: '开发者端', href: buildDevPortalUrl(auth.token) },
    { label: '免费资源导航', to: { name: 'free-resources' } },
  ]

  if (auth.isAuthed) {
    links.push({ label: '我的定制资源', to: { name: 'my-custom-resources' } })
  }

  return links
})
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
const couponLoading = ref(false)
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()
const menuOpen = ref(false)

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

const authTitle = computed(() => {
  if (routeAuthMode.value === 'login') {
    return '登录账号'
  }
  if (routeAuthMode.value === 'register') {
    return '注册账号'
  }
  return '找回密码'
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
  if (item.status !== 'pending_deposit' && item.status !== 'pending_final') {
    return
  }

  depositPayment.value = null
  depositChannel.value = 'alipay'
  amountCouponCode.value = ''
  discountCouponCode.value = ''
  router.push({ name: 'home', query: { modal: 'deposit', requirement_id: item.id } })
  void loadAvailableCoupons()
}

function canOpenPayment(item: PendingRequirementView) {
  return item.status === 'pending_deposit' || item.status === 'pending_final'
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

const selectedCoupon = computed(() => {
  const code = amountCouponCode.value.trim() || discountCouponCode.value.trim()
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
  if (!amountCouponCode.value.trim() && !discountCouponCode.value.trim()) {
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
      .filter((item) => item.status !== 'final_paid' && item.status !== 'completed' && item.status !== 'rejected')
      .slice(0, 8)
      .map((item) => ({
        id: item.requirement_id,
        title: item.title,
        status: item.status,
        statusLabel: statusToLabel(item.status),
        updatedAtLabel: formatTimeLabel(item.updated_at),
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
  if (!auth.isAuthed) {
    metrics.value = [
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
    ]
    latestDeals.value = []
    return
  }

  try {
    const payload = await getRequirementOverview(auth.token)
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
          coupon_code: (amountCouponCode.value.trim() || discountCouponCode.value.trim()) || undefined,
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
          coupon_code: (amountCouponCode.value.trim() || discountCouponCode.value.trim()) || undefined,
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
          coupon_code: (amountCouponCode.value.trim() || discountCouponCode.value.trim()) || undefined,
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
    showToast(err instanceof Error ? err.message : '支付失败', 'error')
  } finally {
    depositLoading.value = false
  }
}

function openAuth(mode: AuthMode) {
  resetAuthForm()
  router.push({ name: 'home', query: { modal: 'auth', mode } })
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
    void router.replace({ name: 'home' })
    acceptTerms.value = false
    await Promise.all([loadDepositRatio(), loadPendingRequirements(), loadRequirementOverview()])
  }
}

function logout() {
  auth.logout()
  pendingRequirements.value = []
  void loadRequirementOverview()
  showToast('已退出登录', 'info')
}

function openPublishModal() {
  if (!auth.isAuthed) {
    showToast('发布需求前请先登录', 'info')
    openAuth('login')
    return
  }

  router.push({ name: 'home', query: { modal: 'publish' } })
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
  router.replace({ name: 'home' })
}

async function submitPublishRequirement() {
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
    await createRequirement(auth.token, {
      title: normalizedTitle,
      description: normalizedDescription,
      budget,
      acceptance_criteria: normalizedAcceptance,
    })

    if (!isMounted) {
      return
    }

    publishTitle.value = ''
    publishDescription.value = ''
    publishBudget.value = ''
    publishAcceptance.value = ''
    showToast('需求已发布', 'success')
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
  <main class="page-shell">
    <HomeHeroSection :isAuthed="auth.isAuthed" :username="auth.username" :menuOpen="menuOpen" :navLinks="heroNavLinks"
      @open-auth="openAuth" @toggle-user-menu="toggleUserMenu" @go-profile="goProfile" @logout="logout">
      <div class="hero-meta">
        <div class="hero">
          <h1>免费资源先逛，定制需求再落地</h1>
          <p class="desc">从公开资源导航快速发现内容，到发布需求、支付协作与交付跟进，整条流程在一个平台完成。</p>
        </div>
        <div class="hero-actions">
          <button class="publish-btn" type="button" @click="openPublishModal">发布需求</button>
          <button class="refresh-btn" type="button" :disabled="homeRefreshLoading" @click="refreshHomeData">
            {{ homeRefreshLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
      </div>
    </HomeHeroSection>

    <HomeSummarySection :metrics="metrics" :pendingRequirements="pendingRequirements" :latestDeals="latestDeals"
      :homeRefreshLoading="homeRefreshLoading" :canOpenPayment="(item: any) => canOpenPayment(item)"
      @open-deposit="(item: any) => openDepositCard(item)" @publish="openPublishModal" @refresh="refreshHomeData"
      @view-deal="openDealDetail" />
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
      v-model:publishAcceptance="publishAcceptance" :publishLoading="publishLoading" @close="closePublishModal"
      @submit="submitPublishRequirement" />

    <DepositModal v-if="depositVisible && depositRequirement" :visible="depositVisible"
      :depositRequirement="depositRequirement" :formattedBudget="formatMoney(depositRequirement.budget)"
      :paymentStageLabel="paymentStageLabel" :depositChannel="depositChannel" :amountCouponCode="amountCouponCode"
      :discountCouponCode="discountCouponCode" :isFinalPayment="isFinalPayment"
      :depositRatioPercent="depositRatioPercent" :couponSummary="couponSummary" :availableCoupons="availableCoupons"
      :couponLoading="couponLoading" :depositLoading="depositLoading" :depositPayment="depositPayment"
      :couponFinalAmount="couponFinalAmount" @close="closeDepositCard" @submit="submitDepositPayment"
      @update:depositChannel="depositChannel = $event" @selectCoupon="selectCoupon"
      @loadAvailableCoupons="loadAvailableCoupons" />

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />

  </main>
</template>
