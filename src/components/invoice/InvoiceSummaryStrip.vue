<script setup lang="ts">
/**
 * 发票页顶部读数条。
 *
 * 读数在左、页面级刷新固定在右上角 `__action` 槽；工作台外壳由 `WorkbenchBarSlot` 统一提供，
 * 这一块只负责把四个数字排好。
 *
 * 三格同时是状态筛选入口（全部 / 已开具 / 已红冲），点击写回页面持有的 `statusFilter`，
 * 与工具栏下拉同步。「处理中」是 requested ∪ under_review 两档的合计，现有筛选没有等价的单值档，
 * 加档等于新增筛选口径，所以这一格保持只读。
 */
import type { InvoiceRecord } from '@/api/invoices'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

defineProps<{
  loading: boolean
  stats: { total: number; pending: number; approved: number; reversed: number }
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()

const status = defineModel<'all' | InvoiceRecord['status']>('status', { required: true })
</script>

<template>
  <WorkbenchBarSlot>
    <div class="wb-strip" aria-label="发票概览">
      <button
        class="wb-strip__item wb-strip__item--filter"
        :class="{ 'is-active': status === 'all' }"
        type="button"
        :aria-pressed="status === 'all'"
        @click="status = 'all'"
      >
        <span class="wb-strip__label">全部记录</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.total }}</span>
      </button>
      <span class="wb-strip__divider" aria-hidden="true" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">处理中</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.pending }}</span>
      </div>
      <span class="wb-strip__divider" aria-hidden="true" />
      <button
        class="wb-strip__item wb-strip__item--filter"
        :class="{ 'is-active': status === 'approved' }"
        type="button"
        :aria-pressed="status === 'approved'"
        @click="status = 'approved'"
      >
        <span class="wb-strip__label">已开具</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.approved }}</span>
      </button>
      <span class="wb-strip__divider" aria-hidden="true" />
      <button
        class="wb-strip__item wb-strip__item--filter"
        :class="{ 'is-active': status === 'reversed' }"
        type="button"
        :aria-pressed="status === 'reversed'"
        @click="status = 'reversed'"
      >
        <span class="wb-strip__label">已红冲</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.reversed }}</span>
      </button>
      <div class="wb-strip__item wb-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新发票记录" @click="emit('refresh')">
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
