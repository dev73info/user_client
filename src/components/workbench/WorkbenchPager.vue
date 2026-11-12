<script setup lang="ts">
/**
 * 工作台菜单页统一的表尾分页。
 *
 * 结构完全交给统一层 `.wb-pager`（本组件不带样式）：发票、已购两页靠
 * `.wb-pager { margin-top: auto }` 把分页器沉到纸底，根类名不能换。
 * 页码文案、每页条数档位与既有的 `.wb-pager` 实现一致；服务端分页页把
 * `@update:page` / `@update:page-size` 显式接回自己的请求处理函数。
 */
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { TOption, TPagination, TSelect } from 'ui_73info'

withDefaults(
  defineProps<{
    /** 当前筛选条件下的总条数 */
    total: number
    /** 条数单位：份合同 / 条记录 / 条订单 / 个资源 */
    unit?: string
    pageSizeAriaLabel?: string
    paginationAriaLabel: string
  }>(),
  { unit: '条记录', pageSizeAriaLabel: '每页条数' },
)

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })
</script>

<template>
  <div class="wb-pager">
    <div class="wb-pager__count">
      <span class="wb-pager__total"
        >共 <strong>{{ total }}</strong> {{ unit }}</span
      >
      <TSelect v-model="pageSize" class="wb-pager__size" :aria-label="pageSizeAriaLabel">
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
      :show-total="false"
      background
      :aria-label="paginationAriaLabel"
    />
  </div>
</template>
