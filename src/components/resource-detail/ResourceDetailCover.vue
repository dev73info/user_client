<script setup lang="ts">
/**
 * 资源详情面板左侧的封面卡：有图显示图，没图显示占位图标。
 *
 * 从 `ResourceDetailPanel.vue` 整块搬出来（模板节点与类名一字未改，样式随节点搬到
 * `resource-detail-cover.css`）。URL 解析仍在外层（`resourceCoverUrl`），这里只负责渲染。
 */
const props = defineProps<{
  /** 已解析成可访问地址的封面 URL，空串表示没有封面 */
  coverUrl: string
  title: string
}>()
</script>

<template>
  <div class="resource-detail-page__cover-card">
    <img
      v-if="props.coverUrl"
      :src="props.coverUrl"
      :alt="props.title"
      class="resource-detail-page__cover-image"
    />
    <div v-else class="resource-detail-page__cover-placeholder">📁</div>
  </div>
</template>

<style scoped src="./resource-detail-cover.css"></style>
