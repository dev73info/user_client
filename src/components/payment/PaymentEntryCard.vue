<script setup lang="ts">
import PaymentAlipayFrame from '@/components/payment/PaymentAlipayFrame.vue'
import PaymentLinkPanel from '@/components/payment/PaymentLinkPanel.vue'
import PaymentMismatchPanel from '@/components/payment/PaymentMismatchPanel.vue'
import PaymentQrCodeBlock from '@/components/payment/PaymentQrCodeBlock.vue'
import PaymentWechatMobilePanel from '@/components/payment/PaymentWechatMobilePanel.vue'
import PaymentWechatPcAuthPanel from '@/components/payment/PaymentWechatPcAuthPanel.vue'
import type { PaymentFlags } from '@/shared/paymentFlags'

/**
 * 「支付入口」卡片：按渠道分发到具体面板。
 *
 * 这里只做分发，不放任何支付逻辑——每个分支的文案与按钮都在各自的面板里；
 * 分支顺序也不能动：手机端微信 / PC 微信授权 / 支付宝手机 / 云闪付手机 / 订单不匹配 /
 * 支付宝收银台 iframe / 二维码兜底，改顺序会让两种渠道同时命中时展示错的那块。
 */
defineProps<{
  flags: PaymentFlags
  isWechatBrowser: boolean
  wechatPayError: string
  wechatPayLoading: boolean
  wechatMiddleBusy: boolean
  wechatMiddleCreating: boolean
  wechatAutoAuthRedirecting: boolean
  silentAuthWaiting: boolean
  silentAuthQrDataUrl: string
  creatingIntentOrder: boolean
  qrDataUrl: string
  alipayPaymentUrl: string
  unionPaymentUrl: string
  alipayPageHtml: string
  alipayPageLoading: boolean
  alipayIframeLoading: boolean
  paymentChannel: string
  /** 订单内容与渠道对不上（`invalidAdapayPaymentContent || invalidUnionPaymentContent`） */
  mismatched: boolean
}>()

const emit = defineEmits<{
  launch: []
  retryAuth: []
  retryCreate: []
  iframeLoad: []
}>()
</script>

<template>
  <article class="qr-card">
    <p class="card-title">支付入口</p>

    <PaymentWechatMobilePanel
      v-if="flags.isWechatMobilePayment"
      :is-wechat-browser="isWechatBrowser"
      :is-wechat-middle-page="flags.isWechatMiddlePage"
      :wechat-pay-error="wechatPayError"
      :wechat-pay-loading="wechatPayLoading"
      :wechat-middle-busy="wechatMiddleBusy"
      :wechat-middle-creating="wechatMiddleCreating"
      :wechat-auto-auth-redirecting="wechatAutoAuthRedirecting"
      @launch="emit('launch')"
      @retry-auth="emit('retryAuth')"
    />

    <PaymentWechatPcAuthPanel
      v-else-if="flags.isWechatPcPayment && (flags.isIntentMode || !qrDataUrl)"
      :silent-auth-waiting="silentAuthWaiting"
      :silent-auth-qr-data-url="silentAuthQrDataUrl"
      :wechat-pay-error="wechatPayError"
      :creating-intent-order="creatingIntentOrder"
      :is-intent-mode="flags.isIntentMode"
      @retry-create="emit('retryCreate')"
    />

    <PaymentLinkPanel
      v-else-if="flags.isAlipayMobilePayment"
      title="支付宝支付"
      tip="请点击下方按钮打开支付宝完成支付。"
      :href="alipayPaymentUrl"
      href-label="打开支付宝支付"
      error-text="支付宝支付链接无效，请返回订单页重新发起支付。"
    />

    <PaymentLinkPanel
      v-else-if="flags.isUnionMobilePayment"
      title="云闪付"
      tip="请点击下方按钮打开云闪付完成支付。"
      :href="unionPaymentUrl"
      href-label="打开云闪付支付"
      error-text="云闪付支付链接无效，请返回订单页重新发起支付。"
      union
    />

    <PaymentMismatchPanel v-else-if="mismatched" />

    <PaymentAlipayFrame
      v-else-if="alipayPageHtml"
      :html="alipayPageHtml"
      :page-loading="alipayPageLoading"
      :iframe-loading="alipayIframeLoading"
      @load="emit('iframeLoad')"
    />

    <PaymentQrCodeBlock
      v-else
      :qr-data-url="qrDataUrl"
      :payment-channel="paymentChannel"
      :is-wechat-pc-payment="flags.isWechatPcPayment"
      :is-union-pc-payment="flags.isUnionPcPayment"
    />
  </article>
</template>
