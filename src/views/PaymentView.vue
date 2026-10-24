<script setup lang="ts">
import PaymentEntryCard from '@/components/payment/PaymentEntryCard.vue'
import PaymentMetaCard from '@/components/payment/PaymentMetaCard.vue'
import PaymentResultPanel from '@/components/payment/PaymentResultPanel.vue'
import { usePaymentPage } from '@/composables/usePaymentPage'

/**
 * 支付页：5 条通道（Adapay 扫码 / 微信 JSAPI / 资源中间页 / 打赏中间页 / 跨设备 handoff）的公共落地页。
 *
 * 这里只剩三段布局：支付结果区、支付入口卡片、支付信息卡片。
 * 所有状态与流程（授权、下单、查单、倒计时、支付宝收银台）都在 `usePaymentPage` 及其子 composable 里，
 * 面板组件只接收展示值并通过 emit 回调上来，不直接碰 router / 消息 / 接口。
 */
const {
  paid,
  paymentResultVisible,
  confirmationError,
  confirming,
  redirectCountdown,
  confirmPayment,
  heading,
  flags,
  isWechatBrowser,
  isPaymentHandoff,
  isWechatMiddlePage,
  paymentId,
  paymentChannel,
  hasOrder,
  qrDataUrl,
  wechatPayError,
  wechatPayLoading,
  wechatMiddleBusy,
  wechatMiddleCreating,
  wechatAutoAuthRedirecting,
  creatingIntentOrder,
  alipayPaymentUrl,
  unionPaymentUrl,
  mismatched,
  displayOrderNo,
  displayAmountCny,
  displayRequirementLabel,
  displayRequirementId,
  couponCode,
  expiresAt,
  isExpired,
  countdownText,
  goBack,
  launchWechatPayment,
  retryMiddlePageAuth,
  createIntentAdapayOrder,
} = usePaymentPage()
</script>

<template>
  <main class="page-shell">
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>{{ heading }}</h2>
        </div>
        <button class="top-back" @click="goBack">返回</button>
      </header>

      <PaymentResultPanel
        v-if="paymentResultVisible"
        :paid="paid"
        :is-payment-handoff="isPaymentHandoff"
        :is-wechat-middle-page="isWechatMiddlePage"
        :payment-id="paymentId"
        :display-order-no="displayOrderNo"
        :display-amount-cny="displayAmountCny"
        :confirmation-error="confirmationError"
        :confirming="confirming"
        :redirect-countdown="redirectCountdown"
        @confirm="confirmPayment"
      />

      <div v-else-if="hasOrder" class="pay-layout">
        <PaymentEntryCard
          :flags="flags"
          :is-wechat-browser="isWechatBrowser"
          :wechat-pay-error="wechatPayError"
          :wechat-pay-loading="wechatPayLoading"
          :wechat-middle-busy="wechatMiddleBusy"
          :wechat-middle-creating="wechatMiddleCreating"
          :wechat-auto-auth-redirecting="wechatAutoAuthRedirecting"
          :creating-intent-order="creatingIntentOrder"
          :qr-data-url="qrDataUrl"
          :alipay-payment-url="alipayPaymentUrl"
          :union-payment-url="unionPaymentUrl"
          :payment-channel="paymentChannel"
          :mismatched="mismatched"
          @launch="launchWechatPayment"
          @retry-auth="retryMiddlePageAuth"
          @retry-create="createIntentAdapayOrder"
        />

        <PaymentMetaCard
          :display-requirement-label="displayRequirementLabel"
          :display-requirement-id="displayRequirementId"
          :display-order-no="displayOrderNo"
          :display-amount-cny="displayAmountCny"
          :coupon-code="couponCode"
          :is-expired="isExpired"
          :countdown-text="countdownText"
          :expires-at="expiresAt"
          :payment-id="paymentId"
          :is-payment-handoff="isPaymentHandoff"
          :confirming="confirming"
          :confirmation-error="confirmationError"
          @confirm="confirmPayment"
        />
      </div>

      <div v-else class="empty">无有效支付订单信息。</div>
    </section>
  </main>
</template>
