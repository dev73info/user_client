<script setup lang="ts">
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
  filteredTotal: number
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
