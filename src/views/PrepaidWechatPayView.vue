<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { TButton } from 'ui_73info'

import {
  completePrepaidWechatJsapi,
  getPrepaidWechatAuthUrl,
  getPrepaidWechatStatus,
  type PrepaidOrder,
} from '@/api/devOrderDeposit'
import { isWechatBrowser } from '@/shared/auth/browser'
import { formatFenAsCny } from '@/shared/money'
import { invokeWechatJsapiPayment, parseWechatPayInfo } from '@/utils/wechatPayment'

/**
 * 保证金充值的微信支付中间页。
 *
 * PC 端「保证金充值」弹窗选微信时，码里放的是这一页的地址（带订单号与访问令牌）：
 * 手机微信扫码打开 → 公众号静默授权拿 openid → 补建 `wx_pub` 渠道单 →
 * `WeixinJSBridge` 拉起付款 → 轮询到 `paid`。
 *
 * 与资源购买的中间页同构，区别只有数据域（充值单 vs 资源订单）；
 * 手机这端没有平台登录态，令牌走 query，不读 Authorization。
 */
type Phase = 'checking' | 'authorizing' | 'paying' | 'paid' | 'error'

const route = useRoute()
const phase = ref<Phase>('checking')
const errorMessage = ref('')
const order = ref<PrepaidOrder | null>(null)
let pollTimer: number | null = null

function readQueryString(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

const orderNo = computed(() => readQueryString(route.query.order_no))
const token = computed(() => readQueryString(route.query.token))
const amountLabel = computed(() => formatFenAsCny(order.value?.amount_fen ?? 0))
const paid = computed(() => phase.value === 'paid')

function fail(message: string): void {
  stopPolling()
  phase.value = 'error'
  errorMessage.value = message
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer)
    pollTimer = null
  }
}

/** 支付动作提交后盯订单状态：回调可能晚到，到账以服务端为准。 */
function startPolling(): void {
  stopPolling()
  const tick = async () => {
    pollTimer = null
    try {
      const status = await getPrepaidWechatStatus(orderNo.value, token.value)
      order.value = status.order
      if (status.order.status === 'paid') {
        phase.value = 'paid'
        return
      }
      if (status.order.status === 'failed' || status.order.status === 'canceled') {
        fail('充值单已关闭或支付失败，请返回电脑重新发起')
        return
      }
    } catch {
      /* 轮询失败不打断，下一次继续 */
    }
    pollTimer = window.setTimeout(tick, 2500)
  }
  pollTimer = window.setTimeout(tick, 2500)
}

async function run(): Promise<void> {
  if (!orderNo.value || !token.value) {
    fail('支付链接无效，请返回电脑重新发起充值')
    return
  }
  if (!isWechatBrowser()) {
    fail('请用手机微信扫码打开本页后再完成支付')
    return
  }
  const oauthError = readQueryString(route.query.wechat_oauth_error)
  if (oauthError) {
    fail(`微信授权失败：${oauthError}`)
    return
  }

  try {
    const status = await getPrepaidWechatStatus(orderNo.value, token.value)
    order.value = status.order
    if (status.order.status === 'paid') {
      phase.value = 'paid'
      return
    }
    if (status.order.status === 'failed' || status.order.status === 'canceled') {
      fail('充值单已关闭或支付失败，请返回电脑重新发起')
      return
    }

    if (!status.authorized) {
      phase.value = 'authorizing'
      // 回跳地址就是本页：授权完成后微信带着 wechat_oauth=success 回到这里
      const authorization = await getPrepaidWechatAuthUrl(
        orderNo.value,
        token.value,
        window.location.href,
      )
      if (!authorization.authorized) {
        if (!authorization.url.trim()) {
          fail('微信授权地址为空，请返回电脑重新发起充值')
          return
        }
        window.location.assign(authorization.url)
        return
      }
    }

    phase.value = 'paying'
    const jsapi = await completePrepaidWechatJsapi(orderNo.value, token.value)
    order.value = jsapi.order
    if (jsapi.order.status === 'paid') {
      phase.value = 'paid'
      return
    }
    const payInfo = parseWechatPayInfo(jsapi.pay_info)
    if (!payInfo) {
      fail('微信支付参数无效，请返回电脑重新发起充值')
      return
    }
    const outcome = await invokeWechatJsapiPayment(payInfo)
    if (outcome === 'cancel') {
      fail('你已取消微信支付。')
      return
    }
    if (outcome !== 'ok') {
      fail('微信支付未完成，请返回电脑重试。')
      return
    }
    startPolling()
  } catch (error) {
    fail(error instanceof Error ? error.message : '微信支付失败，请返回电脑重试')
  }
}

function goHome(): void {
  window.location.assign('/')
}

onMounted(() => {
  void run()
})

onUnmounted(stopPolling)
</script>

<template>
  <main class="page-shell checkout-page" :aria-busy="phase === 'checking' || phase === 'paying'">
    <section class="checkout-card">
      <header class="checkout-card__head">
        <h1 class="checkout-card__title">保证金充值</h1>
        <span v-if="order" class="checkout-card__status">微信支付</span>
      </header>

      <p v-if="phase === 'checking'" class="checkout-card__status-line" role="status">
        正在检查充值单…
      </p>
      <p v-else-if="phase === 'authorizing'" class="checkout-card__status-line" role="status">
        正在获取微信授权…
      </p>
      <p v-else-if="phase === 'paying'" class="checkout-card__status-line" role="status">
        正在拉起微信支付…
      </p>

      <div v-else-if="phase === 'error'" class="checkout-card__error" role="alert">
        <p>{{ errorMessage }}</p>
        <TButton variant="outline" @click="goHome">返回首页</TButton>
      </div>

      <template v-else>
        <div v-if="paid" class="checkout-paid" role="status">
          <strong class="checkout-paid__title">支付成功</strong>
          <p class="checkout-paid__line">保证金充值 {{ amountLabel }}</p>
          <p class="checkout-paid__line">订单号 {{ orderNo }}</p>
          <div class="checkout-actions">
            <TButton variant="outline" @click="goHome">返回首页</TButton>
          </div>
        </div>

        <dl v-else class="checkout-summary">
          <div class="checkout-summary__row">
            <dt>充值金额</dt>
            <dd>{{ amountLabel }}</dd>
          </div>
          <div class="checkout-summary__row">
            <dt>订单号</dt>
            <dd>{{ orderNo }}</dd>
          </div>
          <div class="checkout-summary__row">
            <dt>状态</dt>
            <dd>{{ order?.status_label || '待支付' }}</dd>
          </div>
        </dl>
      </template>
    </section>
  </main>
</template>

<style scoped src="../components/payment/api-checkout-page.css"></style>
