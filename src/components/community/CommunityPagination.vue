<script setup lang="ts">
import { TButton } from 'ui_73info'

/**
 * 社区帖子分页：接口按 limit/offset 分页、不返回总数，所以保留上一页/下一页，
 * 但外观与工作台其它列表的表尾统一（`.wb-pager`：左边读数、右边控件）。
 */
defineProps<{
  page: number
  loading: boolean
  hasPrevious: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{ previous: []; next: [] }>()
</script>

<template>
  <nav class="wb-pager community-pagination" aria-label="社区帖子分页">
    <span class="wb-pager__count">第 {{ page }} 页</span>
    <div class="community-pagination__nav">
      <TButton :disabled="!hasPrevious || loading" @click="emit('previous')">上一页</TButton>
      <TButton :disabled="!hasNext || loading" @click="emit('next')">下一页</TButton>
    </div>
  </nav>
</template>

<style scoped>
/* 表尾口径走统一层 .wb-pager；这里只补按钮组与窄屏高度 */
.community-pagination {
  margin-top: 16px;
}

.community-pagination__nav {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 640px) {
  .community-pagination__nav :deep(button) {
    min-height: 44px;
  }
}
</style>
