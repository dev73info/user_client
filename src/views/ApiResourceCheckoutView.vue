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

<style scoped>
.checkout-page {
  display: flex;
  justify-content: center;
  padding: 48px 16px 72px;
}

.checkout-card {
  width: min(560px, 100%);
  display: grid;
  gap: 20px;
  padding: 26px;
  border-radius: 24px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.12);
}

.checkout-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.checkout-card__title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}

.checkout-card__status {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.checkout-card__status-line {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.checkout-card__error {
  display: grid;
  gap: 14px;
  justify-items: start;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(252, 165, 165, 0.85);
  background: rgba(254, 242, 242, 0.9);
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.65;
}

.checkout-card__error p {
  margin: 0;
  word-break: break-word;
}

.checkout-summary {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(248, 250, 252, 0.96);
}

.checkout-summary__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.checkout-summary__row dt {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 13px;
}

.checkout-summary__row dd {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  text-align: right;
  word-break: break-word;
}

.checkout-paid {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(134, 239, 172, 0.7);
  background: rgba(240, 253, 244, 0.92);
}

.checkout-paid__title {
  color: #15803d;
  font-size: 18px;
  font-weight: 800;
}

.checkout-paid__line {
  margin: 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.checkout-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}

.checkout-pay {
  display: grid;
  justify-items: center;
  gap: 12px;
  min-height: 248px;
  align-content: center;
  padding: 16px;
  border-radius: 16px;
  border: 1px dashed rgba(148, 163, 184, 0.7);
  background: rgba(248, 250, 252, 0.9);
}

.checkout-pay__qr img {
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: #fff;
}

@media (max-width: 640px) {
  .checkout-page {
    padding: 20px 12px 48px;
  }

  .checkout-card {
    gap: 16px;
    padding: 18px 16px;
    border-radius: 20px;
  }

  .checkout-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
