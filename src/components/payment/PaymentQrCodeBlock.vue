<script setup lang="ts">
import { computed } from 'vue'

/**
 * 扫码支付二维码（PC 微信 / 云闪付 / 支付宝的兜底分支）。
 * 二维码生成失败时不给空白，直接提示回首页重来。
 */
const props = defineProps<{
  qrDataUrl: string
  /** 实际渠道：只用于二维码图片的 alt 文案 */
  paymentChannel: string
  isWechatPcPayment: boolean
  isUnionPcPayment: boolean
}>()

const channelLabel = computed(() => {
  if (props.paymentChannel === 'wechat') return '微信'
  if (props.paymentChannel === 'union') return '云闪付'
  return '支付宝'
})
</script>

<template>
  <div>
    <img v-if="qrDataUrl" :src="qrDataUrl" :alt="`${channelLabel}扫码支付二维码`" class="qr-code" />
    <div v-else class="qr-fallback">二维码生成失败，请返回首页重新发起支付。</div>
    <p v-if="isWechatPcPayment" class="payment-qr-hint">请用手机微信扫码，并在手机上完成支付。</p>
    <p v-else-if="isUnionPcPayment" class="payment-qr-hint">
      请用手机云闪付扫码，并在手机上完成支付。
    </p>
  </div>
</template>
