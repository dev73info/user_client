<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'

import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { confirmPayment as confirmPaymentApi, getAlipayPageHtml, listPaymentOrders as listPaymentOrdersApi, type ConfirmPaymentResp } from '@/api/payments'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

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
const alipayPageHtml = ref('')
const alipayPageError = ref('')
const alipayPageLoading = ref(false)
const alipayIframeLoading = ref(false)
const alipayIframeRef = ref<HTMLIFrameElement | null>(null)
const alipayExtractedCanvasRef = ref<HTMLCanvasElement | null>(null)
const alipayCanvasError = ref('')
const nowTick = ref(Date.now())
const confirming = ref(false)
const paid = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
const PAYMENT_POLL_INTERVAL_MS = 8_000

const isAlipayPage = computed(() => paymentChannel.value === 'alipay')
const hasOrder = computed(
  () => paymentId.value && (qrContent.value || isAlipayPage.value),
)

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

async function loadAlipayPageHtml(paymentIdValue: string) {
  alipayPageHtml.value = ''
  alipayPageError.value = ''
  alipayPageLoading.value = true
  alipayIframeLoading.value = true
  alipayCanvasError.value = ''

  if (!auth.token) {
    alipayPageError.value = '未登录，无法加载支付宝支付页面'
    alipayPageLoading.value = false
    alipayIframeLoading.value = false
    return
  }

  try {
    alipayPageHtml.value = await getAlipayPageHtml(auth.token, paymentIdValue)
  } catch {
    alipayPageError.value = '支付宝支付页面加载失败，请稍后重试'
  } finally {
    alipayPageLoading.value = false
  }
}

function copyIframeCanvas(retryCount = 8) {
  alipayCanvasError.value = ''

  const iframe = alipayIframeRef.value
  const targetCanvas = alipayExtractedCanvasRef.value
  if (!iframe || !targetCanvas) {
    return
  }

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    const innerCanvas = iframeDoc?.querySelector<HTMLCanvasElement>('canvas')
    if (!innerCanvas) {
      if (retryCount > 0) {
        window.setTimeout(() => copyIframeCanvas(retryCount - 1), 200)
      } else {
        alipayCanvasError.value = '未找到 iframe 内部 canvas 元素'
      }
      return
    }

    const ctx = targetCanvas.getContext('2d')
    if (!ctx) {
      alipayCanvasError.value = '无法获取父页面 canvas 上下文'
      return
    }

    targetCanvas.width = innerCanvas.width
    targetCanvas.height = innerCanvas.height
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
    ctx.drawImage(innerCanvas, 0, 0, targetCanvas.width, targetCanvas.height)
  } catch {
    if (retryCount > 0) {
      window.setTimeout(() => copyIframeCanvas(retryCount - 1), 200)
    } else {
      alipayCanvasError.value = '复制 iframe canvas 失败'
    }
  }
}

function handleIframeLoad() {
  alipayIframeLoading.value = false
  copyIframeCanvas()
}

watch(
  [
    () => paymentId.value,
    () => paymentChannel.value,
    () => auth.token,
  ],
  async ([id, channel]) => {
    if (channel !== 'alipay' || !id) {
      return
    }

    await loadAlipayPageHtml(id)
  },
  {
    immediate: true,
  },
)

function goBack() {
  router.push('/')
}

async function checkOrderPaidByList() {
  const rows = await listPaymentOrdersApi(auth.token)
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
    const channel = paymentChannel.value === 'wechat' ? 'wechat' : 'alipay'
    const result = await confirmPaymentApi(auth.token, channel, paymentId.value)

    if (!result.ok) {
      if (result.status === 409) {
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

    const payload = result.data as ConfirmPaymentResp | undefined

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
  auth.hydrate()

  countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)

  pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') {
      return
    }
    void confirmPayment()
  }, PAYMENT_POLL_INTERVAL_MS)
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
          <p class="eyebrow">73Info Sandbox</p>
          <h2>扫码支付</h2>
          <p class="lead">请使用{{ paymentChannel === 'wechat' ? '微信' : '支付宝' }}扫码完成支付，支付成功后将自动返回首页。</p>
        </div>
        <button class="top-back" @click="goBack">返回首页</button>
      </header>

      <div v-if="hasOrder" class="pay-layout">
        <article class="qr-card">
          <p class="card-title">支付入口</p>

          <!-- 添加外层容器解决裁剪问题 -->
          <div v-if="alipayPageHtml" class="alipay-iframe-wrapper">
            <iframe ref="alipayIframeRef" :srcdoc="alipayPageHtml" class="alipay-frame" frameborder="0"
              sandbox="allow-scripts allow-forms allow-same-origin" scrolling="no" @load="handleIframeLoad"></iframe>
            <div v-if="alipayPageLoading || alipayIframeLoading" class="alipay-loading-overlay">
              <div class="loading-spinner"></div>
              <p>支付宝二维码加载中，请稍候…</p>
            </div>
          </div>

          <div v-else>
            <img v-if="qrDataUrl" :src="qrDataUrl" :alt="`${paymentChannel === 'wechat' ? '微信' : '支付宝'}扫码支付二维码`"
              class="qr-code" />
            <div v-else class="qr-fallback">二维码生成失败，请返回首页重新发起支付。</div>
          </div>
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
  </main>
</template>
