<script setup lang="ts">
/**
 * 资源目录的页码胶囊（工具条内，仅多页时出现）。
 *
 * 页码数字由 `@/shared/resourceCatalogDisplay` 的 `buildCatalogPageNumbers` 收口，
 * 这里只负责排版与翻页事件；翻页动作由父级转给列表实例。
 */
import type { CatalogPageState } from '@/shared/resourceCatalogDisplay'

defineProps<{
  pageState: CatalogPageState
  pageNumbers: Array<number | '…'>
}>()

const emit = defineEmits<{
  (e: 'go-page', page: number): void
  (e: 'go-prev-page'): void
  (e: 'go-next-page'): void
}>()
</script>

<template>
  <nav class="catalog-pager" aria-label="结果分页">
    <button
      class="catalog-pager__btn"
      type="button"
      :disabled="!pageState.hasPrev"
      @click="emit('go-prev-page')"
    >
      上一页
    </button>
    <template v-for="(page, index) in pageNumbers" :key="`${page}-${index}`">
      <span v-if="page === '…'" class="catalog-pager__ellipsis" aria-hidden="true">…</span>
      <button
        v-else
        class="catalog-pager__btn"
        :class="{ 'catalog-pager__btn--active': page === pageState.current }"
        type="button"
        :aria-current="page === pageState.current ? 'page' : undefined"
        @click="emit('go-page', page)"
      >
        {{ page }}
      </button>
    </template>
    <button
      class="catalog-pager__btn"
      type="button"
      :disabled="!pageState.hasNext"
      @click="emit('go-next-page')"
    >
      下一页
    </button>
  </nav>
</template>
