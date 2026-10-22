<script setup lang="ts">
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

import { Refresh, TButton, TIcon } from 'ui_73info'

/**
 * 「我的已购资源」页头读数条：四个分状态总数 + 刷新。
 * 读数来自服务端 `X-Total-Count`（不受当前筛选影响），加载中统一显示破折号。
 */
const props = defineProps<{
  stats: { all: number; paid: number; refunding: number; refunded: number }
  loading: boolean
  statsLoading: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

function stripValue(count: number) {
  return props.statsLoading ? '—' : String(count)
}
</script>

<template>
  <WorkbenchBarSlot>
    <div class="wb-strip" aria-label="已购资源概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">订单数</span>
        <span class="wb-strip__value">{{ stripValue(stats.all) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">有效已购</span>
        <span class="wb-strip__value">{{ stripValue(stats.paid) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">退款中</span>
        <span class="wb-strip__value">{{ stripValue(stats.refunding) }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已退款</span>
        <span class="wb-strip__value">{{ stripValue(stats.refunded) }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <TButton
          icon-only
          :loading="loading || statsLoading"
          aria-label="刷新已购列表"
          @click="emit('refresh')"
        >
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
