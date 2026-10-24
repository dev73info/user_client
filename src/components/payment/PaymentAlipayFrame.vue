<script setup lang="ts">
/**
 * 支付宝官方收银台（`srcdoc` 内嵌）。
 *
 * 扫码与轮询都在支付宝自己的页面里完成，所以整页内嵌；加载完成前盖一层遮罩，
 * 避免用户对着空白 iframe 发呆。`sandbox` 三个取值是支付宝页面跑起来的最小集合。
 */
defineProps<{
  html: string
  pageLoading: boolean
  iframeLoading: boolean
}>()

const emit = defineEmits<{ load: [] }>()
</script>

<template>
  <div class="alipay-iframe-wrapper">
    <iframe
      :srcdoc="html"
      class="alipay-frame"
      frameborder="0"
      sandbox="allow-scripts allow-forms allow-same-origin"
      scrolling="no"
      @load="emit('load')"
    ></iframe>
    <div v-if="pageLoading || iframeLoading" class="alipay-loading-overlay">
      <div class="loading-spinner"></div>
      <p>支付宝二维码加载中，请稍候…</p>
    </div>
  </div>
</template>
