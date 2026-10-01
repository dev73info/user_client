<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { CircleCheck, Clock } from 'ui_73info'

import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { isWechatPaymentHandoff, parseWechatPayInfo, type WechatJsapiPaymentInfo } from '@/utils/wechatPayment'
import {
  createAdapayDeveloperDepositPayment,
  createAdapayPayment,
  getAdapayClientPlatform,
  getAdapayDeveloperDepositPayment,
  getAdapayPayment,
  type AdapayClientPlatform,
  type AdapayDeveloperDepositPaymentResponse,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import { confirmPayment as confirmPaymentApi, getAlipayPageHtml, listPaymentOrders as listPaymentOrdersApi, type ConfirmPaymentResp } from '@/api/payments'
import {
  getWechatPaymentAuthorizationStatus,
  getWechatPaymentAuthorizeUrl,
  isWechatPaymentAuthorizationRequired,
} from '@/api/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const paymentId = computed(() => String(route.query.payment_id ?? ''))
const requirementId = computed(() => String(route.query.requirement_id ?? ''))
const milestone = computed(() => String(route.query.milestone ?? ''))
const amountCny = computed(() => String(route.query.amount_cny ?? ''))
const couponCode = computed(() => String(route.query.coupon_code ?? ''))
const isAdapayPayment = computed(() => route.query.adapay === '1')
const isDeveloperDepositPayment = computed(() => route.query.developer_deposit === '1')
const isDeveloperDepositIntentMode = computed(
  () =>
    isDeveloperDepositPayment.value &&
    !paymentId.value &&
    queryPaymentChannel.value === 'wechat' &&
    Number.isFinite(Number(amountCny.value)) &&
    Number(amountCny.value) > 0,
)
// 意图模式：adapay 微信支付尚未创建订单，携带 requirement_id + milestone；由支付页在微信内自动静默授权后下单。
const isIntentMode = computed(
  () =>
    isAdapayPayment.value &&
    (isDeveloperDepositIntentMode.value ||
      (!paymentId.value &&
        Boolean(requirementId.value && milestone.value) &&
        paymentChannel.value === 'wechat')),
)
const adapayPayment = ref<AdapayPaymentResponse | null>(null)
const developerDepositPayment = ref<AdapayDeveloperDepositPaymentResponse | null>(null)
const queryPaymentChannel = computed(() => {
  const value = String(route.query.channel ?? 'alipay').trim().toLowerCase()
  return normalizePaymentChannel(value) || 'alipay'
})
const paymentChannel = computed(
  () => normalizePaymentChannel(adapayPayment.value?.payChannel ?? developerDepositPayment.value?.payChannel ?? '') || queryPaymentChannel.value,
)
const clientPlatform = computed<AdapayClientPlatform>(() => {
  const value = String(route.query.client_platform ?? '').trim()
  if (value === 'mobile' || value === 'pc') {
    return value
  }
  return getAdapayClientPlatform()
})
const rawPaymentContent = computed(() =>
  adapayPayment.value?.payUrl?.trim() ||
  developerDepositPayment.value?.payUrl?.trim() ||
  String(route.query.qr_content ?? route.query.alipay_order_string ?? ''),
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
const wechatSubmitted = ref(false)
const confirmationError = ref('')
const paymentResultVisible = computed(() => paid.value || wechatSubmitted.value)
const wechatPayLoading = ref(false)
const wechatPayError = ref('')
const wechatAuthChecked = ref(false)
const wechatAutoAuthRedirecting = ref(false)
const wechatAutoInvoked = ref(false)
const creatingIntentOrder = ref(false)
const intentOrderAttempted = ref(false)
// PC 端未绑定微信（缺少 open_id）时：展示服务号静默授权（snsapi_base）二维码，
// 手机微信扫码后无授权确认页、无感知完成绑定，PC 轮询授权状态后自动继续下单。
const silentAuthQrDataUrl = ref('')
const silentAuthWaiting = ref(false)
let silentAuthTimer: ReturnType<typeof setInterval> | null = null
let silentAuthExpireTimer: ReturnType<typeof setTimeout> | null = null
// 后端授权 state 有效期 10 分钟，超时后二维码失效，需要重新发起。
const SILENT_AUTH_QR_TTL_MS = 10 * 60 * 1000
const isPaymentHandoff = computed(() => isWechatPaymentHandoff(route.query))
let pollTimer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
let wechatBridgeListener: (() => void) | null = null
const PAYMENT_POLL_INTERVAL_MS = 8_000

const isAlipayPage = computed(() => paymentChannel.value === 'alipay' && !isAdapayPayment.value)
const isWechatPayment = computed(() => isAdapayPayment.value && paymentChannel.value === 'wechat')
const isWechatMobilePayment = computed(
  () => isWechatPayment.value && clientPlatform.value === 'mobile',
)
const isWechatPcPayment = computed(() => isWechatPayment.value && clientPlatform.value === 'pc')
const isAlipayMobilePayment = computed(
  () => isAdapayPayment.value && paymentChannel.value === 'alipay' && clientPlatform.value === 'mobile',
)
const isUnionPayment = computed(() => isAdapayPayment.value && paymentChannel.value === 'union')
const isUnionMobilePayment = computed(
  () => isUnionPayment.value && clientPlatform.value === 'mobile',
)
const isUnionPcPayment = computed(() => isUnionPayment.value && clientPlatform.value === 'pc')

function normalizePaymentChannel(value: string): 'alipay' | 'wechat' | 'union' | '' {
  switch (value.trim().toLowerCase()) {
    case 'alipay':
    case 'alipay_qr':
    case 'alipay_wap':
      return 'alipay'
    case 'wechat':
    case 'wx_pub':
    case 'wx_lite':
      return 'wechat'
    case 'union':
    case 'union_qr':
    case 'union_wap':
      return 'union'
    default:
      return ''
  }
}

const wechatPayInfo = computed(() => parseWechatPayInfo(rawPaymentContent.value))
const isWechatBrowser = computed(
  () => typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent),
)
const alipayPaymentUrl = computed(() => {
  const value = rawPaymentContent.value.trim()
  if (/^(https?:\/\/|alipays:\/\/)/i.test(value)) {
    return value
  }
  return ''
})
const unionPaymentUrl = computed(() => {
  const value = rawPaymentContent.value.trim()
  return /^(https?:\/\/).*?(95516|unionpay|cloudpay)/i.test(value) ? value : ''
})
const isAlipayPaymentUrl = computed(() => {
  const value = rawPaymentContent.value.trim()
  return /^(https?:\/\/|alipays:\/\/).*?(alipay|qr\.alipay\.com)/i.test(value)
})
const invalidUnionPaymentContent = computed(
  () => isUnionPayment.value && Boolean(rawPaymentContent.value.trim()) && !unionPaymentUrl.value && !qrContent.value,
)
const invalidAdapayPaymentContent = computed(
  () =>
    isAdapayPayment.value &&
    !adapayPayment.value &&
    ((paymentChannel.value === 'union' && !unionPaymentUrl.value && !isUnionMobilePayment.value) ||
      (paymentChannel.value === 'alipay' && !isAlipayPaymentUrl.value)),
)
const wechatHandoffUrl = computed(() => {
  if (!isWechatPcPayment.value || !wechatPayInfo.value || typeof window === 'undefined') {
    return ''
  }

  // 用 router.resolve 生成与当前路由模式（history / hash）匹配的链接，避免把 query 塞进 hash 导致 history 模式丢失参数。
  const resolved = router.resolve({
    name: 'payment',
    query: {
      adapay: '1',
      developer_deposit: isDeveloperDepositPayment.value ? '1' : undefined,
      payment_id: paymentId.value,
      payment_handoff: '1',
      requirement_id: requirementId.value,
      channel: 'wechat',
      client_platform: 'mobile',
      amount_cny: amountCny.value,
      qr_content: rawPaymentContent.value,
    },
  })
  return new URL(resolved.href, window.location.origin).toString()
})
const qrContent = computed(() => {
  if (
    isWechatMobilePayment.value ||
    isAlipayMobilePayment.value ||
    isUnionMobilePayment.value ||
    invalidAdapayPaymentContent.value
  ) {
    return ''
  }
  if (isWechatPcPayment.value) {
    return wechatHandoffUrl.value
  }
  return rawPaymentContent.value
})
const hasOrder = computed(() => {
  if (isIntentMode.value) {
    return true
  }
  return paymentId.value && (isAdapayPayment.value || qrContent.value || isAlipayPage.value)
})

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
  if (!expiresAt.value.trim()) {
    return '以支付机构订单为准'
  }
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

async function loadAdapayPayment(paymentIdValue: string) {
  if (!isAdapayPayment.value || !auth.token || !paymentIdValue) {
    return
  }

  try {
    if (isDeveloperDepositPayment.value) {
      developerDepositPayment.value = await getAdapayDeveloperDepositPayment(auth.token, paymentIdValue)
      adapayPayment.value = null
    } else {
      adapayPayment.value = await getAdapayPayment(auth.token, paymentIdValue)
      developerDepositPayment.value = null
    }
  } catch {
    adapayPayment.value = null
    developerDepositPayment.value = null
  }
}

type WechatBridge = {
  invoke: (
    method: string,
    params: WechatJsapiPaymentInfo,
    callback: (result: { err_msg?: string }) => void,
  ) => void
}

function getWechatBridge(): WechatBridge | null {
  return (window as Window & { WeixinJSBridge?: WechatBridge }).WeixinJSBridge ?? null
}

// 意图模式：微信内自动静默授权（绑定 open_id）后创建 adapay wx_pub 订单。
async function createIntentAdapayOrder() {
  if (creatingIntentOrder.value || silentAuthWaiting.value) {
    return
  }
  if (!isIntentMode.value || !isWechatPayment.value || !auth.token || isPaymentHandoff.value ||
      (!isWechatPcPayment.value && !isWechatBrowser.value)) {
    return
  }
  intentOrderAttempted.value = true
  creatingIntentOrder.value = true
  wechatPayError.value = ''
  try {
    if (isDeveloperDepositIntentMode.value) {
      const payment = await createAdapayDeveloperDepositPayment(
        auth.token,
        Number(amountCny.value),
        'wechat',
        clientPlatform.value,
      )
      developerDepositPayment.value = payment
      await router.replace({
        name: 'payment',
        query: {
          adapay: '1',
          developer_deposit: '1',
          payment_id: payment.paymentId,
          channel: payment.payChannel,
          client_platform: clientPlatform.value,
          amount_cny: payment.amountCny,
          qr_content: payment.payUrl ?? undefined,
        },
      })
      return
    }

    const payment = await createAdapayPayment(
      auth.token,
      requirementId.value,
      milestone.value === 'final' ? 'final' : 'deposit',
      'wechat',
      clientPlatform.value,
    )
    adapayPayment.value = payment
    // 回写为已创建订单地址，便于后续确认/轮询
    await router.replace({
      name: 'payment',
      query: {
        adapay: '1',
        payment_id: payment.paymentId,
        requirement_id: payment.requirementId,
        channel: 'wechat',
        client_platform: clientPlatform.value,
        amount_cny: payment.amountCny,
        qr_content: payment.payUrl ?? undefined,
      },
    })
  } catch (err) {
    if (isWechatPaymentAuthorizationRequired(err)) {
      // 未绑定微信（缺少 open_id）：展示服务号静默授权二维码，扫码无感知完成后自动继续下单。
      await startSilentWechatAuth()
      return
    }
    wechatPayError.value = err instanceof Error ? err.message : '微信订单创建失败，请重试。'
  } finally {
    creatingIntentOrder.value = false
  }
}

function stopSilentWechatAuthPolling() {
  if (silentAuthTimer) {
    clearInterval(silentAuthTimer)
    silentAuthTimer = null
  }
}

function resetSilentWechatAuth() {
  stopSilentWechatAuthPolling()
  if (silentAuthExpireTimer) {
    clearTimeout(silentAuthExpireTimer)
    silentAuthExpireTimer = null
  }
  silentAuthWaiting.value = false
  silentAuthQrDataUrl.value = ''
}

// PC 端 snsapi_base 静默授权：手机微信扫码后微信直接回调落 openid，无需用户确认；
// PC 轮询 /auth/wechat/payment/status，检测到已授权后自动重试下单。
async function startSilentWechatAuth() {
  if (!auth.token || silentAuthWaiting.value) {
    return
  }
  silentAuthWaiting.value = true
  silentAuthQrDataUrl.value = ''
  wechatPayError.value = ''
  try {
    const { url } = await getWechatPaymentAuthorizeUrl(auth.token, window.location.href, 'qr')
    if (!url.trim()) {
      throw new Error('微信授权二维码地址为空')
    }
    silentAuthQrDataUrl.value = await QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
    silentAuthTimer = setInterval(() => {
      void checkSilentWechatAuth()
    }, 2000)
    silentAuthExpireTimer = setTimeout(() => {
      if (!silentAuthWaiting.value) {
        return
      }
      resetSilentWechatAuth()
      wechatPayError.value = '微信授权二维码已过期，请点击重试重新获取。'
    }, SILENT_AUTH_QR_TTL_MS)
  } catch (err) {
    resetSilentWechatAuth()
    wechatPayError.value =
      err instanceof Error ? err.message : '获取微信授权二维码失败，请重试。'
  }
}

async function checkSilentWechatAuth() {
  if (!silentAuthWaiting.value || !auth.token) {
    return
  }
  try {
    const { authorized } = await getWechatPaymentAuthorizationStatus(auth.token)
    if (!authorized) {
      return
    }
  } catch {
    // 轮询失败保留二维码，继续下一轮。
    return
  }
  resetSilentWechatAuth()
  showToast('微信授权成功，正在继续支付', 'success')
  await auth.fetchProfile(true).catch(() => undefined)
  if (isIntentMode.value && !wechatPayInfo.value && !creatingIntentOrder.value) {
    wechatAuthChecked.value = true
    intentOrderAttempted.value = false
    await createIntentAdapayOrder()
  }
}

// 微信内打开支付页时自动静默授权（snsapi_base，无确认页）：已登录用户未绑定 open_id 时自动跳转；
// 授权完成后若为意图模式则自动下单，并在微信内自动调起支付，实现「点支付 → 直接输密码付款」。
// 授权回调会带 wechat_oauth=success，据此避免重复跳转造成死循环。
async function runWechatFlow() {
  if (isPaymentHandoff.value) {
    if (!isWechatBrowser.value) {
      wechatPayError.value = '请用手机微信打开当前页面后再发起支付。'
    } else if (wechatPayInfo.value && !wechatAutoInvoked.value) {
      wechatAutoInvoked.value = true
      launchWechatPayment()
    }
    return
  }
  if (!auth.isAuthed || !auth.token) {
    return
  }
  if (wechatAutoAuthRedirecting.value) {
    return
  }
  if (!isWechatPayment.value) {
    return
  }
  if (isWechatPcPayment.value && isIntentMode.value) {
    if (!intentOrderAttempted.value) await createIntentAdapayOrder()
    return
  }
  // 移动端微信支付但不在微信内，无法调起 JSAPI
  if (isWechatMobilePayment.value && !isWechatBrowser.value) {
    wechatPayError.value = '请用手机微信打开当前页面后再发起支付。'
    return
  }
  if (!isWechatBrowser.value) {
    return
  }
  // 授权回调返回失败：提示并停止
  const oauthError = String(route.query.wechat_oauth_error ?? '')
  if (oauthError) {
    wechatAuthChecked.value = true
    wechatPayError.value = `微信授权失败：${oauthError}`
    return
  }
  // 是否刚从授权回调成功返回；此时无需再检查授权状态，直接进入下单/调起支付
  const returnedFromOauth = route.query.wechat_oauth === 'success'

  if (!wechatAuthChecked.value) {
    wechatAutoAuthRedirecting.value = true
    let authorized = returnedFromOauth
    try {
      if (!returnedFromOauth) {
        const { authorized: ok } = await getWechatPaymentAuthorizationStatus(auth.token)
        authorized = ok
      }
      wechatAuthChecked.value = true
      if (!authorized) {
        const { url } = await getWechatPaymentAuthorizeUrl(auth.token, window.location.href)
        if (url.trim()) {
          window.location.assign(url)
          return
        }
      }
    } catch {
      wechatAuthChecked.value = true
    } finally {
      wechatAutoAuthRedirecting.value = false
    }
    if (!authorized) {
      return
    }
  }

  // 意图模式：订单未创建则先创建
  if (isIntentMode.value && !wechatPayInfo.value && !creatingIntentOrder.value && !intentOrderAttempted.value) {
    await createIntentAdapayOrder()
    return
  }

  // 微信内移动端：订单就绪且未支付时自动调起支付
  if (
    isWechatMobilePayment.value &&
    wechatPayInfo.value &&
    !paid.value &&
    !wechatAutoInvoked.value &&
    !creatingIntentOrder.value
  ) {
    const status = adapayPayment.value?.status ?? developerDepositPayment.value?.status
    if (status !== 'creating' && status !== 'created') {
      return
    }
    wechatAutoInvoked.value = true
    launchWechatPayment()
  }
}

function launchWechatPayment() {
  if (wechatSubmitted.value || paid.value || wechatPayLoading.value || wechatBridgeListener) return
  wechatPayError.value = ''
  const paymentInfo = wechatPayInfo.value
  if (!paymentInfo) {
    wechatPayError.value = '微信支付信息无效，请返回订单页重新发起支付。'
    return
  }
  if (!isWechatBrowser.value) {
    wechatPayError.value = '请用手机微信打开当前支付页后再发起支付。'
    return
  }

  const invoke = () => {
    wechatBridgeListener = null
    if (wechatSubmitted.value || paid.value) return
    const bridge = getWechatBridge()
    if (!bridge) {
      wechatPayError.value = '微信支付环境未就绪，请稍后重试。'
      return
    }

    wechatPayLoading.value = true
    bridge.invoke('getBrandWCPayRequest', paymentInfo, (result) => {
      wechatPayLoading.value = false
      const message = result.err_msg?.toLowerCase() ?? ''
      if (message.includes(':ok')) {
        wechatSubmitted.value = true
        showToast('微信支付请求已提交，请等待支付结果', 'success')
        if (auth.token && !isPaymentHandoff.value) {
          void confirmPayment()
        }
      } else if (message.includes('cancel')) {
        wechatPayError.value = '你已取消微信支付。'
      } else {
        wechatPayError.value = '微信支付未完成，请重试或返回订单页。'
      }
    })
  }

  if (getWechatBridge()) {
    invoke()
    return
  }

  if (wechatBridgeListener) {
    document.removeEventListener('WeixinJSBridgeReady', wechatBridgeListener)
  }
  wechatBridgeListener = invoke
  document.addEventListener('WeixinJSBridgeReady', wechatBridgeListener, { once: true })
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
    () => auth.token,
    () => isAdapayPayment.value,
    () => isDeveloperDepositPayment.value,
  ],
  async ([id, token, isAdapay]) => {
    if (!id || !token || !isAdapay || isPaymentHandoff.value) {
      adapayPayment.value = null
      developerDepositPayment.value = null
      return
    }
    await loadAdapayPayment(id)
  },
  {
    immediate: true,
  },
)

watch(
  [
    () => paymentId.value,
    () => paymentChannel.value,
    () => auth.token,
  ],
  async ([id, channel]) => {
    if (channel !== 'alipay' || !id || isAdapayPayment.value) {
      return
    }

    await loadAlipayPageHtml(id)
  },
  {
    immediate: true,
  },
)

function goBack() {
  router.back()
}

function markPaymentPaid() {
  paid.value = true
  confirmationError.value = ''
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function refreshPaymentOnReturn() {
  if (document.visibilityState === 'visible') void confirmPayment()
}

async function checkOrderPaidByList() {
  const rows = await listPaymentOrdersApi(auth.token)
  const current = rows.find((item) => item.payment_id === paymentId.value)
  return current?.status === 'paid'
}

async function confirmPayment() {
  if (!paymentId.value || confirming.value || paid.value || isPaymentHandoff.value) {
    return
  }

  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  confirming.value = true
  confirmationError.value = ''
  try {
    if (isAdapayPayment.value) {
      const result = isDeveloperDepositPayment.value
        ? await getAdapayDeveloperDepositPayment(auth.token, paymentId.value)
        : await getAdapayPayment(auth.token, paymentId.value)
      if (isDeveloperDepositPayment.value) {
        developerDepositPayment.value = result as AdapayDeveloperDepositPaymentResponse
      } else {
        adapayPayment.value = result as AdapayPaymentResponse
      }
      if (result.status !== 'paid' && result.status !== 'confirmed') {
        return
      }

      markPaymentPaid()
      return
    }

    const channel = paymentChannel.value === 'wechat' ? 'wechat' : 'alipay'
    const result = await confirmPaymentApi(auth.token, channel, paymentId.value)

    if (!result.ok) {
      if (result.status === 409) {
        const isPaid = await checkOrderPaidByList()
        if (isPaid) {
          markPaymentPaid()
          return
        }
      }
      return
    }

    const payload = result.data as ConfirmPaymentResp | undefined

    if (payload?.status !== 'paid') {
      return
    }

    markPaymentPaid()
  } catch (err) {
    confirmationError.value = err instanceof Error ? err.message : '支付结果暂时无法查询，请稍后重试'
  } finally {
    confirming.value = false
  }
}

watch(
  () => adapayPayment.value?.status ?? developerDepositPayment.value?.status,
  (status) => {
    if (status === 'paid' || status === 'confirmed') markPaymentPaid()
  },
)

watch(
  () => [
    auth.isAuthed,
    auth.token,
    isWechatPayment.value,
    isWechatBrowser.value,
    isIntentMode.value,
    wechatPayInfo.value,
    creatingIntentOrder.value,
    paid.value,
    adapayPayment.value?.status ?? developerDepositPayment.value?.status,
  ],
  () => {
    void runWechatFlow()
  },
  { immediate: true },
)

onMounted(() => {
  auth.hydrate()
  document.addEventListener('visibilitychange', refreshPaymentOnReturn)
  window.addEventListener('focus', refreshPaymentOnReturn)

  countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)

  if (!isPaymentHandoff.value && !paid.value) pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') {
      return
    }
    void confirmPayment()
  }, PAYMENT_POLL_INTERVAL_MS)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshPaymentOnReturn)
  window.removeEventListener('focus', refreshPaymentOnReturn)
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (wechatBridgeListener) {
    document.removeEventListener('WeixinJSBridgeReady', wechatBridgeListener)
    wechatBridgeListener = null
  }
  stopSilentWechatAuthPolling()
  if (silentAuthExpireTimer) {
    clearTimeout(silentAuthExpireTimer)
    silentAuthExpireTimer = null
  }
})
</script>

<template>
  <main class="page-shell">
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>{{ paymentResultVisible ? '支付结果' : isWechatMobilePayment ? '微信支付' : isAlipayMobilePayment ? '支付宝支付' : isUnionMobilePayment ? '云闪付' : '扫码支付' }}</h2>
        </div>
        <button class="top-back" @click="goBack">返回</button>
      </header>

      <div v-if="paymentResultVisible" class="payment-result" role="status" aria-live="polite">
        <CircleCheck v-if="paid" class="payment-result__icon payment-result__icon--success" aria-hidden="true" />
        <Clock v-else class="payment-result__icon" aria-hidden="true" />
        <h2>{{ paid ? '支付成功' : isPaymentHandoff ? '微信已返回支付成功' : '正在确认支付结果' }}</h2>
        <p>{{ paid ? '平台已确认收款。' : isPaymentHandoff ? '平台到账状态以电脑端订单为准，请勿重复付款。' : '微信付款已完成，平台到账确认中，请勿重复付款。' }}</p>
        <p>订单号：{{ paymentId }}</p>
        <p v-if="amountCny">支付金额：¥{{ amountCny }}</p>
        <p v-if="confirmationError" class="payment-launch-panel__error">{{ confirmationError }}</p>
        <button v-if="!paid && !isPaymentHandoff" class="payment-launch-panel__button" type="button"
          :disabled="confirming" @click="confirmPayment">{{ confirming ? '查询中...' : '查询支付结果' }}</button>
        <button v-if="!isPaymentHandoff" class="top-back" type="button" @click="router.push({ name: 'workbench-requirements' })">返回工作台</button>
      </div>

      <div v-else-if="hasOrder" class="pay-layout">
        <article class="qr-card">
          <p class="card-title">支付入口</p>

          <div v-if="isWechatMobilePayment" class="payment-launch-panel">
            <p class="payment-launch-panel__title">微信支付</p>
            <p class="payment-launch-panel__tip">
              {{ !isWechatBrowser ? '请用手机微信打开当前页面后再发起支付。' : creatingIntentOrder || (isIntentMode && !wechatPayInfo) ? '正在创建支付订单，请稍候…' : '请在微信内点击下方按钮调起支付。' }}
            </p>
            <button class="payment-launch-panel__button" type="button"
              :disabled="wechatPayLoading || creatingIntentOrder || (isIntentMode && !wechatPayInfo) || !isWechatBrowser"
              @click="launchWechatPayment">
              {{ wechatPayLoading ? '正在打开微信支付...' : creatingIntentOrder || (isIntentMode && !wechatPayInfo) ? '正在创建微信支付订单...' : '发起微信支付' }}
            </button>
            <p v-if="wechatPayError" class="payment-launch-panel__error">{{ wechatPayError }}</p>
          </div>

          <div v-else-if="isWechatPcPayment && (isIntentMode || !qrDataUrl)" class="payment-launch-panel">
            <template v-if="silentAuthWaiting">
              <p class="payment-launch-panel__title">微信授权</p>
              <p class="payment-launch-panel__tip">首次使用微信支付，请用手机微信扫码完成授权（无需确认，授权成功后自动继续支付）。</p>
              <img v-if="silentAuthQrDataUrl" :src="silentAuthQrDataUrl" alt="微信授权二维码" class="qr-code" />
              <p v-else class="payment-launch-panel__tip">二维码生成中…</p>
            </template>
            <template v-else>
              <p v-if="wechatPayError" class="payment-launch-panel__error">{{ wechatPayError }}</p>
              <p v-else class="payment-launch-panel__tip">{{ creatingIntentOrder ? '正在创建微信支付订单...' : '正在准备微信付款码...' }}</p>
              <button v-if="wechatPayError && isIntentMode" class="payment-launch-panel__button" type="button"
                :disabled="creatingIntentOrder" @click="createIntentAdapayOrder">重试</button>
            </template>
          </div>

          <div v-else-if="isAlipayMobilePayment" class="payment-launch-panel">
            <p class="payment-launch-panel__title">支付宝支付</p>
            <p class="payment-launch-panel__tip">请点击下方按钮打开支付宝完成支付。</p>
            <a v-if="alipayPaymentUrl" class="payment-launch-panel__button" :href="alipayPaymentUrl">
              打开支付宝支付
            </a>
            <p v-else class="payment-launch-panel__error">支付宝支付链接无效，请返回订单页重新发起支付。</p>
          </div>

          <div v-else-if="isUnionMobilePayment" class="payment-launch-panel">
            <p class="payment-launch-panel__title">云闪付</p>
            <p class="payment-launch-panel__tip">请点击下方按钮打开云闪付完成支付。</p>
            <a v-if="unionPaymentUrl" class="payment-launch-panel__button payment-launch-panel__button--union"
              :href="unionPaymentUrl">
              打开云闪付支付
            </a>
            <p v-else class="payment-launch-panel__error">云闪付支付链接无效，请返回订单页重新发起支付。</p>
          </div>

          <div v-else-if="invalidAdapayPaymentContent || invalidUnionPaymentContent" class="payment-launch-panel">
            <p class="payment-launch-panel__title">支付订单不匹配</p>
            <p class="payment-launch-panel__error">当前订单内容不是云闪付订单，请返回需求页重新发起支付。</p>
          </div>

          <div v-else-if="alipayPageHtml" class="alipay-iframe-wrapper">
            <iframe ref="alipayIframeRef" :srcdoc="alipayPageHtml" class="alipay-frame" frameborder="0"
              sandbox="allow-scripts allow-forms allow-same-origin" scrolling="no" @load="handleIframeLoad"></iframe>
            <div v-if="alipayPageLoading || alipayIframeLoading" class="alipay-loading-overlay">
              <div class="loading-spinner"></div>
              <p>支付宝二维码加载中，请稍候…</p>
            </div>
          </div>

          <div v-else>
            <img v-if="qrDataUrl" :src="qrDataUrl" :alt="`${paymentChannel === 'wechat' ? '微信' : paymentChannel === 'union' ? '云闪付' : '支付宝'}扫码支付二维码`"
              class="qr-code" />
            <div v-else class="qr-fallback">二维码生成失败，请返回首页重新发起支付。</div>
            <p v-if="isWechatPcPayment" class="payment-qr-hint">请用手机微信扫码，并在手机上完成支付。</p>
            <p v-else-if="isUnionPcPayment" class="payment-qr-hint">请用手机云闪付扫码，并在手机上完成支付。</p>
          </div>
        </article>

        <article class="meta-card">
          <p class="card-title">支付信息</p>
          <div class="meta-list">
            <p>
              <span>需求号</span><strong>{{ requirementId }}</strong>
            </p>
            <p>
              <span>订单号</span><strong>{{ paymentId || (isIntentMode ? '待创建' : '') }}</strong>
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
            <p class="tip">{{ expiresAt ? `支付截止：${expiresAt}（超时后需重新发起支付）` : '支付截止时间以 Adapay 支付机构订单为准。' }}</p>
          <template v-if="paymentId && !isPaymentHandoff">
            <button class="top-back" type="button" :disabled="confirming" @click="confirmPayment">
              {{ confirming ? '查询中...' : '查询支付结果' }}
            </button>
            <p v-if="confirmationError" class="payment-launch-panel__error" role="alert">{{ confirmationError }}</p>
          </template>
        </article>
      </div>

      <div v-else class="empty">无有效支付订单信息。</div>
    </section>
  </main>
</template>

<style scoped>
.payment-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 36px 16px;
  text-align: center;
  min-width: 0;
  overflow-wrap: anywhere;
}

.payment-result h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.5;
}

.payment-result p {
  margin: 0;
  max-width: 100%;
  line-height: 1.7;
}

.payment-result__icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  color: #b7791f;
}

.payment-result__icon--success {
  color: #16804a;
}
</style>
