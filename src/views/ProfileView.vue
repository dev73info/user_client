<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppToast from '@/components/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { confirmPayment, createPayment, listAvailableCoupons, type AlipayCreatePaymentResp, type CouponItem, type WechatCreatePaymentResp } from '@/api/payments'
import { listRequirements, type RequirementStatus } from '@/api/requirements'
import { getDepositRatio, updateProfile } from '@/api/settings'

type RequirementItem = {
  requirement_id: string
  title: string
  status: RequirementStatus
  budget?: number | null
  updated_at: string
}

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const coupons = ref<CouponItem[]>([])
const requirementLoading = ref(false)
const myRequirements = ref<RequirementItem[]>([])
const payVisible = ref(false)
const payRequirement = ref<RequirementItem | null>(null)
const payChannel = ref<'alipay' | 'wechat'>('alipay')
const payLoading = ref(false)
const currentPayment = ref<AlipayCreatePaymentResp | null>(null)
const depositRatioPercent = ref(20)
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

const amountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'amount'))
const discountCoupons = computed(() => coupons.value.filter((item) => item.discount_type === 'percent'))

function formatRange(item: CouponItem) {
  if (!item.starts_at && !item.ends_at) {
    return '永久有效'
  }

  const parts: string[] = []
  if (item.starts_at) {
    parts.push(`起始：${item.starts_at.replace('T', ' ')}`)
  }
  if (item.ends_at) {
    parts.push(`截止：${item.ends_at.replace('T', ' ')}`)
  }
  return parts.join('，')
}

function formatDiscount(item: CouponItem) {
  if (item.discount_type === 'amount') {
    return `减免 ¥${item.discount_value.toFixed(2)}`
  }
  return `折扣 ${item.discount_value.toFixed(1)}%${item.max_discount_cny != null ? `，上限 ¥${item.max_discount_cny.toFixed(2)}` : ''}`
}

function formatRequirementStatus(status: RequirementStatus) {
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

function formatBudget(value?: number | null) {
  if (value == null) {
    return '待议价'
  }
  return `¥${value.toFixed(2)}`
}

function canPay(status: RequirementStatus) {
  return status === 'pending_deposit' || status === 'pending_final'
}

function openPayModal(item: RequirementItem) {
  if (!canPay(item.status)) {
    return
  }
  payRequirement.value = item
  payChannel.value = 'alipay'
  currentPayment.value = null
  payVisible.value = true
}

async function updateUsername() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改用户名', 'error')
    return
  }

  const trimmed = newUsername.value.trim()
  if (trimmed.length === 0) {
    showToast('请输入一个新的用户名', 'error')
    return
  }

  usernameLoading.value = true
  try {
    const payload = await updateProfile(auth.token, trimmed)
    auth.setToken(payload.token)
    newUsername.value = ''
    showToast('用户名已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改用户名失败', 'error')
  } finally {
    usernameLoading.value = false
  }
}

function closePayModal() {
  payVisible.value = false
}

function depositAmount(item: RequirementItem) {
  if (typeof item.budget === 'number') {
    return item.budget
  }
  return 1
}

function finalDepositAmount(item: RequirementItem) {
  const base = Number(depositAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }
  const ratio = Number(depositRatioPercent.value)
  const scaled = Number.isFinite(ratio) && ratio > 0 ? (base * ratio) / 100 : base
  const raw = Math.max(0.01, scaled)
  return Number(raw.toFixed(2))
}

function finalPaymentAmount(item: RequirementItem) {
  const base = Number(depositAmount(item))
  if (!Number.isFinite(base) || base < 0.01) {
    return 0.01
  }
  const tail = Math.max(0.01, base - finalDepositAmount(item))
  return Number(tail.toFixed(2))
}

const isFinalPayment = computed(() => payRequirement.value?.status === 'pending_final')
const payStageLabel = computed(() => (isFinalPayment.value ? '尾款' : '定金'))

const newUsername = ref('')
const usernameLoading = ref(false)

const payAmount = computed(() => {
  if (!payRequirement.value) {
    return 0.01
  }
  if (payRequirement.value.status === 'pending_final') {
    return finalPaymentAmount(payRequirement.value)
  }
  return finalDepositAmount(payRequirement.value)
})

async function copyCouponCode(code: string) {
  const value = code.trim()
  if (!value) {
    showToast('券码为空，无法复制', 'error')
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    showToast('券码已复制', 'success')
  } catch {
    showToast('复制失败，请手动复制', 'error')
  }
}

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
    myRequirements.value = rows.slice(0, 20)
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
  const amount = payAmount.value

  payLoading.value = true
  try {
    if (!currentPayment.value) {
      const createPayload = await createPayment(auth.token, channel, {
        requirement_id: requirement.requirement_id,
        amount_cny: amount,
        description: `需求 ${requirement.requirement_id} ${payStageLabel.value}`,
      })

      if (channel === 'alipay') {
        currentPayment.value = createPayload as AlipayCreatePaymentResp
      } else {
        const wechatPayload = createPayload as WechatCreatePaymentResp
        currentPayment.value = {
          payment_id: wechatPayload.payment_id,
          requirement_id: wechatPayload.requirement_id,
          channel: wechatPayload.channel,
          amount_cny: wechatPayload.amount_cny,
          status: wechatPayload.status,
          alipay_order_string: wechatPayload.code_url,
          expires_at: wechatPayload.expires_at,
        }
      }

      showToast(`${payStageLabel.value}支付订单已生成，正在跳转二维码支付页`, 'success')
      router.push({
        name: 'payment',
        query: {
          payment_id: currentPayment.value.payment_id,
          requirement_id: requirement.requirement_id,
          channel,
          amount_cny: currentPayment.value.amount_cny.toString(),
          qr_content: currentPayment.value.alipay_order_string,
          expires_at: currentPayment.value.expires_at,
        },
      })
      return
    }

    const confirmResult = await confirmPayment(auth.token, channel, currentPayment.value.payment_id)

    if (!confirmResult.ok) {
      throw new Error(confirmResult.message || `确认${payStageLabel.value}支付失败`)
    }

    showToast(`${payStageLabel.value}支付确认成功`, 'success')
    payVisible.value = false
    await loadMyRequirements()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '支付失败', 'error')
  } finally {
    payLoading.value = false
  }
}

function goBack() {
  router.push({ name: 'home' })
}

onMounted(async () => {
  auth.hydrate()
  newUsername.value = auth.username
  await Promise.all([loadCoupons(), loadMyRequirements(), loadDepositRatio()])
})
</script>

<template>
  <main class="page-shell">
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>{{ auth.username || '我的券包' }}</h2>
          <p class="lead">在这里查看你的优惠券和折扣券背包。</p>
        </div>
        <button class="ghost" type="button" :disabled="loading" @click="goBack">返回首页</button>
      </header>

      <div class="wallet-overview">
        <div class="wallet-card summary-card">
          <strong>{{ amountCoupons.length }}</strong>
          <span>优惠卷</span>
        </div>
        <div class="wallet-card summary-card">
          <strong>{{ discountCoupons.length }}</strong>
          <span>折扣券</span>
        </div>
      </div>

      <section class="wallet-section">
        <div class="wallet-header">
          <h3>修改用户名</h3>
        </div>
        <div class="profile-update-row">
          <input v-model="newUsername" type="text" placeholder="请输入新的用户名" :disabled="usernameLoading" />
          <button class="ghost small" type="button" :disabled="usernameLoading" @click="updateUsername">
            {{ usernameLoading ? '保存中...' : '保存用户名' }}
          </button>
        </div>
      </section>

      <section class="wallet-section">
        <div class="wallet-header">
          <h3>我提交的需求单</h3>
          <button class="ghost small" type="button" :disabled="requirementLoading" @click="loadMyRequirements">
            {{ requirementLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div v-if="myRequirements.length === 0" class="empty">暂无已提交需求单</div>
        <ul v-else class="requirement-list">
          <li v-for="item in myRequirements" :key="item.requirement_id" class="requirement-row"
            :class="{ clickable: canPay(item.status) }" @click="openPayModal(item)">
            <div class="requirement-main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.requirement_id }}</span>
            </div>
            <span class="requirement-status">{{ formatRequirementStatus(item.status) }}</span>
            <span>{{ formatBudget(item.budget) }}</span>
            <time>{{ formatRequirementTime(item.updated_at) }}</time>
          </li>
        </ul>
      </section>

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
              <button type="button" class="payment-option" :class="{ active: payChannel === 'alipay' }"
                @click="payChannel = 'alipay'">
                <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
                支付宝
              </button>
              <button type="button" class="payment-option" :class="{ active: payChannel === 'wechat' }"
                @click="payChannel = 'wechat'">
                <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信支付" />
                微信支付
              </button>
            </div>
          </div>

          <div class="actions">
            <button class="ghost" type="button" @click="closePayModal">取消</button>
            <button class="ghost" type="button" :disabled="payLoading" @click="submitRequirementPayment">
              {{ payLoading ? '处理中...' : currentPayment ? '查询支付结果' : `支付${payStageLabel}` }}
            </button>
          </div>
        </section>
      </div>

      <section class="wallet-section">
        <div class="wallet-header">
          <h3>优惠卷背包</h3>
          <button class="ghost small" type="button" :disabled="loading" @click="loadCoupons">
            {{ loading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div v-if="amountCoupons.length === 0" class="empty">暂无优惠卷</div>
        <div v-else class="coupon-items">
          <button v-for="item in amountCoupons" :key="item.code" type="button" class="coupon-item"
            @click="copyCouponCode(item.code)">
            <div class="coupon-head">
              <strong>{{ item.code }}</strong>
              <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用' }}</span>
            </div>
            <small>{{ item.name }}</small>
            <p>{{ formatDiscount(item) }}</p>
            <p class="coupon-meta">门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}</p>
          </button>
        </div>
      </section>

      <section class="wallet-section">
        <div class="wallet-header">
          <h3>折扣券背包</h3>
          <button class="ghost small" type="button" :disabled="loading" @click="loadCoupons">
            {{ loading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div v-if="discountCoupons.length === 0" class="empty">暂无折扣券</div>
        <div v-else class="coupon-items">
          <button v-for="item in discountCoupons" :key="item.code" type="button" class="coupon-item"
            @click="copyCouponCode(item.code)">
            <div class="coupon-head">
              <strong>{{ item.code }}</strong>
              <span class="coupon-status" :class="item.status">{{ item.status === 'used' ? '已使用' : '可用' }}</span>
            </div>
            <small>{{ item.name }}</small>
            <p>{{ formatDiscount(item) }}</p>
            <p class="coupon-meta">门槛 ¥{{ item.min_amount_cny.toFixed(2) }} · {{ formatRange(item) }}</p>
          </button>
        </div>
      </section>
    </section>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>
