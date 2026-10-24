<script setup lang="ts">
/**
 * PC 端微信支付的建单状态：出码过程中的等待与失败重试。
 *
 * 2.0 没有「先扫码静默授权拿 open_id」这一步（相关端点不在契约里），授权二维码那一段已删。
 */
defineProps<{
  wechatPayError: string
  creatingIntentOrder: boolean
  isIntentMode: boolean
}>()

const emit = defineEmits<{ retryCreate: [] }>()
</script>

<template>
  <div class="payment-launch-panel">
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
  </div>
</template>
