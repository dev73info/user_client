<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getWechatBindAuthorizeUrl, getWechatBindQrUrl } from '@/api/auth'
import { getAdapayClientPlatform } from '@/api/adapay'
import {
  exchangeCheckoutTicket,
  getMyResourcePurchase,
  type ResourcePurchaseOrder,
} from '@/api/resourcePurchase'
import WechatBindQrModal from '@/components/WechatBindQrModal.vue'
import { useResourcePayment } from '@/composables/useResourcePayment'
import { isWechatBrowser } from '@/shared/auth/browser'
import { formatPurchaseAmountLabel, resourcePurchaseStatusLabel } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'
import { TButton, TMessage } from 'ui_73info'

/**
 * R034 接口资源收银台。
 *
 * 开发者站点把买家重定向到这里时带两样东西：一次性 `ticket` 与 `order_no`。
 * 票据换到平台 JWT 后立即从地址栏抹掉（单次使用、10 分钟有效），
 * 之后按普通已购订单拉详情、出二维码并轮询支付结果。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

type CheckoutPhase = 'exchanging' | 'loading' | 'ready' | 'paid' | 'error'

const phase = ref<CheckoutPhase>('exchanging')
const errorMessage = ref('')
const order = ref<ResourcePurchaseOrder | null>(null)
const wechatBind = reactive({ visible: false, url: '', state: '' })
const wechatBinding = ref(false)

function readQueryString(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

const { qrDataUrl, renderQr, startPoll, stopPoll } = useResourcePayment({
  getToken: () => auth.token,
  onPaid: (paid) => {
    order.value = paid
    phase.value = 'paid'
    stopPoll()
  },
  notifyClosed: () => {
    phase.value = 'error'
    errorMessage.value = '支付未完成，请重新打开收银台链接'
  },
})

const isPaid = computed(() => phase.value === 'paid')
const orderTitle = computed(
  () => order.value?.resource_title?.trim() || `资源 #${order.value?.resource_id ?? ''}`,
)

async function loadOrder(orderNo: string) {
  if (!orderNo) {
    phase.value = 'error'
    errorMessage.value = '缺少订单号'
    return
  }

  phase.value = 'loading'
  try {
    const loaded = await getMyResourcePurchase(auth.token, orderNo)
    order.value = loaded
    await applyOrderState(loaded)
  } catch (error) {
    phase.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : '加载订单失败'
  }
}

async function applyOrderState(loaded: ResourcePurchaseOrder) {
  if (loaded.status === 'paid') {
    phase.value = 'paid'
    return
  }

  phase.value = 'ready'
  if (loaded.status !== 'pending') {
    return
  }

  startPoll(loaded.order_no)
  const payUrl = loaded.pay_url?.trim()
  if (!payUrl) {
    return
  }

  // 移动端直接跳渠道收银台；桌面端出二维码并轮询。
  if (getAdapayClientPlatform() === 'mobile') {
    window.location.href = payUrl
    return
  }
  await renderQr(loaded)
}

async function bootstrap() {
  auth.hydrate()

  const ticket = readQueryString(route.query.ticket)
  if (ticket) {
    phase.value = 'exchanging'
    try {
      const session = await exchangeCheckoutTicket(ticket)
      await auth.applyExternalSession({ token: session.token, username: session.username })
      const orderNo = session.order_no?.trim() || readQueryString(route.query.order_no)
      // 票据用掉即从地址栏移除：刷新 / 前进后退都不会再拿它换一次（第二次必 410）。
      await router.replace({
        name: 'api-resource-checkout',
        query: orderNo ? { order_no: orderNo } : {},
      })
      await loadOrder(orderNo)
    } catch (error) {
      phase.value = 'error'
      errorMessage.value = error instanceof Error ? error.message : '收银台登录失败'
    }
    return
  }

  if (!auth.token.trim()) {
    phase.value = 'error'
    errorMessage.value = '登录状态已失效，请重新打开收银台链接'
    return
  }

  await loadOrder(readQueryString(route.query.order_no))
}

async function bindWechat() {
  if (!auth.token.trim() || wechatBinding.value) {
    return
  }

  wechatBinding.value = true
  try {
    // 微信内跳服务号网页授权；桌面端展示扫码绑定的二维码。
    if (isWechatBrowser()) {
      const { url } = await getWechatBindAuthorizeUrl(auth.token, window.location.href)
      if (!url.trim()) {
        throw new Error('微信授权地址为空')
      }
      window.location.assign(url)
      return
    }

    const qr = await getWechatBindQrUrl(auth.token, window.location.href)
    if (!qr.url.trim() || !qr.state.trim()) {
      throw new Error('微信绑定二维码地址为空')
    }
    wechatBind.url = qr.url
    wechatBind.state = qr.state
    wechatBind.visible = true
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '发起微信绑定失败')
  } finally {
    wechatBinding.value = false
  }
}

function closeWechatBind() {
  wechatBind.visible = false
  wechatBind.url = ''
  wechatBind.state = ''
}

function handleWechatBound(result: { success: boolean }) {
  closeWechatBind()
  if (result.success) {
    TMessage.success('微信绑定成功')
  }
}

function goPurchases() {
  void router.push({ name: 'workbench-resource-purchases' })
}

function goHome() {
  void router.push({ name: 'home' })
}

onMounted(() => {
  void bootstrap()
})
</script>

<template>
  <main class="page-shell checkout-page" :aria-busy="phase === 'exchanging' || phase === 'loading'">
    <section class="checkout-card">
      <header class="checkout-card__head">
        <h1 class="checkout-card__title">收银台</h1>
        <span v-if="order" class="checkout-card__status">{{
          resourcePurchaseStatusLabel(order.status)
        }}</span>
      </header>

      <p v-if="phase === 'exchanging'" class="checkout-card__status-line" role="status">
        正在登录…
      </p>
      <p v-else-if="phase === 'loading'" class="checkout-card__status-line" role="status">
        正在加载订单…
      </p>

      <div v-else-if="phase === 'error'" class="checkout-card__error" role="alert">
        <p>{{ errorMessage }}</p>
        <TButton variant="outline" @click="goHome">返回首页</TButton>
      </div>

      <template v-else-if="order">
        <dl class="checkout-summary">
          <div class="checkout-summary__row">
            <dt>资源</dt>
            <dd>{{ orderTitle }}</dd>
          </div>
          <div class="checkout-summary__row">
            <dt>订单号</dt>
            <dd>{{ order.order_no }}</dd>
          </div>
          <div class="checkout-summary__row">
            <dt>金额</dt>
            <dd>{{ formatPurchaseAmountLabel(order) }}</dd>
          </div>
        </dl>

        <div v-if="isPaid" class="checkout-paid" role="status">
          <strong class="checkout-paid__title">支付成功</strong>
          <p class="checkout-paid__line">
            {{ orderTitle }} · {{ formatPurchaseAmountLabel(order) }}
          </p>
          <p class="checkout-paid__line">订单号 {{ order.order_no }}</p>
          <div class="checkout-actions">
            <TButton :loading="wechatBinding" @click="bindWechat">绑定微信，下次直接登录</TButton>
            <TButton variant="outline" @click="goPurchases">查看我的已购</TButton>
          </div>
        </div>

        <div v-else class="checkout-pay">
          <div v-if="qrDataUrl" class="checkout-pay__qr">
            <img :src="qrDataUrl" alt="支付二维码" width="220" height="220" />
          </div>
          <p v-else class="checkout-card__status-line" role="status">
            {{ order.status === 'pending' ? '等待支付结果…' : '订单当前不可支付' }}
          </p>
        </div>
      </template>
    </section>

    <WechatBindQrModal
      :visible="wechatBind.visible"
      :url="wechatBind.url"
      :state="wechatBind.state"
      @close="closeWechatBind"
      @bound="handleWechatBound"
    />
  </main>
</template>

<style scoped src="./../components/payment/api-checkout-page.css"></style>
