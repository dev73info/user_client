<script setup lang="ts">
import WorkbenchPager from '@/components/workbench/WorkbenchPager.vue'

/**
 * 「系统通知」的分页条：左边选每页条数，右边翻页。
 *
 * 外观与其余工作台菜单页共用 `WorkbenchPager`（`.wb-pager` 结构）；
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
  <WorkbenchPager
    v-model:page="page"
    v-model:page-size="pageSize"
    :total="total"
    unit="条通知"
    page-size-aria-label="每页通知数"
    pagination-aria-label="系统通知分页"
  />
</template>
