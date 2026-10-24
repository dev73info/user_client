<script setup lang="ts">
/**
 * 顶部读数条：三格口径读数 + 右侧「刷新」；平板档整条被 `WorkbenchBarSlot` 搬进工作台顶栏
 * 顶替标题（桌面端原地渲染）。
 *
 * 从 `views/DevHomeView.vue` 抽出来。读数（进行中 / 待交付 / 已完成）的**数值**由视图给：
 * 它们从「我的需求」的 `status` 现算，口径留在 `useDevHomeBoard`——组件只画，刷新 `emit` 出去。
 */
import { Refresh, TButton, TIcon, TLoading } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import type { DevHomeStatCard } from '@/shared/devHomeDisplay'

defineProps<{
  /** 加载中：读数区出骨架，刷新按钮转圈。 */
  loading: boolean
  /** 三格读数：标签 + 已格式化好的数字（没读到数据时是「—」）。 */
  cards: DevHomeStatCard[]
}>()

const emit = defineEmits<{
  refresh: []
}>()
</script>

<template>
  <WorkbenchBarSlot>
    <TLoading tag="div" class="dev-meta-strip" aria-label="接单与收入概览" :loading="loading">
      <template v-for="(item, index) in cards" :key="item.label">
        <div v-if="index > 0" class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">{{ item.label }}</span>
          <span class="dev-meta-strip__value">{{ item.value }}</span>
        </div>
      </template>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新概览" @click="emit('refresh')">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </TLoading>
  </WorkbenchBarSlot>
</template>
