<script setup lang="ts">
/**
 * 积分记录区的工具栏：两段切换（打赏记录 / 积分明细）+ 打赏段的二级筛选。
 *
 * 两段是同一份数据的两个视角（一笔打赏两边各记一次），合成一张卡片用胶囊切换，省掉一个
 * 卡头与一层留白。积分明细没有筛选项，切到它时二级筛选整块不渲染。
 *
 * 组件只做展示与事件上报：切哪一段、筛什么、何时重置都由页面（`usePointsCenter`）处理。
 */
import { RefreshLeft, Search, TButton, TIcon, TInput } from 'ui_73info'

import {
  POINTS_RECORD_TABS,
  type PointsRecordTab,
  type TransferScope,
  type TransferScopeOption,
} from '@/shared/pointsDisplay'

defineProps<{
  activeTab: PointsRecordTab
  scopes: TransferScopeOption[]
  scope: TransferScope
  keyword: string
  filtersActive: boolean
  /** 筛选后的条数（打赏段） */
  filteredTotal: number
  /** 一次取回的全部条数（打赏段） */
  totalCount: number
}>()

const emit = defineEmits<{
  (e: 'update:activeTab', tab: PointsRecordTab): void
  (e: 'update:scope', scope: TransferScope): void
  (e: 'update:keyword', keyword: string): void
  (e: 'reset'): void
}>()
</script>

<template>
  <div class="wb-toolbar">
    <div class="wb-chip-group" role="tablist" aria-label="积分记录切换">
      <button
        v-for="tab in POINTS_RECORD_TABS"
        :id="`points-records-tab-${tab.key}`"
        :key="tab.key"
        type="button"
        class="wb-chip wb-chip--button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`points-records-panel-${tab.key}`"
        :class="{ 'is-active': activeTab === tab.key }"
        @click="emit('update:activeTab', tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 打赏段的二级筛选：方向、搜索、重置。积分明细没有筛选项，切到它时这一组整块不渲染 -->
    <template v-if="activeTab === 'transfers'">
      <div class="wb-chip-group points-records__scopes" role="group" aria-label="打赏方向">
        <button
          v-for="item in scopes"
          :key="item.value"
          type="button"
          class="wb-chip wb-chip--button"
          :class="{ 'is-active': scope === item.value }"
          :aria-pressed="scope === item.value"
          @click="emit('update:scope', item.value)"
        >
          {{ item.label }}<span class="wb-chip__count">{{ item.count }}</span>
        </button>
      </div>
      <TInput
        :model-value="keyword"
        class="wb-toolbar__search"
        clearable
        placeholder="搜索用户名或附言"
        aria-label="搜索打赏记录"
        @update:model-value="emit('update:keyword', $event)"
      >
        <template #prefix
          ><TIcon><Search /></TIcon
        ></template>
      </TInput>
      <div class="wb-toolbar__actions">
        <span v-if="filtersActive" class="wb-toolbar__hint">
          筛选出 {{ filteredTotal }} / {{ totalCount }} 条
        </span>
        <TButton v-if="filtersActive" variant="outline" @click="emit('reset')">
          <TIcon><RefreshLeft /></TIcon><span>重置</span>
        </TButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 二级筛选（打赏方向）与上方的 tab 胶囊用一条竖线分开：两组胶囊挨在一起时，
   容易误读成同一级的四个选项。窄屏两组各自折行，竖线就失去意义，直接去掉。 */
.points-records__scopes {
  padding-left: 12px;
  border-left: 1px solid var(--wb-line);
}

@media (max-width: 640px) {
  .points-records__scopes {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
