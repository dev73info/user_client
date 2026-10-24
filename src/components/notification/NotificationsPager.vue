<script setup lang="ts">
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { TOption, TPagination, TSelect } from 'ui_73info'

/**
 * 「系统通知」的分页条：左边选每页条数，右边翻页。
 *
 * 口径与我的合同一致（客户端分页，`LIST_PAGE_SIZES` 三档）；
 * 页码与每页条数都是双向绑定，越界收回由 `useClientPagination` 兜底，这里不重复判断。
 */
defineProps<{
  /** 筛选后的总条数 */
  total: number
}>()

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })
</script>

<template>
  <div class="wb-pager">
    <div class="wb-pager__count">
      <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页条数">
        <TOption
          v-for="size in LIST_PAGE_SIZES"
          :key="size"
          :label="`${size} 条/页`"
          :value="size"
        />
      </TSelect>
    </div>
    <TPagination
      v-model:current-page="page"
      :page-size="pageSize"
      :total="total"
      :pager-count="5"
      background
      aria-label="系统通知分页"
    />
  </div>
</template>
