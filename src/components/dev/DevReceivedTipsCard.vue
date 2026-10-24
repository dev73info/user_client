<script setup lang="ts">
import { computed } from 'vue'

import type { TipOrder } from '@/api/tips'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { formatBackendDateTime } from '@/shared/datetime'
import { tipOrderAmountLabel, tipStatusLabel } from '@/shared/devTip'

import { TPagination, TOption, TSelect, TTable, TTableColumn, TTag } from 'ui_73info'

/**
 * R010「收到打赏」只读列表：本人收到的打赏（含未公开），前端分页。
 * 行数据由页面一次取回（`GET /api/tips/received` 不分页），这里只负责分页与渲染。
 * 打赏只有现金一种形态，金额是整数分（`amount_fen`），展示时统一走 `tipOrderAmountLabel`。
 */
const props = defineProps<{
  received: TipOrder[]
  receivedLoading: boolean
}>()

const {
  page,
  pageSize,
  total: receivedTotal,
  paged,
} = useClientPagination(computed(() => props.received))
</script>

<template>
  <TTable
    :loading="receivedLoading"
    :data="paged"
    stripe
    class="dev-table tip-settings__table"
    aria-label="收到打赏列表"
  >
    <template #empty>
      <p class="dev-empty-state">还没有收到打赏</p>
    </template>
    <TTableColumn label="时间" min-width="160">
      <template #default="scope">
        <span>{{ formatBackendDateTime(scope.row.created_at) }}</span>
      </template>
    </TTableColumn>
    <TTableColumn label="金额" min-width="120">
      <template #default="scope">
        <span class="tip-settings__amount">{{ tipOrderAmountLabel(scope.row) }}</span>
      </template>
    </TTableColumn>
    <TTableColumn label="状态" min-width="100">
      <template #default="scope">
        <TTag variant="outline" :tone="scope.row.status === 'paid' ? 'accent' : 'warning'">
          {{ tipStatusLabel(scope.row.status) }}
        </TTag>
      </template>
    </TTableColumn>
    <TTableColumn label="打赏者" min-width="140">
      <template #default="scope">
        <span>{{ scope.row.anonymous ? '匿名' : scope.row.tipper }}</span>
      </template>
    </TTableColumn>
    <TTableColumn label="留言" min-width="200">
      <template #default="scope">
        <span>{{ scope.row.message || '—' }}</span>
      </template>
    </TTableColumn>
  </TTable>

  <div class="dev-pager">
    <div class="dev-pager__count">
      <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
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
      :total="receivedTotal"
      :pager-count="5"
      background
      aria-label="收到打赏分页"
    />
  </div>
</template>

<style scoped src="./tip-received-tips-card.css"></style>
