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
import { pointsLogDeltaLabel, pointsLogTitle } from '@/shared/pointsDisplay'

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
  <p v-if="loading" class="points-table-state" role="status">正在加载积分明细…</p>
  <div v-else-if="error" class="points-table-state" role="alert">
    <p>加载积分明细失败：{{ error }}</p>
    <TButton variant="outline" @click="emit('reload')">
      <TIcon><Refresh /></TIcon><span>重新加载</span>
    </TButton>
  </div>
  <p v-else-if="!allCount" class="points-table-state" role="status">暂无积分明细</p>
  <template v-else>
    <div class="points-table-wrap">
      <table class="points-table" aria-label="积分明细">
        <thead>
          <tr>
            <th>变动原因 / 交易凭据</th>
            <th>变动时间</th>
            <th class="is-num">变动值</th>
            <th class="is-num">变动后余额</th>
            <th class="is-center">凭据状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <div class="points-table__title">{{ pointsLogTitle(row) }}</div>
              <div class="points-table__meta">ID #{{ row.id }}</div>
            </td>
            <td class="points-table__time">{{ row.created_at }}</td>
            <td class="is-num" :class="row.delta > 0 ? 'is-plus' : 'is-minus'">
              {{ pointsLogDeltaLabel(row.delta) }} PTS
            </td>
            <td class="is-num points-table__balance">{{ row.balance_after }} PTS</td>
            <td class="is-center">
              <span class="points-pill" :class="row.delta > 0 ? 'is-success' : 'is-muted'">
                {{ row.delta > 0 ? '已入账' : '已扣除' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="points-pager">
      <span
        >共 <strong>{{ total }}</strong> 条记录，每页显示
        <strong>{{ pageSize }}</strong> 条</span
      >
      <div class="points-pager__right">
        <TSelect
          :model-value="pageSize"
          class="points-pager__size"
          aria-label="每页明细数"
          @change="emit('page-size-change', $event)"
        >
          <TOption
            v-for="size in LIST_PAGE_SIZES"
            :key="size"
            :label="String(size)"
            :value="size"
          />
        </TSelect>
        <TPagination
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          :pager-count="5"
          :show-total="false"
          aria-label="积分明细分页"
          @current-change="emit('page-change', $event)"
        />
      </div>
    </div>
  </template>
</template>

<style scoped>
.points-table-state {
  margin: 0;
  padding: 48px 20px;
  color: var(--73-ink-muted);
  font-size: 13px;
  text-align: center;
}

.points-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.points-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.points-table th {
  padding: 10px 20px;
  border-bottom: 1px solid var(--73-border);
  background: color-mix(in srgb, var(--73-bg) 70%, var(--73-surface));
  color: var(--73-ink-muted);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}

.points-table th:first-child {
  width: 40%;
}

.points-table th:last-child {
  width: 96px;
}

.points-table td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--73-border-soft);
  vertical-align: middle;
}

.points-table tbody tr {
  transition: background-color var(--73-transition);
}

.points-table tbody tr:hover {
  background: color-mix(in srgb, var(--73-bg) 60%, transparent);
}

.points-table .is-num {
  text-align: right;
  font-family: var(--73-font-family-mono);
  font-variant-numeric: tabular-nums;
}

.points-table .is-center {
  text-align: center;
  white-space: nowrap;
}

.points-table__title {
  color: var(--73-ink);
  font-weight: 500;
  line-height: 1.45;
}

.points-table__meta {
  margin-top: 2px;
  color: var(--73-ink-placeholder);
  font-family: var(--73-font-family-mono);
  font-size: 11px;
}

.points-table__time {
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 12px;
  white-space: nowrap;
}

.points-table__balance {
  color: var(--73-ink);
  font-weight: 500;
}

.points-table .is-plus {
  color: var(--73-success-text);
  font-weight: 600;
}

.points-table .is-minus {
  color: var(--73-danger);
  font-weight: 600;
}

.points-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid var(--73-border);
  border-radius: 4px;
  background: var(--73-inset);
  color: var(--73-ink-muted);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.points-pill.is-success {
  border-color: var(--73-success-line);
  background: var(--73-success-soft);
  color: var(--73-success-text);
}

.points-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 20px;
  border-top: 1px solid var(--73-border);
  color: var(--73-ink-muted);
  font-size: 13px;
}

.points-pager strong {
  color: var(--73-ink);
  font-family: var(--73-font-family-mono);
  font-weight: 600;
}

.points-pager__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.points-pager__size {
  width: 96px;
}

.points-pager :deep(.t73-pagination__button) {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 12px;
}

.points-pager :deep(.t73-pagination__button:hover:not(:disabled)) {
  background: var(--73-bg-soft);
  color: var(--73-ink);
}

.points-pager :deep(.t73-pagination__page--active) {
  background: var(--73-accent);
  color: var(--73-accent-contrast);
  font-weight: 600;
}

.points-pager :deep(.t73-pagination__button:disabled) {
  opacity: 0.4;
}
</style>
