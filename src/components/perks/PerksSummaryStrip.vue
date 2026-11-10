<script setup lang="ts">
/**
 * 「我的权益」页顶部的读数条（全部 / 已解锁 / 已佩戴）。
 *
 * 读数同时是列表筛选入口：点哪格就把下方权益列表收窄到哪一档。
 * 计数保持改造前的全量口径（含用户名颜色设置里的权益），不随筛选变化；
 * 移动端由 `WorkbenchBarSlot` 搬进工作台顶栏。
 */
import { Refresh, TButton, TIcon } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

const props = defineProps<{
  loading: boolean
  /** 加载失败：读数暂不报数 */
  failed: boolean
  /** 全部权益（含用户名颜色类目） */
  total: number
  owned: number
  equipped: number
}>()

const emit = defineEmits<{ refresh: [] }>()

const filter = defineModel<'all' | 'owned' | 'equipped'>('filter', { required: true })

function stripValue(count: number) {
  return props.loading || props.failed ? '—' : count
}
</script>

<template>
  <WorkbenchBarSlot>
    <div class="wb-strip" aria-label="权益概览">
      <button
        class="wb-strip__item wb-strip__item--filter"
        :class="{ 'is-active': filter === 'all' }"
        type="button"
        :aria-pressed="filter === 'all'"
        @click="filter = 'all'"
      >
        <span class="wb-strip__label">全部权益</span>
        <span class="wb-strip__value">{{ stripValue(total) }}</span>
      </button>
      <span class="wb-strip__divider" aria-hidden="true" />
      <button
        class="wb-strip__item wb-strip__item--filter"
        :class="{ 'is-active': filter === 'owned' }"
        type="button"
        :aria-pressed="filter === 'owned'"
        @click="filter = 'owned'"
      >
        <span class="wb-strip__label">已解锁权益</span>
        <span class="wb-strip__value">{{ stripValue(owned) }}</span>
      </button>
      <span class="wb-strip__divider" aria-hidden="true" />
      <button
        class="wb-strip__item wb-strip__item--filter"
        :class="{ 'is-active': filter === 'equipped' }"
        type="button"
        :aria-pressed="filter === 'equipped'"
        @click="filter = 'equipped'"
      >
        <span class="wb-strip__label">已佩戴权益</span>
        <span class="wb-strip__value">{{ stripValue(equipped) }}</span>
      </button>
      <div class="wb-strip__item wb-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新权益" @click="emit('refresh')">
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
