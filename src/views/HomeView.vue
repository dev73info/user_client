<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import AppToast from '@/components/AppToast.vue'
import { useToast } from '@/composables/useToast'

type Metric = {
  label: string
  value: string
  hint: string
}

type RequirementStatus =
  | 'pending_review'
  | 'rejected'
  | 'pending_deposit'
  | 'deposit_paid'
  | 'in_development'
  | 'pending_final'
  | 'completed'

type RequirementItem = {
  id: number
  requirement_id: string
  title: string
  status: RequirementStatus
  budget?: number | null
  payment_method?: string | null
  updated_at: string
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

type CouponItem = {
  code: string
  name: string
  discount_type: 'amount' | 'percent'
  discount_value: number
  min_amount_cny: number
  max_discount_cny?: number | null
  total_quota?: number | null
  used_count: number
  starts_at?: string | null
  ends_at?: string | null
  active: boolean
}

type AlipayCreatePaymentResp = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  alipay_order_string: string
  expires_at: string
}

type WechatCreatePaymentResp = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  wechat_prepay_id?: string | null
  code_url: string
  expires_at: string
}

type DepositRatioResp = {
  deposit_ratio_percent: number
  min_percent: number
  max_percent: number
}

type AuthMode = 'login' | 'register'

const metrics: Metric[] = [
  {
    label: '累计接单',
    value: '128 单',
    hint: '本月新增 16 单',
  },
  {
    label: '综合评价',
    value: '4.92 分',
    hint: '好评率 99.1%',
  },
  {
    label: '累计成交额',
    value: '¥ 86,430',
    hint: '较上月 +12.4%',
  },
]

const latestDeals = [
  { id: 'A240331', amount: '¥1,280', at: '今天 10:40' },
  { id: 'A240329', amount: '¥980', at: '昨天 17:22' },
  { id: 'A240327', amount: '¥2,350', at: '3 月 27 日' },
]

const pendingRequirements = ref<PendingRequirementView[]>([])

const auth = useAuthStore()
const authMode = ref<AuthMode>('login')
const authVisible = ref(false)
const authUsername = ref('')
const authPassword = ref('')
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
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

function goProfile() {
  router.push({ name: 'profile' })
}

const authTitle = computed(() => (authMode.value === 'login' ? '登录账号' : '注册账号'))

onMounted(() => {
  auth.hydrate()
  void loadDepositRatio()
  void loadPendingRequirements()
})

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
    const resp = await fetch('/settings/deposit-ratio', {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    })
    if (!resp.ok) {
      return
    }

    const payload = (await resp.json()) as DepositRatioResp
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
    const resp = await fetch('/payments/coupons/available', {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    })

    if (!resp.ok) {
      throw new Error(await resp.text())
    }

    availableCoupons.value = (await resp.json()) as CouponItem[]
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载优惠券失败', 'error')
  } finally {
    couponLoading.value = false
  }
}

async function loadPendingRequirements() {
  if (!auth.isAuthed) {
    pendingRequirements.value = []
    return
  }

  try {
    const resp = await fetch('/requirements/', {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    })

    if (!resp.ok) {
      throw new Error(await resp.text())
    }

    const rows = (await resp.json()) as RequirementItem[]
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
    showToast(err instanceof Error ? err.message : '加载需求失败', 'error')
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
      const createResp = await fetch(channel === 'alipay' ? '/payments/alipay/create' : '/payments/wechat/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          requirement_id: depositRequirement.value.id,
          amount_cny: couponBaseAmount.value,
          coupon_code: (amountCouponCode.value.trim() || discountCouponCode.value.trim()) || undefined,
          description: `需求 ${depositRequirement.value.id} ${currentStage}`,
        }),
      })

      if (!createResp.ok) {
        throw new Error((await createResp.text()) || `创建${channel === 'alipay' ? '支付宝' : '微信'}${currentStage}支付订单失败`)
      }

      if (channel === 'alipay') {
        const alipayPayload = (await createResp.json()) as AlipayCreatePaymentResp
        depositPayment.value = alipayPayload
      } else {
        const wechatPayload = (await createResp.json()) as WechatCreatePaymentResp
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
      showToast(`${currentStage}支付订单已生成，正在跳转二维码支付页`, 'success')
      router.push({
        name: 'payment',
        query: {
          payment_id: depositPayment.value.payment_id,
          requirement_id: depositRequirement.value.id,
          channel,
          amount_cny: depositPayment.value.amount_cny.toString(),
          qr_content: depositPayment.value.alipay_order_string,
          expires_at: depositPayment.value.expires_at,
          coupon_code: (amountCouponCode.value.trim() || discountCouponCode.value.trim()) || undefined,
        },
      })
      return
    }

    const confirmResp = await fetch(channel === 'alipay' ? '/payments/alipay/confirm' : '/payments/wechat/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        payment_id: depositPayment.value.payment_id,
      }),
    })

    if (!confirmResp.ok) {
      throw new Error((await confirmResp.text()) || `确认${currentStage}支付失败`)
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
  authVisible.value = true
}

function closeAuth() {
  authVisible.value = false
}

async function submitAuth() {
  if (authUsername.value.trim().length < 2) {
    showToast('用户名至少 2 个字符', 'error')
    return
  }

  if (authPassword.value.length < 6) {
    showToast('密码至少 6 位', 'error')
    return
  }

  try {
    if (authMode.value === 'login') {
      await auth.login(authUsername.value.trim(), authPassword.value)
      showToast('登录成功', 'success')
    } else {
      await auth.register(authUsername.value.trim(), authPassword.value)
      showToast('注册成功', 'success')
    }

    authVisible.value = false
    await loadDepositRatio()
    await loadPendingRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '操作失败', 'error')
  }
}

function logout() {
  auth.logout()
  pendingRequirements.value = []
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
      await Promise.all([loadDepositRatio(), loadPendingRequirements()])
    } else {
      await loadPendingRequirements()
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
    const resp = await fetch('/requirements/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        title: normalizedTitle,
        description: normalizedDescription,
        budget,
        acceptance_criteria: normalizedAcceptance || undefined,
      }),
    })

    if (!resp.ok) {
      throw new Error(await resp.text())
    }

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
        <div class="brand-mark" aria-label="73Hub">
          <span class="brand-dot" aria-hidden="true"></span>
          <span class="brand-text">柒叁信息</span>
        </div>
        <div class="auth-actions" aria-label="账号操作">
          <template v-if="!auth.isAuthed">
            <button class="auth-btn ghost" type="button" @click="openAuth('login')">登录</button>
            <button class="auth-btn solid" type="button" @click="openAuth('register')">注册</button>
          </template>
          <template v-else>
            <button class="auth-btn user-pill" type="button" @click="goProfile" title="进入个人中心">{{ auth.username ||
              '已登录用户' }}</button>
            <button class="auth-btn ghost" type="button" @click="logout">退出</button>
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
        <li v-for="item in pendingRequirements" :key="item.id" class="req-row">
          <div class="req-main">
            <strong>{{ item.title }}</strong>
            <span>{{ item.id }}</span>
          </div>
          <button class="status-chip"
            :class="{ clickable: item.status === 'pending_deposit' || item.status === 'pending_final' }"
            :disabled="item.status !== 'pending_deposit' && item.status !== 'pending_final'"
            @click="openDepositCard(item)">
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
      <ul class="deal-list">
        <li v-for="deal in latestDeals" :key="deal.id" class="deal-row">
          <span>{{ deal.id }}</span>
          <strong>{{ deal.amount }}</strong>
          <time>{{ deal.at }}</time>
        </li>
      </ul>
    </section>

    <div v-if="authVisible" class="auth-modal-wrap" @click.self="closeAuth">
      <section class="auth-modal" aria-label="认证弹窗">
        <h3>{{ authTitle }}</h3>
        <label>
          用户名
          <input v-model="authUsername" type="text" autocomplete="username" placeholder="请输入用户名" />
        </label>
        <label>
          密码
          <input v-model="authPassword" type="password" autocomplete="current-password" placeholder="至少 6 位密码" />
        </label>
        <div class="auth-modal-actions">
          <button class="auth-btn ghost" type="button" @click="closeAuth">取消</button>
          <button class="auth-btn solid" type="button" :disabled="auth.loading" @click="submitAuth">
            {{ auth.loading ? '提交中...' : authMode === 'login' ? '登录' : '注册并登录' }}
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
          <p>联系邮箱：support@73hub.cn</p>
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
          <p><a href="#" aria-disabled="true">用户协议（待发布）</a></p>
          <p><a href="#" aria-disabled="true">隐私政策（待发布）</a></p>
          <p><a href="#" aria-disabled="true">支付与退款说明（待发布）</a></p>
        </div>
      </div>
      <p class="site-footer-copy">© {{ currentYear }} 柒叁信息 73Hub. All rights reserved.</p>
    </footer>
  </main>
</template>

<style scoped>
.home {
  max-width: 1024px;
  margin: 0 auto;
  padding: 48px 20px 56px;
}

.hero {
  margin-bottom: 28px;
  animation: reveal 520ms ease-out;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 2px;
}

.brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #95d5b2;
  box-shadow: 0 0 12px rgba(149, 213, 178, 0.85);
}

.brand-text {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: rgba(243, 252, 255, 0.9);
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.auth-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-pill {
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  color: #ddffef;
  background: rgba(149, 213, 178, 0.2);
  border: 1px solid rgba(149, 213, 178, 0.4);
}

.auth-btn {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.auth-btn:hover {
  transform: translateY(-1px);
}

.auth-btn.ghost {
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
}

.auth-btn.ghost:hover {
  box-shadow: 0 8px 18px rgba(180, 230, 255, 0.18);
}

.auth-btn.solid {
  border: 0;
  color: #052238;
  background: #95d5b2;
}

.auth-btn.solid:hover {
  box-shadow: 0 8px 18px rgba(149, 213, 178, 0.34);
}

h1 {
  margin: 14px 0 8px;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1.1;
}

.desc {
  margin: 0;
  max-width: 680px;
  color: var(--text-sub);
}

.hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hero-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  backdrop-filter: blur(7px);
  animation: reveal 520ms ease-out;
}

.metric-label {
  margin: 0;
  font-size: 14px;
  color: var(--text-sub);
}

.metric-value {
  margin: 10px 0 8px;
  font-size: clamp(24px, 3.5vw, 36px);
  font-weight: 700;
}

.metric-hint {
  margin: 0;
  color: var(--success);
  font-size: 14px;
}

.publish-btn {
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  color: #052238;
  background: #ffd166;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}

.publish-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(255, 209, 102, 0.32);
}

.refresh-btn {
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}

.refresh-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(180, 230, 255, 0.2);
}

.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.panel {
  margin-top: 18px;
  border-radius: 18px;
  border: 1px solid var(--card-border);
  background: rgba(6, 32, 50, 0.42);
  padding: 18px;
  animation: reveal 640ms ease-out;
}

.panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.panel-header span {
  color: var(--text-sub);
  font-size: 14px;
}

.deal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.req-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.req-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-sub);
}

.req-main {
  display: grid;
  gap: 2px;
}

.req-main strong {
  color: var(--text-main);
  font-size: 15px;
}

.req-main span {
  font-size: 12px;
}

.status-chip {
  border: 0;
  padding: 4px 10px;
  border-radius: 999px;
  color: #ffe18b;
  font-size: 13px;
  background: rgba(255, 225, 139, 0.18);
  cursor: default;
}

.status-chip.clickable {
  cursor: pointer;
  background: rgba(255, 225, 139, 0.28);
}

.status-chip:disabled {
  opacity: 0.9;
}

.deal-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-sub);
}

.deal-row strong {
  color: var(--text-main);
}

.auth-modal-wrap {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0, 8, 15, 0.5);
}

.auth-modal {
  width: min(460px, 100%);
  border-radius: 16px;
  border: 1px solid var(--card-border);
  background: rgba(5, 24, 38, 0.92);
  backdrop-filter: blur(8px);
  padding: 18px;
}

.auth-modal h3 {
  margin: 0 0 14px;
}

.deposit-card {
  width: min(520px, 100%);
}

.deposit-line {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--text-sub);
}

.order-string {
  word-break: break-all;
  font-size: 12px;
}

.deposit-amount {
  margin: 14px 0 0;
  font-size: 16px;
}

.deposit-amount strong {
  color: #ffd166;
  font-size: 28px;
}

.auth-modal label {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-sub);
}

.auth-modal input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
  padding: 10px 12px;
  outline: none;
}

.auth-modal input[type='number']::-webkit-outer-spin-button,
.auth-modal input[type='number']::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

.auth-modal input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.auth-modal textarea {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
  padding: 10px 12px;
  outline: none;
  resize: vertical;
  font: inherit;
}

.auth-modal input:focus {
  border-color: rgba(149, 213, 178, 0.72);
  box-shadow: 0 0 0 3px rgba(149, 213, 178, 0.16);
}

.auth-modal textarea:focus {
  border-color: rgba(149, 213, 178, 0.72);
  box-shadow: 0 0 0 3px rgba(149, 213, 178, 0.16);
}

.coupon-field {
  margin-top: 10px;
}

.coupon-summary {
  margin: 4px 0 10px;
  color: #a5d8ff;
  font-size: 13px;
}

.coupon-note {
  margin: 0 0 10px;
  color: var(--text-sub);
  font-size: 12px;
}

.coupon-list {
  margin-bottom: 12px;
}

.coupon-sections {
  display: grid;
  gap: 16px;
}

.coupon-section {
  display: grid;
  gap: 10px;
}

.coupon-section-header {
  color: var(--text-sub);
  font-size: 13px;
  font-weight: 600;
}

.coupon-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: var(--text-sub);
  font-size: 13px;
}

.coupon-items {
  display: grid;
  gap: 8px;
}

.coupon-item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  text-align: left;
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.coupon-item.active,
.coupon-item:hover {
  border-color: rgba(149, 213, 178, 0.45);
  background: rgba(149, 213, 178, 0.12);
}

.coupon-item strong {
  font-size: 13px;
}

.coupon-item small {
  color: var(--text-sub);
  font-size: 12px;
}

.payment-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 0 0 1px rgba(8, 27, 42, 0.35);
}

.payment-option {
  border: 1px solid transparent;
  border-radius: 8px;
  background: rgba(7, 30, 46, 0.45);
  color: var(--text-main);
  padding: 10px 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    transform 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease;
}

.payment-option:hover {
  border-color: rgba(149, 213, 178, 0.45);
  background: rgba(9, 40, 62, 0.66);
}

.payment-option.active {
  background: linear-gradient(150deg, rgba(149, 213, 178, 0.34), rgba(94, 180, 201, 0.32));
  border-color: rgba(149, 213, 178, 0.7);
  color: #f1fff8;
  box-shadow: 0 6px 14px rgba(94, 180, 201, 0.2);
}

.payment-row {
  margin-bottom: 12px;
}

.payment-option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(149, 213, 178, 0.25);
}

.inline-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}


.payment-option-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: cover;
  display: block;
}

.auth-modal-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.empty-placeholder {
  margin: 0;
  color: var(--text-sub);
  font-size: 14px;
}

.site-footer {
  margin-top: 22px;
  border-radius: 16px;
  border: 1px solid var(--card-border);
  background: rgba(4, 20, 32, 0.48);
  padding: 16px;
}

.site-footer-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.site-footer-block h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-main);
}

.site-footer-block p {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-sub);
}

.site-footer-block a {
  color: #a5d8ff;
  text-decoration: none;
}

.site-footer-block a:hover {
  text-decoration: underline;
}

.site-footer-copy {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.14);
  font-size: 12px;
  color: rgba(224, 243, 255, 0.72);
}

@keyframes reveal {
  from {
    transform: translateY(12px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (max-width: 780px) {
  .home {
    padding-top: 30px;
  }

  .hero-top {
    align-items: flex-start;
    flex-direction: column;
  }

  .metrics {
    grid-template-columns: 1fr;
  }

  .hero-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .deal-row {
    grid-template-columns: 1fr auto;
  }

  .inline-inputs {
    grid-template-columns: 1fr;
  }

  .payment-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .site-footer-grid {
    grid-template-columns: 1fr;
  }

  .req-row {
    grid-template-columns: 1fr auto;
  }

  .req-row time {
    grid-column: 1 / -1;
  }

  .deal-row time {
    grid-column: 1 / -1;
  }
}
</style>
