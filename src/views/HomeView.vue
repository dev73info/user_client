<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import AppToast from '@/components/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { getGithubAuthorizeUrl } from '@/api/auth'
import {
  confirmPayment,
  createAlipayPagePayment,
  createPayment,
  listAvailableCoupons,
  type AlipayCreatePaymentResp,
  type AlipayPageCreatePaymentResp,
  type CouponItem,
  type WechatCreatePaymentResp,
} from '@/api/payments'
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
    value: '4.92 分',
    hint: '好评率 99.1%',
  },
  {
    label: '累计成交额',
    value: '¥ 0.00',
    hint: '已支付订单累计金额',
  },
])
const AUTO_REFRESH_INTERVAL_MS = 60_000

const latestDeals = ref<{ paymentId: string; requirementId: string; amount: string; at: string }[]>([])

const pendingRequirements = ref<PendingRequirementView[]>([])

const auth = useAuthStore()
const authMode = ref<AuthMode>('login')
const authVisible = ref(false)
const authUsername = ref('')
const authPassword = ref('')
const authEmail = ref('')
const authEmailCode = ref('')
const acceptTerms = ref(false)
const sendCodeLoading = ref(false)
const githubLoginLoading = ref(false)
const sendCodeCountdown = ref(0)
let sendCodeTimer: ReturnType<typeof setInterval> | null = null
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
let autoRefreshInFlight = false
const publishVisible = ref(false)
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const depositChannel = ref<'alipay' | 'wechat'>('alipay')
const publishAcceptance = ref('')
const publishLoading = ref(false)
const homeRefreshLoading = ref(false)
const depositVisible = ref(false)
const depositRequirement = ref<PendingRequirementView | null>(null)
const depositPayment = ref<AlipayCreatePaymentResp | null>(null)
const depositLoading = ref(false)
const depositRatioPercent = ref(20)
const availableCoupons = ref<CouponItem[]>([])
const amountCouponCode = ref('')
const discountCouponCode = ref('')
const couponLoading = ref(false)
const router = useRouter()
const route = useRoute()
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()
const userMenuWrapper = ref<HTMLElement | null>(null)
const menuOpen = ref(false)

function toggleUserMenu() {
  menuOpen.value = !menuOpen.value
}

function closeUserMenu() {
  menuOpen.value = false
}

function handleClickOutside(event: MouseEvent) {
  if (!menuOpen.value) {
    return
  }

  const target = event.target as Node | null
  if (userMenuWrapper.value && target && !userMenuWrapper.value.contains(target)) {
    closeUserMenu()
  }
}

function goProfile() {
  closeUserMenu()
  router.push({ name: 'profile' })
}

const authTitle = computed(() => {
  if (authMode.value === 'login') {
    return '登录账号'
  }
  if (authMode.value === 'register') {
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
    authVisible.value = false
    showToast('GitHub 登录成功', 'success')
    void router.replace({ query: {} })
  } else if (oauthError) {
    showToast(`GitHub 登录失败: ${oauthError}`, 'error')
    void router.replace({ query: {} })
  }

  void loadDepositRatio()
  void loadPendingRequirements()
  void loadRequirementOverview()

  autoRefreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') {
      return
    }
    if (homeRefreshLoading.value || publishLoading.value || depositLoading.value || auth.loading) {
      return
    }
    void runBackgroundAutoRefresh()
  }, AUTO_REFRESH_INTERVAL_MS)

  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  if (sendCodeTimer) {
    clearInterval(sendCodeTimer)
    sendCodeTimer = null
  }
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
  window.removeEventListener('click', handleClickOutside)
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
    deposit_paid: '已付定金',
    in_development: '开发中',
    pending_final: '待付尾款',
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

  depositRequirement.value = item
  depositPayment.value = null
  depositChannel.value = 'alipay'
  amountCouponCode.value = ''
  discountCouponCode.value = ''
  depositVisible.value = true
  void loadAvailableCoupons()
}

function canOpenPayment(item: PendingRequirementView) {
  return item.status === 'pending_deposit' || item.status === 'pending_final'
}

function selectCoupon(code: string, type: 'amount' | 'percent') {
  if (type === 'amount') {
    amountCouponCode.value = code
    discountCouponCode.value = ''
    return
  }
  discountCouponCode.value = code
  amountCouponCode.value = ''
}

function closeDepositCard() {
  depositVisible.value = false
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
const currentYear = new Date().getFullYear()

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
    if (!payload) {
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
    availableCoupons.value = await listAvailableCoupons(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载优惠券失败', 'error')
  } finally {
    couponLoading.value = false
  }
}

async function loadPendingRequirements(silent = false) {
  if (!auth.isAuthed) {
    pendingRequirements.value = []
    return
  }

  try {
    const rows = await listRequirements(auth.token)
    pendingRequirements.value = rows
      .filter((item) => item.status !== 'completed' && item.status !== 'rejected')
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
    if (!silent) {
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
        value: '4.92 分',
        hint: '好评率 99.1%',
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
      amount: `¥${item.amount_cny.toFixed(2)}`,
      at: formatTimeLabel(item.paid_at),
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
    depositVisible.value = false
    await loadPendingRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '支付失败', 'error')
  } finally {
    depositLoading.value = false
  }
}

function openAuth(mode: AuthMode) {
  authMode.value = mode
  authUsername.value = ''
  authPassword.value = ''
  authEmail.value = ''
  authEmailCode.value = ''
  acceptTerms.value = false
  sendCodeLoading.value = false
  sendCodeCountdown.value = 0
  if (sendCodeTimer) {
    clearInterval(sendCodeTimer)
    sendCodeTimer = null
  }
  authVisible.value = true
}

function closeAuth() {
  authVisible.value = false
  acceptTerms.value = false
}

function loginWithGithub() {
  if (githubLoginLoading.value) {
    return
  }

  githubLoginLoading.value = true
  const redirectTarget = `${window.location.origin}${window.location.pathname}`
  getGithubAuthorizeUrl(redirectTarget)
    .then(async (resp) => {
      if (!resp.url) {
        throw new Error('GitHub 授权地址为空')
      }

      window.location.href = resp.url
    })
    .catch((err) => {
      showToast(err instanceof Error ? err.message : 'GitHub 登录失败', 'error')
      githubLoginLoading.value = false
    })
}

async function sendAuthCode() {
  const email = authEmail.value.trim()
  if (!email) {
    showToast('请输入邮箱地址', 'error')
    return
  }

  if (sendCodeLoading.value || sendCodeCountdown.value > 0) {
    return
  }

  sendCodeLoading.value = true
  try {
    if (authMode.value === 'register') {
      await auth.sendRegisterEmailCode(email)
    } else {
      await auth.sendResetPasswordEmailCode(email)
    }
    showToast('验证码已发送，请查收邮箱', 'success')
    sendCodeCountdown.value = 60
    if (sendCodeTimer) {
      clearInterval(sendCodeTimer)
    }
    sendCodeTimer = setInterval(() => {
      if (sendCodeCountdown.value <= 1) {
        sendCodeCountdown.value = 0
        if (sendCodeTimer) {
          clearInterval(sendCodeTimer)
          sendCodeTimer = null
        }
        return
      }
      sendCodeCountdown.value -= 1
    }, 1000)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送验证码失败', 'error')
  } finally {
    sendCodeLoading.value = false
  }
}

async function submitAuth() {
  if (authMode.value !== 'reset' && authUsername.value.trim().length < 2) {
    showToast('用户名至少 2 个字符', 'error')
    return
  }

  if (authPassword.value.length < 6) {
    showToast('密码至少 6 位', 'error')
    return
  }

  if (authMode.value === 'register') {
    if (!acceptTerms.value) {
      showToast('请先同意用户协议、隐私政策和支付与退款说明', 'error')
      return
    }
    if (!authEmail.value.trim()) {
      showToast('邮箱不能为空', 'error')
      return
    }
    if (authEmailCode.value.trim().length !== 6) {
      showToast('请输入 6 位邮箱验证码', 'error')
      return
    }
  }

  if (authMode.value === 'reset') {
    if (!authEmail.value.trim()) {
      showToast('邮箱不能为空', 'error')
      return
    }
    if (authEmailCode.value.trim().length !== 6) {
      showToast('请输入 6 位邮箱验证码', 'error')
      return
    }
  }

  try {
    if (authMode.value === 'login') {
      await auth.login(authUsername.value.trim(), authPassword.value)
      showToast('登录成功', 'success')
    } else if (authMode.value === 'register') {
      await auth.registerWithEmail(
        authUsername.value.trim(),
        authPassword.value,
        authEmail.value.trim(),
        authEmailCode.value.trim(),
      )
      showToast('注册成功', 'success')
    } else {
      await auth.resetPasswordWithEmail(
        authEmail.value.trim(),
        authPassword.value,
        authEmailCode.value.trim(),
      )
      showToast('密码已重置，已自动登录', 'success')
    }

    authVisible.value = false
    acceptTerms.value = false
    await loadDepositRatio()
    await loadPendingRequirements()
    await loadRequirementOverview()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '操作失败', 'error')
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

  publishVisible.value = true
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
    showToast('已刷新最新数据', 'success')
  } finally {
    homeRefreshLoading.value = false
  }
}

function closePublishModal() {
  publishVisible.value = false
}

async function submitPublishRequirement() {
  const normalizedTitle = publishTitle.value.trim()
  const normalizedDescription = publishDescription.value.trim()
  const normalizedAcceptance = publishAcceptance.value.trim()

  const budgetRaw = String(publishBudget.value ?? '').trim()
  const budget = budgetRaw ? Number(budgetRaw) : undefined

  if (normalizedTitle.length < 4) {
    showToast('需求标题至少 4 个字符', 'error')
    return
  }

  if (normalizedDescription.length < 10) {
    showToast('需求描述至少 10 个字符', 'error')
    return
  }

  if (budget !== undefined && (Number.isNaN(budget) || budget < 0)) {
    showToast('预算必须是大于等于0的数字', 'error')
    return
  }

  publishLoading.value = true

  try {
    await createRequirement(auth.token, {
      title: normalizedTitle,
      description: normalizedDescription,
      budget,
      acceptance_criteria: normalizedAcceptance || undefined,
    })

    publishTitle.value = ''
    publishDescription.value = ''
    publishBudget.value = ''
    publishAcceptance.value = ''
    publishVisible.value = false
    showToast('需求已发布', 'success')
    await loadPendingRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发布失败', 'error')
  } finally {
    publishLoading.value = false
  }
}
</script>

<template>
  <main class="home">
    <section class="hero">
      <div class="hero-top">
        <div class="brand-mark" aria-label="73Info">
          <span class="brand-dot" aria-hidden="true"></span>
          <span class="brand-text">柒叁信息</span>
          <router-link to="/mc-plugins" class="brand-link">MC插件与模组</router-link>
        </div>
        <div class="auth-actions" aria-label="账号操作">
          <template v-if="!auth.isAuthed">
            <button class="auth-btn ghost" type="button" @click="openAuth('login')">登录</button>
            <button class="auth-btn solid" type="button" @click="openAuth('register')">注册</button>
          </template>
          <template v-else>
            <div class="user-menu-wrapper" ref="userMenuWrapper">
              <button class="auth-btn user-pill" type="button" @click.stop="toggleUserMenu" title="用户菜单">
                {{ auth.username || '已登录用户' }}
              </button>
              <div class="user-menu" :class="{ open: menuOpen }" aria-label="用户菜单">
                <button class="user-menu-item" type="button" @click="goProfile">
                  个人中心
                </button>
                <div class="menu-divider"></div>
                <button class="user-menu-item danger" type="button" @click="logout">
                  退出登录
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
      <h1>接单表现总览</h1>
      <div class="hero-row">
        <p class="desc">
          有项目想法但还没找到合适的人？点右侧“发布需求”，快速描述你的目标，这里会帮你高效完成需求。
        </p>
        <div class="hero-actions">
          <button class="publish-btn" type="button" @click="openPublishModal">发布需求</button>
          <button class="refresh-btn" type="button" :disabled="homeRefreshLoading" @click="refreshHomeData">
            {{ homeRefreshLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
      </div>
    </section>

    <section class="metrics" aria-label="核心指标">
      <article v-for="item in metrics" :key="item.label" class="metric-card">
        <p class="metric-label">{{ item.label }}</p>
        <p class="metric-value">{{ item.value }}</p>
        <p class="metric-hint">{{ item.hint }}</p>
      </article>
    </section>

    <section class="panel" aria-label="待处理需求">
      <header class="panel-header">
        <h2>待处理需求</h2>
        <span>{{ pendingRequirements.length }} 条</span>
      </header>
      <ul v-if="pendingRequirements.length > 0" class="req-list">
        <li v-for="item in pendingRequirements" :key="item.id" class="req-row"
          :class="{ clickable: canOpenPayment(item) }" @click="canOpenPayment(item) && openDepositCard(item)">
          <div class="req-main">
            <strong>{{ item.title }}</strong>
            <span>{{ item.id }}</span>
          </div>
          <button class="status-chip" :class="{ clickable: canOpenPayment(item) }" :disabled="!canOpenPayment(item)"
            @click.stop="openDepositCard(item)">
            {{ item.statusLabel }}
          </button>
          <time>{{ item.updatedAtLabel }}</time>
        </li>
      </ul>
      <p v-else class="empty-placeholder">暂无待处理需求，点击“发布需求”开始创建。</p>
    </section>

    <section class="panel" aria-label="最近成交">
      <header class="panel-header">
        <h2>最近成交</h2>
        <span>近 3 笔</span>
      </header>
      <ul v-if="latestDeals.length > 0" class="deal-list">
        <li v-for="deal in latestDeals" :key="deal.paymentId" class="deal-row">
          <span>{{ deal.requirementId }}</span>
          <strong>{{ deal.amount }}</strong>
          <time>{{ deal.at }}</time>
        </li>
      </ul>
      <p v-else class="empty-placeholder">暂无最近成交记录。</p>
    </section>

    <div v-if="authVisible" class="auth-modal-wrap" @click.self="closeAuth">
      <section class="auth-modal" aria-label="认证弹窗">
        <h3>{{ authTitle }}</h3>
        <template v-if="authMode !== 'reset'">
          <label>
            用户名
            <input v-model="authUsername" type="text" autocomplete="username" placeholder="请输入用户名" />
          </label>
          <template v-if="authMode === 'register'">
            <label>
              邮箱
              <input v-model="authEmail" type="email" autocomplete="email" placeholder="请输入注册邮箱" />
            </label>
          </template>
        </template>
        <template v-else>
          <label>
            邮箱
            <input v-model="authEmail" type="email" autocomplete="email" placeholder="请输入注册邮箱" />
          </label>
        </template>

        <template v-if="authMode === 'login'">
          <label>
            密码
            <input v-model="authPassword" type="password" autocomplete="current-password" placeholder="至少 6 位密码" />
          </label>
          <div class="auth-forgot-row">
            <button class="auth-link" type="button" @click="openAuth('reset')">忘记密码？</button>
          </div>
        </template>

        <template v-if="authMode !== 'login'">
          <label>
            邮箱验证码
            <div class="inline-inputs auth-code-row">
              <input v-model="authEmailCode" type="text" maxlength="6" placeholder="输入 6 位验证码" />
              <button class="auth-btn ghost" type="button" :disabled="sendCodeLoading || sendCodeCountdown > 0"
                @click="sendAuthCode">
                {{ sendCodeLoading ? '发送中...' : sendCodeCountdown > 0 ? `${sendCodeCountdown}s` : '发送验证码' }}
              </button>
            </div>
          </label>

          <label>
            {{ authMode === 'register' ? '密码' : '新码' }}
            <input v-model="authPassword" type="password" autocomplete="new-password" placeholder="至少 6 位新密码" />
          </label>
        </template>
        <template v-if="authMode === 'register'">
          <div class="auth-agreement-row">
            <label class="checkbox-label">
              <input type="checkbox" v-model="acceptTerms" />
              我已阅读并同意
              <router-link to="/terms">《用户协议》</router-link>、
              <router-link to="/privacy">《隐私政策》</router-link>和
              <router-link to="/payment-refund">《支付与退款说明》</router-link>
            </label>
          </div>
        </template>
        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="closeAuth">取消</button>
          <button v-if="authMode === 'login'" class="auth-btn ghost" type="button" :disabled="githubLoginLoading"
            @click="loginWithGithub">
            {{ githubLoginLoading ? '跳转中...' : 'GitHub 快捷登录' }}
          </button>
          <button class="auth-btn solid" type="button"
            :disabled="auth.loading || (authMode === 'register' && !acceptTerms)" @click="submitAuth">
            {{ auth.loading ? '提交中...' : authMode === 'login' ? '登录' : authMode === 'register' ? '注册并登录' : '重置密码' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="publishVisible" class="auth-modal-wrap" @click.self="closePublishModal">
      <section class="auth-modal" aria-label="发布需求弹窗">
        <h3>发布需求</h3>
        <label>
          需求标题
          <input v-model="publishTitle" type="text" maxlength="60" placeholder="例如：企业官网改版、小程序开发" />
        </label>
        <label>
          需求描述
          <textarea v-model="publishDescription" rows="5" maxlength="300"
            placeholder="请描述你的目标、功能和期望交付时间，便于快速匹配。"></textarea>
        </label>
        <label>
          预算
          <input v-model="publishBudget" type="number" min="0" step="0.01" placeholder="如 2000" />
        </label>
        <label>
          验收标准
          <textarea v-model="publishAcceptance" rows="3" maxlength="240" placeholder="可填写交付标准、验收节点等（选填）。"></textarea>
        </label>
        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="closePublishModal">取消</button>
          <button class="auth-btn solid" type="button" :disabled="publishLoading" @click="submitPublishRequirement">
            {{ publishLoading ? '发布中...' : '确认发布' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="depositVisible && depositRequirement" class="auth-modal-wrap" @click.self="closeDepositCard">
      <section class="auth-modal deposit-card" aria-label="定金支付卡片">
        <h3>支付{{ paymentStageLabel }}</h3>
        <p class="deposit-line"><strong>需求标题：</strong>{{ depositRequirement.title }}</p>
        <p class="deposit-line"><strong>需求编号：</strong>{{ depositRequirement.id }}</p>
        <p class="deposit-line">
          <strong>预算：</strong>{{ formatMoney(depositRequirement.budget) }}
        </p>
        <div class="deposit-channel-row">
          <strong>支付方式：</strong>
          <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
            <button type="button" class="payment-option" :class="{ active: depositChannel === 'alipay' }"
              @click="depositChannel = 'alipay'">
              <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
              支付宝
            </button>
            <button type="button" class="payment-option" :class="{ active: depositChannel === 'wechat' }"
              @click="depositChannel = 'wechat'">
              <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信支付" />
              微信支付
            </button>
          </div>
        </div>
        <p v-if="!isFinalPayment" class="deposit-line"><strong>定金占比：</strong>{{ depositRatioPercent.toFixed(2) }}%</p>
        <p v-else class="deposit-line"><strong>尾款金额：</strong>¥{{ couponBaseAmount.toFixed(2) }}</p>

        <p class="coupon-note">请从下方列表选择优惠券，优惠卷和折扣券只能选其一。</p>

        <p v-if="couponSummary" class="coupon-summary">{{ couponSummary }}</p>

        <div class="coupon-list">
          <div class="coupon-list-header">
            <span>可用优惠券</span>
            <button class="auth-btn ghost" type="button" :disabled="couponLoading" @click="loadAvailableCoupons">
              {{ couponLoading ? '刷新中...' : '刷新' }}
            </button>
          </div>
          <div v-if="availableCoupons.length === 0" class="empty">暂无可用优惠券</div>
          <div v-else class="coupon-sections">
            <div class="coupon-section">
              <div class="coupon-section-header">优惠卷</div>
              <div v-if="availableCoupons.filter((item) => item.discount_type === 'amount').length === 0" class="empty">
                暂无可用优惠卷</div>
              <div v-else class="coupon-items">
                <button v-for="item in availableCoupons.filter((item) => item.discount_type === 'amount')"
                  :key="item.code" type="button" class="coupon-item"
                  :class="{ active: item.code === amountCouponCode.trim() }"
                  @click="selectCoupon(item.code, item.discount_type)">
                  <strong>{{ item.name }}</strong>
                </button>
              </div>
            </div>
            <div class="coupon-section">
              <div class="coupon-section-header">折扣券</div>
              <div v-if="availableCoupons.filter((item) => item.discount_type === 'percent').length === 0"
                class="empty">
                暂无可用折扣券</div>
              <div v-else class="coupon-items">
                <button v-for="item in availableCoupons.filter((item) => item.discount_type === 'percent')"
                  :key="item.code" type="button" class="coupon-item"
                  :class="{ active: item.code === discountCouponCode.trim() }"
                  @click="selectCoupon(item.code, item.discount_type)">
                  <strong>{{ item.name }}</strong>
                </button>
              </div>
            </div>
          </div>
        </div>

        <p class="deposit-amount">
          实付款：<strong>¥{{ couponFinalAmount.toFixed(2) }}</strong>
        </p>

        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="closeDepositCard">取消</button>
          <button class="auth-btn solid" type="button" :disabled="depositLoading" @click="submitDepositPayment">
            {{ depositLoading ? '处理中...' : depositPayment ? '查询支付结果' : `支付${paymentStageLabel}` }}
          </button>
        </div>
      </section>
    </div>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />

    <footer class="site-footer" aria-label="网站基础信息">
      <div class="site-footer-grid">
        <div class="site-footer-block">
          <h3>网站信息</h3>
          <p>平台名称：柒叁信息（73Hub）</p>
          <p>主体类型：企业服务平台（备案办理中）</p>
          <p>联系邮箱：support@73Info.cn</p>
          <p>联系地址：上海市浦东新区（示例，待替换）</p>
        </div>
        <div class="site-footer-block">
          <h3>备案与合规</h3>
          <p>ICP备案号：备案申请中</p>
          <p>公安备案号：备案申请中</p>
          <p>增值电信业务许可：按业务开展后补充</p>
        </div>
        <div class="site-footer-block">
          <h3>服务说明</h3>
          <p><router-link to="/terms">用户协议</router-link></p>
          <p><router-link to="/privacy">隐私政策</router-link></p>
          <p><router-link to="/payment-refund">支付与退款说明</router-link></p>
        </div>
      </div>
      <p class="site-footer-copy">© {{ currentYear }} 柒叁信息 73Info. All rights reserved.</p>
    </footer>
  </main>
</template>
