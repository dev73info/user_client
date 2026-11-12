<script setup lang="ts">
import { computed } from 'vue'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

import { Refresh, TButton, TIcon } from 'ui_73info'

/**
 * 「我的已购资源」页头读数条：四个分状态总数 + 刷新。
 *
 * 读数格同时是状态筛选入口：点击写回页面持有的 `statusFilter`（'all' / 'paid' /
 * 'refunding' / 'refunded'），与工具栏下拉双向同步；读数来自服务端 `X-Total-Count`
 * （不受当前筛选影响），加载中统一显示破折号。
 */
const props = defineProps<{
  stats: { all: number; paid: number; refunding: number; refunded: number }
  loading: boolean
  statsLoading: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const status = defineModel<string>('status', { required: true })

const tabs = computed(() => [
  { value: 'all', label: '订单数', count: props.stats.all },
  { value: 'paid', label: '有效已购', count: props.stats.paid },
  { value: 'refunding', label: '退款中', count: props.stats.refunding },
  { value: 'refunded', label: '已退款', count: props.stats.refunded },
])

function stripValue(count: number) {
  return props.statsLoading ? '—' : String(count)
}
</script>

<template>
  <WorkbenchBarSlot>
    <div class="wb-strip" aria-label="已购资源概览">
      <template v-for="(tab, index) in tabs" :key="tab.value">
        <span v-if="index > 0" class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': status === tab.value }"
          type="button"
          :aria-pressed="status === tab.value"
          @click="status = tab.value"
        >
          <span class="wb-strip__label">{{ tab.label }}</span>
          <span class="wb-strip__value">{{ stripValue(tab.count) }}</span>
        </button>
      </template>
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
