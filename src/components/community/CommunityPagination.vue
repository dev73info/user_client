<script setup lang="ts">
import { computed } from 'vue'
import { TPagination } from 'ui_73info'

/**
 * 社区帖子分页：接口按 limit/offset 分页、不返回总数。
 * 外观与工作台其它列表共用 TPagination；页码只渲染“确定存在”的相邻页，
 * 所以不会为了凑页码去虚构总条数。
 */
const props = defineProps<{
  page: number
  pageSize: number
  /** 当前页实际条数，用来确认下一页是否存在 */
  count: number
  loading: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{ change: [page: number] }>()

const knownTotal = computed(
  () => (props.page - 1) * props.pageSize + props.count + (props.hasNext ? props.pageSize : 0),
)
</script>

<template>
  <div class="wb-pager community-pagination">
    <span class="wb-pager__count">第 {{ page }} 页</span>
    <TPagination
      :current-page="page"
      :total="knownTotal"
      :page-size="pageSize"
      :show-total="false"
      :disabled="loading"
      aria-label="社区帖子分页"
      @change="emit('change', $event)"
    />
  </div>
</template>

<style scoped>
/* 分栏页列表很长时 margin-top:auto 会归零，用 padding 保证表尾上方始终有间距 */
.community-pagination {
  padding-top: 12px;
}

/* 与需求大厅表尾同一档：32px 方块、未选中纯数字、选中实底蓝、hover 灰底。 */
.community-pagination :deep(.t73-pagination__pages) {
  gap: 4px;
}

.community-pagination :deep(.t73-pagination__button) {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--73-ink-soft);
  font-size: 12px;
}

.community-pagination :deep(.t73-pagination__button:hover:not(:disabled)) {
  border-color: transparent;
  background: var(--73-inset);
  color: var(--73-ink);
}

.community-pagination :deep(.t73-pagination__page--active),
.community-pagination :deep(.t73-pagination__page--active:hover:not(:disabled)) {
  border-color: var(--73-accent);
  background: var(--73-accent);
  color: var(--73-accent-contrast);
  font-weight: 600;
}

.community-pagination :deep(.t73-pagination__button:disabled) {
  opacity: 0.4;
}
</style>
