<script setup lang="ts">
import { TButton } from 'ui_73info'

defineProps<{
  page: number
  loading: boolean
  hasPrevious: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{ previous: []; next: [] }>()
</script>

<template>
  <nav class="community-pagination" aria-label="社区帖子分页">
    <TButton :disabled="!hasPrevious || loading" @click="emit('previous')">上一页</TButton>
    <span>第 {{ page }} 页</span>
    <TButton :disabled="!hasNext || loading" @click="emit('next')">下一页</TButton>
  </nav>
</template>

<style scoped>
.community-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 18px;
  color: var(--73-ink-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 640px) {
  .community-pagination {
    justify-content: space-between;
    gap: 10px;
  }
  .community-pagination :deep(button) {
    min-height: 44px;
  }
}
</style>
