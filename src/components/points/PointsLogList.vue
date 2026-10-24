<script setup lang="ts">
/**
 * 「积分明细」这一段：逐条积分变动 + 服务端分页。
 *
 * 明细走**服务端**分页（`/points/me` 带 page / page_size），页码与每页条数一变就要回后端
 * 重取，所以这里只上报「翻到第几页 / 换每页多少条」，取数在 `usePointsLedger` 里。
 *
 * 组件只做展示与事件上报，不发请求。
 */
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
  /** 当前页的行 */
  rows: UserPointsLog[]
  /** 手上这一份明细的条数：空态据此判断是「没有明细」 */
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
/* 明细里「原因 + 时间」两行贴紧：统一层的 __meta 行距按普通行给，这里行数多、收紧一点。
   打赏段的行保持统一层默认间距，它只有两行且标题里带箭头，再压就看不清是两段了。 */
.points-records__panel--logs .wb-item__main {
  gap: 2px;
}
</style>
