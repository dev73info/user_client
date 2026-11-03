<script setup lang="ts">
import { TPagination, TSelect, TOption } from 'ui_73info'

import type { PointsTransfer } from '@/api/points'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import {
  pointsSelfName,
  pointsTransferStatusLabel,
} from '@/shared/pointsDisplay'

const props = defineProps<{
  loading: boolean
  rows: PointsTransfer[]
  total: number
  allCount: number
  page: number
  pageSize: number
  username: string
}>()

const emit = defineEmits<{
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', pageSize: number): void
}>()

/** 方向只影响展示：我收到的写 +到账，我支出的写 -金额。 */
function directionOf(transfer: PointsTransfer) {
  return transfer.to_username === props.username ? 'received' : 'sent'
}

function counterpart(transfer: PointsTransfer) {
  return directionOf(transfer) === 'received' ? transfer.from_username : transfer.to_username
}

function deltaLabel(transfer: PointsTransfer) {
  return directionOf(transfer) === 'received'
    ? `+${transfer.received} PTS`
    : `-${transfer.amount} PTS`
}

function statusClass(transfer: PointsTransfer) {
  const label = pointsTransferStatusLabel(transfer)
  if (label === '已完成') return 'is-success'
  if (label === '待审核') return 'is-warning'
  return 'is-danger'
}
</script>

<template>
  <p v-if="loading" class="points-table-state" role="status">正在加载打赏记录…</p>
  <p v-else-if="!rows.length" class="points-table-state" role="status">
    {{ allCount ? '没有符合条件的打赏记录' : '暂无打赏记录' }}
  </p>
  <template v-else>
    <div class="points-table-wrap">
      <table class="points-table" aria-label="打赏记录">
        <thead>
          <tr>
            <th>双方 (发起人 / 接收人)</th>
            <th>变动时间</th>
            <th>附言说明</th>
            <th class="is-num">手续费</th>
            <th class="is-num">±积分变动</th>
            <th class="is-center">审核态</th>
            <th>审核说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="transfer in rows" :key="transfer.id">
            <td>
              <div class="points-table__parties">
                <span
                  class="points-table__dir"
                  :class="directionOf(transfer) === 'received' ? 'is-success' : 'is-accent'"
                >
                  {{ directionOf(transfer) === 'received' ? '我收到' : '我支出' }}
                </span>
                <span class="points-table__name">{{
                  pointsSelfName(counterpart(transfer), username)
                }}</span>
              </div>
            </td>
            <td class="points-table__time">{{ transfer.created_at }}</td>
            <td class="points-table__note">{{ transfer.note || '—' }}</td>
            <td class="is-num points-table__fee">
              {{ transfer.fee > 0 ? `${transfer.fee} PTS` : '—' }}
            </td>
            <td
              class="is-num"
              :class="directionOf(transfer) === 'received' ? 'is-plus' : 'is-minus'"
            >
              {{ deltaLabel(transfer) }}
            </td>
            <td class="is-center">
              <span class="points-pill" :class="statusClass(transfer)">{{
                pointsTransferStatusLabel(transfer)
              }}</span>
            </td>
            <td class="points-table__note">{{ transfer.review_note || '—' }}</td>
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
          aria-label="每页打赏记录数"
          @update:model-value="emit('update:pageSize', Number($event))"
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
          aria-label="打赏记录分页"
          @update:current-page="emit('update:page', $event)"
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

.points-table td {
  padding: 12px 20px;
  border-bottom: 1px solid var(--73-border-soft);
  vertical-align: middle;
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
}

.points-table__parties {
  display: flex;
  align-items: center;
  gap: 8px;
}

.points-table__dir {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.points-table__dir.is-success {
  background: var(--73-success-soft);
  color: var(--73-success-text);
}

.points-table__dir.is-accent {
  background: var(--73-accent-soft);
  color: var(--73-accent);
}

.points-table__name {
  color: var(--73-ink);
  font-family: var(--73-font-family-mono);
  font-weight: 500;
}

.points-table__time {
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 12px;
  white-space: nowrap;
}

.points-table__note {
  max-width: 220px;
  overflow: hidden;
  color: var(--73-ink-soft);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.points-table__fee {
  color: var(--73-ink-placeholder);
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
  padding: 1px 8px;
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

.points-pill.is-warning {
  border-color: var(--73-warning-line);
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
}

.points-pill.is-danger {
  border-color: color-mix(in srgb, var(--73-danger) 32%, transparent);
  background: color-mix(in srgb, var(--73-danger) 8%, transparent);
  color: var(--73-danger);
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
