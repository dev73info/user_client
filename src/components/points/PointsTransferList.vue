<script setup lang="ts">
/**
 * 「打赏记录」这一段：逐条打赏 + 前端分页。
 *
 * 一次全量取回（上限 50 条）、筛选与分页都在前端做，所以页码翻的是**前端切好的那一段**
 * （见 `usePointsTransfer` 里的 `useClientPagination`）。
 *
 * 组件只做展示与事件上报：翻页、换每页条数由页面（`usePointsCenter`）处理。
 */
import { TPagination, TSelect, TOption } from 'ui_73info'

import type { PointsTransfer } from '@/api/points'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import {
  pointsSelfName,
  pointsTransferBadgeClass,
  pointsTransferBadgeLabel,
  pointsTransferMeta,
} from '@/shared/pointsDisplay'

const props = defineProps<{
  loading: boolean
  /** 当前页的行 */
  rows: PointsTransfer[]
  /** 筛选后的总条数 */
  total: number
  /** 一次取回的全部条数：空态要分清「筛没了」与「本来就没有」 */
  allCount: number
  page: number
  pageSize: number
  username: string
}>()

const emit = defineEmits<{
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', pageSize: number): void
}>()
</script>

<template>
  <p v-if="loading" class="wb-empty" role="status">正在加载打赏记录…</p>
  <div v-else-if="!rows.length" class="wb-empty" role="status">
    <span class="wb-empty__title">{{ allCount ? '没有符合条件的打赏记录' : '暂无打赏记录' }}</span>
  </div>
  <template v-else>
    <ul class="wb-list" aria-label="打赏记录">
      <li v-for="t in rows" :key="t.id" class="wb-item">
        <div class="wb-item__main">
          <span class="wb-item__title">
            {{ pointsSelfName(t.from_username, props.username) }}
            <span aria-hidden="true">→</span>
            {{ pointsSelfName(t.to_username, props.username) }}
          </span>
          <span class="wb-item__meta">
            {{ pointsTransferMeta(t) }}
          </span>
        </div>
        <div class="wb-item__side">
          <span class="wb-badge" :class="pointsTransferBadgeClass(t, props.username)">
            {{ pointsTransferBadgeLabel(t, props.username) }}
          </span>
        </div>
      </li>
    </ul>
    <div class="wb-pager">
      <div class="wb-pager__count">
        <TSelect
          :model-value="pageSize"
          class="wb-pager__size"
          aria-label="每页打赏记录数"
          @update:model-value="emit('update:pageSize', Number($event))"
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
        aria-label="打赏记录分页"
        @update:current-page="emit('update:page', $event)"
      />
    </div>
  </template>
</template>
