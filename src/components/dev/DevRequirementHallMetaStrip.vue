<script setup lang="ts">
import { TButton, TIcon, Refresh } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

/**
 * 需求大厅顶部的读数条：命中需求单数 / 无电签 / 电签 + 刷新。
 *
 * 窄屏（≤1180 的工作台顶栏）里这整条由 `WorkbenchBarSlot` 搬进顶栏。
 * **不再显示「可用保证金」**：预付保证金在当前后端契约里没有端点，读不到真值，
 * 显示一个编出来的余额比不显示更糟（详见 `composables/useDevOrderGate.ts`）。
 */
defineProps<{
  /** 当前筛选条件下的命中的需求单总数（不是当前页行数） */
  total: number
  /** 命中行里无电签（自管）的条数 */
  selfManaged: number
  /** 命中行里电签担保的条数 */
  guarantee: number
  /** 列表刷新中（刷新按钮的转圈） */
  loading: boolean
}>()

const emit = defineEmits<{
  /** 重新拉列表 */
  refresh: []
}>()
</script>

<template>
  <WorkbenchBarSlot>
    <div class="dev-meta-strip">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">需求单</span>
        <span class="dev-meta-strip__value">{{ total }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">无电签</span>
        <span class="dev-meta-strip__value">{{ selfManaged }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">电签</span>
        <span class="dev-meta-strip__value">{{ guarantee }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新需求列表" @click="emit('refresh')">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>

<style scoped>
/* 顶栏宽度紧：刷新钉在右侧，读数再挤也只在左边折行 */
#workbench-mobile-bar-extra .dev-meta-strip {
  position: relative;
  padding-right: 32px;
}

#workbench-mobile-bar-extra .dev-meta-strip__action {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}
</style>
