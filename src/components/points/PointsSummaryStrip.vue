<script setup lang="ts">
/**
 * 积分中心顶部读数条。
 *
 * 读数在最左、页面级刷新固定在右上角 `__action` 槽；工作台外壳由 `WorkbenchBarSlot`
 * 统一提供，这一块只负责把三个数字排好。
 */
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

defineProps<{
  loading: boolean
  transferLoading: boolean
  pointsBalance: number
  transferCount: number
  logTotal: number
  refreshing: boolean
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()
</script>

<template>
  <WorkbenchBarSlot>
    <div class="wb-strip" aria-label="积分概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">积分余额</span>
        <span class="wb-strip__value">{{ loading ? '—' : pointsBalance }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">打赏记录</span>
        <span class="wb-strip__value">{{ transferLoading ? '—' : transferCount }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">积分明细</span>
        <span class="wb-strip__value">{{ loading ? '—' : logTotal }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <TButton icon-only :loading="refreshing" aria-label="刷新积分数据" @click="emit('refresh')">
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
