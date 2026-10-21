<script setup lang="ts">
/**
 * 发票页顶部读数条。
 *
 * 读数在左、页面级刷新固定在右上角 `__action` 槽；工作台外壳由 `WorkbenchBarSlot` 统一提供，
 * 这一块只负责把四个数字排好。
 */
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

defineProps<{
  loading: boolean
  stats: { total: number; pending: number; approved: number; reversed: number }
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()
</script>

<template>
  <WorkbenchBarSlot>
    <div class="wb-strip" aria-label="发票概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">全部记录</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.total }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">处理中</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.pending }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已开具</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.approved }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已红冲</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.reversed }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新发票记录" @click="emit('refresh')">
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
