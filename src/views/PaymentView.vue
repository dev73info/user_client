<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'

import AppToast from '@/components/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

const paymentId = computed(() => String(route.query.payment_id ?? ''))
const requirementId = computed(() => String(route.query.requirement_id ?? ''))
const amountCny = computed(() => String(route.query.amount_cny ?? ''))
const couponCode = computed(() => String(route.query.coupon_code ?? ''))
const paymentChannel = computed(() => String(route.query.channel ?? 'alipay'))
const qrContent = computed(
  () => String(route.query.qr_content ?? route.query.alipay_order_string ?? ''),
)
const expiresAt = computed(() => String(route.query.expires_at ?? ''))
const qrDataUrl = ref('')
const nowTick = ref(Date.now())
const confirming = ref(false)
const paid = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

type PaymentOrderItem = {
  payment_id: string
  status: string
}

type ConfirmPaymentResp = {
  status: string
}

const hasOrder = computed(() => paymentId.value && qrContent.value)

const expiresAtMs = computed(() => {
  const raw = expiresAt.value.trim()
  if (!raw) {
    return NaN
  }

  const parsed = new Date(raw.replace(' ', 'T')).getTime()
  if (Number.isNaN(parsed)) {
    return NaN
  }
  return parsed
})

const countdownMs = computed(() => {
  if (!Number.isFinite(expiresAtMs.value)) {
    return NaN
  }
  return Math.max(0, expiresAtMs.value - nowTick.value)
})

const isExpired = computed(() => Number.isFinite(countdownMs.value) && countdownMs.value <= 0)

const countdownText = computed(() => {
  if (!Number.isFinite(countdownMs.value)) {
    return '时间格式无效'
  }

  if (countdownMs.value <= 0) {
    return '已过期'
  }

  const totalSeconds = Math.floor(countdownMs.value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
})

watchEffect(async () => {
  qrDataUrl.value = ''
  if (!qrContent.value) {
    return
  }

  try {
    qrDataUrl.value = await QRCode.toDataURL(qrContent.value, {
      width: 280,
      margin: 2,
    })
  } catch {
    qrDataUrl.value = ''
  }
})

function goBack() {
  router.push('/')
}

async function checkOrderPaidByList() {
  const resp = await fetch('/payments/orders', {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  })

  if (!resp.ok) {
    return false
  }

  const rows = (await resp.json()) as PaymentOrderItem[]
  const current = rows.find((item) => item.payment_id === paymentId.value)
  return current?.status === 'paid'
}

async function confirmPayment() {
  if (!paymentId.value || confirming.value || paid.value) {
    return
  }

  auth.hydrate()
  if (!auth.isAuthed) {
    showToast('请先登录后再查询支付结果', 'error')
    return
  }

  confirming.value = true
  try {
    const confirmApi = paymentChannel.value === 'wechat' ? '/payments/wechat/confirm' : '/payments/alipay/confirm'
    const resp = await fetch(confirmApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        payment_id: paymentId.value,
      }),
    })

    if (!resp.ok) {
      if (resp.status === 409) {
        const isPaid = await checkOrderPaidByList()
        if (isPaid) {
          paid.value = true
          if (pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
          }
          showToast('支付成功，正在返回首页', 'success')
          window.setTimeout(() => {
            router.push('/')
          }, 900)
          return
        }
      }
      return
    }

    let payload: ConfirmPaymentResp | null = null
    try {
      payload = (await resp.json()) as ConfirmPaymentResp
    } catch {
      payload = null
    }

    if (payload?.status !== 'paid') {
      return
    }

    paid.value = true
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    showToast('支付成功，正在返回首页', 'success')
    window.setTimeout(() => {
      router.push('/')
    }, 900)
  } finally {
    confirming.value = false
  }
}

onMounted(() => {
  countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)

  pollTimer = setInterval(() => {
    void confirmPayment()
  }, 3000)
})

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <main class="page-shell">
    <section class="panel">
      <header class="panel-head">
        <div>
          <p class="eyebrow">73Hub Sandbox</p>
          <h2>扫码支付</h2>
          <p class="lead">请使用{{ paymentChannel === 'wechat' ? '微信' : '支付宝' }}扫码完成支付，支付成功后将自动返回首页。</p>
        </div>
        <button class="top-back" @click="goBack">返回首页</button>
      </header>

      <div v-if="hasOrder" class="pay-layout">
        <article class="qr-card">
          <p class="card-title">支付二维码</p>
          <img v-if="qrDataUrl" :src="qrDataUrl" :alt="`${paymentChannel === 'wechat' ? '微信' : '支付宝'}扫码支付二维码`" class="qr-code" />
          <div v-else class="qr-fallback">二维码生成失败，请返回首页重新发起支付。</div>
        </article>

        <article class="meta-card">
          <p class="card-title">支付信息</p>
          <div class="meta-list">
            <p>
              <span>需求号</span><strong>{{ requirementId }}</strong>
            </p>
            <p>
              <span>订单号</span><strong>{{ paymentId }}</strong>
            </p>
            <p>
              <span>支付金额</span><strong>¥{{ amountCny }}</strong>
            </p>
            <p v-if="couponCode">
              <span>优惠券</span><strong>{{ couponCode }}</strong>
            </p>
            <p>
              <span>剩余支付时间</span><strong :class="{ expired: isExpired }">{{ countdownText }}</strong>
            </p>
          </div>
          <p class="tip">支付截止：{{ expiresAt }}（超时后需重新发起支付）</p>
        </article>
      </div>

      <div v-else class="empty">无有效支付订单信息。</div>
    </section>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>

<style scoped>
.page-shell {
  width: min(900px, calc(100% - 32px));
  margin: 28px auto;
  display: grid;
  gap: 14px;
}

.top-back {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 10px 15px;
  cursor: pointer;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
  flex-shrink: 0;
}

.top-back:hover {
  border-color: rgba(149, 213, 178, 0.6);
  background: rgba(149, 213, 178, 0.12);
}

.panel {
  padding: 24px;
  background: rgba(6, 32, 50, 0.42);
  border: 1px solid var(--card-border);
  border-radius: 18px;
  box-shadow: 0 12px 32px rgba(6, 26, 40, 0.28);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-sub);
}

h2 {
  margin: 6px 0 8px;
  font-size: 28px;
}

.lead {
  margin: 0;
  color: var(--text-sub);
  font-size: 14px;
}

.pay-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 14px;
  align-items: stretch;
}

.qr-card,
.meta-card {
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  padding: 14px;
}

.qr-card {
  display: grid;
  gap: 10px;
  justify-items: center;
}

.qr-code {
  width: 280px;
  height: 280px;
  border-radius: 16px;
  background: #fff;
  padding: 16px;
}

.card-title {
  margin: 0;
  width: 100%;
  font-size: 13px;
  color: var(--text-sub);
}

.meta-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.meta-list p {
  margin: 0;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.12);
  padding-bottom: 8px;
}

.meta-list span {
  color: var(--text-sub);
  font-size: 13px;
}

.meta-list strong {
  color: var(--text-main);
  font-size: 13px;
  text-align: right;
  word-break: break-all;
}

.meta-list strong.expired {
  color: #ffd38a;
}

.tip {
  margin: 12px 0 0;
  color: var(--text-sub);
  font-size: 13px;
}

.qr-fallback {
  margin: 0;
  color: var(--text-sub);
  font-size: 13px;
  text-align: center;
}

.empty {
  margin: 0;
  color: var(--text-sub);
}

@media (max-width: 900px) {
  .pay-layout {
    grid-template-columns: 1fr;
  }

  .qr-card {
    justify-items: start;
  }

  .qr-code {
    width: min(280px, 100%);
    height: auto;
  }
}
</style>
