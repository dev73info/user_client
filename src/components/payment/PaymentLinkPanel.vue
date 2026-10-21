<script setup lang="ts">
/**
 * 「跳出去付」类收银台：支付宝 / 云闪付的手机端都是「一个按钮跳到支付 App」，
 * 形态一致（标题 + 提示 + 链接按钮 + 链接无效提示），只差文案与按钮配色。
 */
defineProps<{
  title: string
  tip: string
  href: string
  hrefLabel: string
  errorText: string
  /** 云闪付按钮走蓝色底（`payment-launch-panel__button--union`） */
  union?: boolean
}>()
</script>

<template>
  <div class="payment-launch-panel">
    <p class="payment-launch-panel__title">{{ title }}</p>
    <p class="payment-launch-panel__tip">{{ tip }}</p>
    <a
      v-if="href"
      class="payment-launch-panel__button"
      :class="{ 'payment-launch-panel__button--union': union }"
      :href="href"
    >
      {{ hrefLabel }}
    </a>
    <p v-else class="payment-launch-panel__error">{{ errorText }}</p>
  </div>
</template>
