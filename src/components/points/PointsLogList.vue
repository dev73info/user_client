<script setup lang="ts">
/** 积分流水表：只渲染当前页的账目行；加载 / 错误 / 空态与分页由页面承担。 */
import type { UserPointsLog } from '@/api/points'
import { pointsLogDeltaLabel, pointsLogTitle } from '@/shared/pointsDisplay'

defineProps<{ rows: UserPointsLog[] }>()
</script>

<template>
  <div class="points-table-wrap">
    <table class="points-table" aria-label="积分记录">
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
</template>

<style scoped>
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
</style>
