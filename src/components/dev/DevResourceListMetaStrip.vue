<script setup lang="ts">
import { TButton, TIcon, Refresh } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

/**
 * 资源列表顶部的读数条：资源总数 / 公开 / 审核中 / 私有 + 刷新。
 *
 * 窄屏（≤1180 的工作台顶栏）里这整条由 `WorkbenchBarSlot` 搬进顶栏，
 * 与需求大厅、团队资源那几条读数条同一形态。
 */
defineProps<{
  /** 自有资源总数（已滤掉团队资源） */
  total: number
  /** 已公开的条数 */
  published: number
  /** 审核中的条数 */
  review: number
  /** 私有的条数 */
  draft: number
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
        <span class="dev-meta-strip__label">资源总数</span>
        <span class="dev-meta-strip__value">{{ total }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">公开</span>
        <span class="dev-meta-strip__value">{{ published }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">审核中</span>
        <span class="dev-meta-strip__value">{{ review }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">私有</span>
        <span class="dev-meta-strip__value">{{ draft }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新资源列表" @click="emit('refresh')">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
