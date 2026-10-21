<script setup lang="ts">
/**
 * PC 端微信支付的两段状态：
 * 1. 静默授权二维码（未绑定 open_id 时先绑，扫码无确认页）；
 * 2. 建单 / 出码过程中的等待与失败重试。
 */
defineProps<{
  silentAuthWaiting: boolean
  silentAuthQrDataUrl: string
  wechatPayError: string
  creatingIntentOrder: boolean
  isIntentMode: boolean
}>()

const emit = defineEmits<{ retryCreate: [] }>()
</script>

<template>
  <div class="payment-launch-panel">
    <template v-if="silentAuthWaiting">
      <p class="payment-launch-panel__title">微信授权</p>
      <p class="payment-launch-panel__tip">
        首次使用微信支付，请用手机微信扫码完成授权（无需确认，授权成功后自动继续支付）。
      </p>
      <img
        v-if="silentAuthQrDataUrl"
        :src="silentAuthQrDataUrl"
        alt="微信授权二维码"
        class="qr-code"
      />
      <p v-else class="payment-launch-panel__tip">二维码生成中…</p>
    </template>
    <template v-else>
      <p v-if="wechatPayError" class="payment-launch-panel__error">{{ wechatPayError }}</p>
      <p v-else class="payment-launch-panel__tip">
        {{ creatingIntentOrder ? '正在创建微信支付订单...' : '正在准备微信付款码...' }}
      </p>
      <button
        v-if="wechatPayError && isIntentMode"
        class="payment-launch-panel__button"
        type="button"
        :disabled="creatingIntentOrder"
        @click="emit('retryCreate')"
      >
        重试
      </button>
    </template>
  </div>
</template>
