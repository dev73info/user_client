<script setup lang="ts">
/**
 * 「我的需求」列表的客户端分页条：每页条数下拉 + 页码。
 *
 * 纯展示：页码与每页条数走 v-model 由列表页持有（`useClientPagination` 的 page / pageSize），
 * 样式全在统一层 `.wb-pager`，组件本身不带样式。
 */
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import { TOption, TPagination, TSelect } from 'ui_73info'

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
      <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页需求单数">
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
      aria-label="需求单分页"
    />
  </div>
</template>
