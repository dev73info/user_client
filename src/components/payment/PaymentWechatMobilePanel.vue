<script setup lang="ts">
import { computed } from 'vue'

/**
 * 微信内移动端的支付入口（含两个中间页）。
 *
 * 按钮只有两种：中间页授权失败时是「重新授权并支付」，其余是「发起微信支付」；
 * 文案提示按「是否微信内 → 是否报错 → 是否建单中 → 正常」的优先级取。
 */
const props = defineProps<{
  isWechatBrowser: boolean
  isWechatMiddlePage: boolean
  wechatPayError: string
  wechatPayLoading: boolean
  wechatMiddleBusy: boolean
  wechatMiddleCreating: boolean
  wechatAutoAuthRedirecting: boolean
}>()

const emit = defineEmits<{ launch: []; retryAuth: [] }>()

const tipText = computed(() => {
  if (!props.isWechatBrowser) {
    return props.isWechatMiddlePage
      ? '请用手机微信扫码打开本页后再完成支付。'
      : '请用手机微信打开当前页面后再发起支付。'
  }
  if (props.wechatPayError) {
    return '授权或下单未完成，请重试。'
  }
  if (props.wechatMiddleBusy || props.wechatMiddleCreating) {
    return '正在创建支付订单，请稍候…'
  }
  return '请在微信内点击下方按钮调起支付。'
})

const buttonText = computed(() => {
  if (props.wechatPayLoading) {
    return '正在打开微信支付...'
  }
  if (props.wechatMiddleBusy || props.wechatMiddleCreating) {
    return '正在创建微信支付订单...'
  }
  return '发起微信支付'
})
</script>

<template>
  <div class="payment-launch-panel">
    <p class="payment-launch-panel__title">微信支付</p>
    <p class="payment-launch-panel__tip">{{ tipText }}</p>
    <button
      v-if="isWechatMiddlePage && wechatPayError"
      class="payment-launch-panel__button"
      type="button"
      :disabled="wechatMiddleBusy || wechatAutoAuthRedirecting"
      @click="emit('retryAuth')"
    >
      重新授权并支付
    </button>
    <button
      v-else
      class="payment-launch-panel__button"
      type="button"
      :disabled="wechatPayLoading || wechatMiddleBusy || wechatMiddleCreating || !isWechatBrowser"
      @click="emit('launch')"
    >
      {{ buttonText }}
    </button>
    <p v-if="wechatPayError" class="payment-launch-panel__error">{{ wechatPayError }}</p>
  </div>
</template>
