<script setup lang="ts">
/**
 * 「我的需求」页顶部的读数条（全部 / 审核中 / 开发中 / 已完成）。
 *
 * 结构与「我的合同」页的 `.wb-strip` 完全一致：左侧四格读数、最右侧页面级刷新；
 * 读数同时是状态筛选入口，点击后写回页面持有的筛选状态。计数口径仍来自
 * `RequirementBucketSummary`，移动端由 `WorkbenchBarSlot` 搬进工作台顶栏。
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

/** 读数顺序与文案沿用状态下拉的同一份选项，不再各写一遍 */
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
    <div class="wb-strip my-requirements-strip" data-tour="my-requirements:1">
      <template v-for="(tab, index) in tabs" :key="tab.value">
        <span v-if="index > 0" class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item my-requirements-strip__item"
          :class="{
            'my-requirements-strip__item--active': selectedState === tab.value,
          }"
          type="button"
          :aria-pressed="selectedState === tab.value"
          @click="selectedState = tab.value"
        >
          <span class="wb-strip__label">{{ tab.label }}</span>
          <span class="wb-strip__value">{{ stripValue(tab.count) }}</span>
        </button>
      </template>
      <div class="wb-strip__item wb-strip__action">
        <TButton
          icon-only
          :loading="loading"
          :aria-label="refreshButtonLabel"
          :title="refreshButtonLabel"
          @click="emit('refresh')"
        >
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>

<style scoped>
/* 读数格本身也是筛选按钮：去掉按钮默认外观，版式完全交给 .wb-strip__item */
.my-requirements-strip__item {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}

.my-requirements-strip__item:hover .wb-strip__label {
  color: var(--73-ink);
}

.my-requirements-strip__item--active .wb-strip__label,
.my-requirements-strip__item--active .wb-strip__value,
/* 悬停规则的伪类会多压一级，激活格悬停时要把蓝色再说一遍，否则指针一放上去就变回深色。 */
.my-requirements-strip__item--active:hover .wb-strip__label,
.my-requirements-strip__item--active:hover .wb-strip__value {
  color: var(--73-accent);
}

.my-requirements-strip__item--active .wb-strip__value {
  font-weight: 700;
}
</style>
