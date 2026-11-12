<script setup lang="ts">
/**
 * 需求方「我的资源」页顶部的读数条（资源总数 / 公开 / 审核中 / 私有）。
 *
 * 读数格同时是可见性筛选入口：点击写回页面持有的 `filters.visibility`
 * （空串 = 全部），与工具栏下拉双向同步；加载中统一显示破折号，
 * 移动端由 `WorkbenchBarSlot` 整条搬进工作台顶栏。
 */
import { computed } from 'vue'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import type { DevResourceVisibilityFilter } from '@/shared/devResourceList'
import { Refresh, TButton, TIcon } from 'ui_73info'

const props = defineProps<{
  /** 资源总数（已滤掉团队资源） */
  total: number
  /** 已公开的条数 */
  published: number
  /** 审核中的条数 */
  review: number
  /** 私有的条数 */
  draft: number
  /** 列表刷新中：读数不报数，刷新按钮转圈 */
  loading: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

const visibility = defineModel<DevResourceVisibilityFilter>('visibility', { required: true })

const tabs = computed<{ value: DevResourceVisibilityFilter; label: string; count: number }[]>(
  () => [
    { value: '', label: '资源总数', count: props.total },
    { value: 'published', label: '公开', count: props.published },
    { value: 'review', label: '审核中', count: props.review },
    { value: 'draft', label: '私有', count: props.draft },
  ],
)

/* 读数在加载中不报数：重新加载会先清空列表，直接显示 0 会被读成「一条资源都没有」。 */
function stripValue(count: number) {
  return props.loading ? '—' : String(count)
}
</script>

<template>
  <WorkbenchBarSlot>
    <div class="wb-strip" aria-label="资源概览">
      <template v-for="(tab, index) in tabs" :key="tab.value">
        <span v-if="index > 0" class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': visibility === tab.value }"
          type="button"
          :aria-pressed="visibility === tab.value"
          @click="visibility = tab.value"
        >
          <span class="wb-strip__label">{{ tab.label }}</span>
          <span class="wb-strip__value">{{ stripValue(tab.count) }}</span>
        </button>
      </template>
      <div class="wb-strip__item wb-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新资源列表" @click="emit('refresh')">
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
