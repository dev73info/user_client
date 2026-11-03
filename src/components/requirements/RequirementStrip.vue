<script setup lang="ts">
/**
 * 「我的需求」页顶部的状态页签（全部 / 审核中 / 开发中 / 已完成）。
 *
 * 结构对齐 Stitch 源码「用户工作台 - 我的需求（清爽品牌蓝标准版）」：
 * 原来的四格读数条收成一枚分段控件，读数变成页签上的计数，点击即切换状态筛选；
 * 右侧保留页面级刷新。计数口径仍来自 `RequirementBucketSummary`。
 *
 * 移动端由 `WorkbenchBarSlot` 把整条搬进工作台顶栏（Teleport），桌面端原地渲染。
 */
import { computed } from 'vue'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import type { RequirementBucketSummary, RequirementFilterKey } from '@/shared/requirementStatus'
import { REQUIREMENT_FILTER_OPTIONS } from '@/shared/requirementStatus'
import { Refresh, TButton, TIcon } from 'ui_73info'

const props = defineProps<{
  /** 四格读数：全部 / 审核中 / 开发中 / 已完成 */
  stats: RequirementBucketSummary
  /** 列表或会话在加载：读数暂不报数，刷新按钮转圈 */
  loading: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

/** 当前生效的档位：点页签直接写回页面持有的筛选状态 */
const selectedState = defineModel<RequirementFilterKey>('selectedState', { required: true })

const counts = computed<Record<RequirementFilterKey, number>>(() => ({
  all: props.stats.total,
  pending: props.stats.pending,
  active: props.stats.active,
  completed: props.stats.completed,
}))

/** 页签顺序与文案沿用状态下拉的同一份选项，不再各写一遍 */
const tabs = computed(() =>
  REQUIREMENT_FILTER_OPTIONS.map((option) => ({
    ...option,
    count: counts.value[option.value],
  })),
)

/* 读数在加载中不报数：重新加载会先清空列表，直接显示 0 会被读成「一条需求都没有」。 */
function stripValue(count: number) {
  return props.loading ? '—' : String(count)
}

/** 刷新按钮只有一个图标，加载态与说明都靠 aria-label / title 承载。 */
const refreshButtonLabel = computed(() => (props.loading ? '刷新中...' : '刷新'))
</script>

<template>
  <WorkbenchBarSlot>
    <div class="my-requirements-tabs">
      <div class="my-requirements-tabs__group" role="tablist" aria-label="需求状态筛选">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="my-requirements-tabs__tab"
          :class="{ 'my-requirements-tabs__tab--active': selectedState === tab.value }"
          type="button"
          role="tab"
          :aria-selected="selectedState === tab.value"
          @click="selectedState = tab.value"
        >
          <span>{{ tab.label }}</span>
          <span class="my-requirements-tabs__count">{{ stripValue(tab.count) }}</span>
        </button>
      </div>
      <TButton
        class="my-requirements-tabs__refresh"
        icon-only
        :loading="loading"
        :aria-label="refreshButtonLabel"
        :title="refreshButtonLabel"
        @click="emit('refresh')"
      >
        <TIcon><Refresh /></TIcon>
      </TButton>
    </div>
  </WorkbenchBarSlot>
</template>

<style scoped>
/* 状态页签卡：设计稿是一枚白色分段控件（4px 内衬 + 32px 页签） */
.my-requirements-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.my-requirements-tabs__group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface);
  box-shadow: 0 10px 30px color-mix(in srgb, var(--73-accent) 6%, transparent);
}

.my-requirements-tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--73-ink-muted);
  font-family: inherit;
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--73-transition),
    color var(--73-transition);
}

.my-requirements-tabs__tab:hover:not(.my-requirements-tabs__tab--active) {
  background: var(--73-bg-soft);
  color: var(--73-ink);
}

.my-requirements-tabs__tab--active {
  background: color-mix(in srgb, var(--73-accent) 8%, transparent);
  color: var(--73-accent);
  font-weight: 600;
}

.my-requirements-tabs__count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--73-inset);
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
}

.my-requirements-tabs__tab--active .my-requirements-tabs__count {
  background: transparent;
  color: var(--73-accent);
}

.my-requirements-tabs__refresh {
  margin-left: auto;
}

/* 移动端：读数条被 Teleport 进顶栏，页签横向排开、可滚动，刷新钉在右端 */
@media (max-width: 640px) {
  #workbench-mobile-bar-extra .my-requirements-tabs {
    gap: 8px;
  }

  #workbench-mobile-bar-extra .my-requirements-tabs__group {
    flex: 1 1 auto;
    min-width: 0;
    padding: 2px;
    border-radius: 10px;
    overflow-x: auto;
  }

  #workbench-mobile-bar-extra .my-requirements-tabs__tab {
    height: 28px;
    padding: 0 8px;
    font-size: 12px;
  }

  #workbench-mobile-bar-extra .my-requirements-tabs__count {
    font-size: 11px;
  }

  #workbench-mobile-bar-extra .my-requirements-tabs__refresh {
    flex: 0 0 auto;
  }
}
</style>
