<script setup lang="ts">
/**
 * 首页侧栏「内测中」卡片：徽标 + 加入 QQ 群。
 *
 * 纯展示组件：QQ 群地址由视图负责打开，这里只按 `open-group` 事件回抛。
 * 样式仍在全局 `styles/home.css`（`.portal-beta-notice*`），本组件不带 `<style>`。
 */
const emit = defineEmits<{ (e: 'open-group'): void }>()
</script>

<template>
  <section class="portal-card portal-section--beta">
    <div class="portal-beta-notice">
      <span class="portal-beta-notice__badge">内测中</span>

      <button class="portal-beta-notice__btn" type="button" @click="emit('open-group')">
        加入QQ群
      </button>
    </div>
  </section>
</template>
