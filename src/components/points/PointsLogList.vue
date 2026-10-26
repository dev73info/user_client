<script setup lang="ts">
import {
  Refresh,
  TButton,
  TIcon,
  TPagination,
  TSelect,
  TOption,
  type SelectModelValue,
} from 'ui_73info'

import type { UserPointsLog } from '@/api/points'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import {
  pointsLogBadgeClass,
  pointsLogDeltaLabel,
  pointsLogMeta,
  pointsLogTitle,
} from '@/shared/pointsDisplay'

defineProps<{
  loading: boolean
  error: string
  rows: UserPointsLog[]
  allCount: number
  page: number
  pageSize: number
  total: number
}>()
const emit = defineEmits<{
  (e: 'reload'): void
  (e: 'page-change', page: number): void
  (e: 'page-size-change', value: SelectModelValue): void
}>()
</script>

<template>
  <p v-if="loading" class="wb-empty" role="status">正在加载积分明细…</p>
  <div v-else-if="error" class="wb-empty" role="alert">
    <span class="wb-empty__title">加载积分明细失败</span>{{ error }}
    <div class="wb-empty__actions">
      <TButton variant="outline" @click="emit('reload')">
        <TIcon><Refresh /></TIcon><span>重新加载</span>
      </TButton>
    </div>
  </div>
  <p v-else-if="!allCount" class="wb-empty" role="status">
    <span class="wb-empty__title">暂无积分明细</span>
  </p>
  <template v-else>
    <ul class="wb-list" aria-label="积分明细">
      <li v-for="row in rows" :key="row.id" class="wb-item">
        <div class="wb-item__main">
          <span class="wb-item__title">{{ pointsLogTitle(row) }}</span>
          <span class="wb-item__meta">{{ pointsLogMeta(row) }}</span>
        </div>
        <div class="wb-item__side">
          <span class="wb-badge" :class="pointsLogBadgeClass(row.delta)">
            {{ pointsLogDeltaLabel(row.delta) }}
          </span>
        </div>
      </li>
    </ul>
    <div class="wb-pager">
      <div class="wb-pager__count">
        <TSelect
          :model-value="pageSize"
          class="wb-pager__size"
          aria-label="每页明细数"
          @change="emit('page-size-change', $event)"
        >
          <TOption
            v-for="size in LIST_PAGE_SIZES"
            :key="size"
            :label="`${size} 条/页`"
            :value="size"
          />
        </TSelect>
      </div>
      <TPagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :pager-count="5"
        background
        aria-label="积分明细分页"
        @current-change="emit('page-change', $event)"
      />
    </div>
  </template>
</template>

<style scoped>
.points-records__panel--logs .wb-item__main {
  gap: 2px;
}
</style>
