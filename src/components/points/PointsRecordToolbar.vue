<script setup lang="ts">
import { computed } from 'vue'
import { Refresh, Search, TButton, TIcon, TInput, TSelect, TOption } from 'ui_73info'

import {
  POINTS_RECORD_TABS,
  type PointsRecordTab,
  type TransferScope,
  type TransferScopeOption,
} from '@/shared/pointsDisplay'

const props = defineProps<{
  activeTab: PointsRecordTab
  scopes: TransferScopeOption[]
  scope: TransferScope
  keyword: string
  filtersActive: boolean
  filteredTotal: number
  totalCount: number
  logTotal: number
  transferTotal: number
  refreshing: boolean
}>()

const emit = defineEmits<{
  (e: 'update:activeTab', tab: PointsRecordTab): void
  (e: 'update:scope', scope: TransferScope): void
  (e: 'update:keyword', keyword: string): void
  (e: 'reset'): void
  (e: 'refresh'): void
  (e: 'export'): void
}>()

/** 页签上的计数用真实总量：明细是服务端总数，打赏是当前拉取到的记录数。 */
const tabCounts = computed<Record<PointsRecordTab, number>>(() => ({
  logs: props.logTotal,
  transfers: props.transferTotal,
}))
</script>

<template>
  <div class="points-records-toolbar">
    <div class="points-tabs" role="tablist" aria-label="积分记录切换">
      <button
        v-for="tab in POINTS_RECORD_TABS"
        :id="`points-records-tab-${tab.key}`"
        :key="tab.key"
        type="button"
        class="points-tabs__tab"
        :class="{ 'is-active': activeTab === tab.key }"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`points-records-panel-${tab.key}`"
        @click="emit('update:activeTab', tab.key)"
      >
        <span>{{ tab.label }}</span>
        <span class="points-tabs__count">{{ tabCounts[tab.key] }}</span>
      </button>
    </div>

    <div class="points-toolbar">
      <div class="points-toolbar__left">
        <template v-if="activeTab === 'transfers'">
          <TSelect
            :model-value="scope"
            class="points-toolbar__scope"
            aria-label="打赏方向"
            @update:model-value="emit('update:scope', $event as TransferScope)"
          >
            <TOption
              v-for="item in scopes"
              :key="item.value"
              :label="`${item.label}（${item.count}）`"
              :value="item.value"
            />
          </TSelect>
          <TInput
            :model-value="keyword"
            class="points-toolbar__search"
            clearable
            placeholder="搜索用户名或附言"
            aria-label="搜索打赏记录"
            @update:model-value="emit('update:keyword', $event)"
          >
            <template #prefix
              ><TIcon><Search /></TIcon
            ></template>
          </TInput>
          <span v-if="filtersActive" class="points-toolbar__hint">
            筛选出 {{ filteredTotal }} / {{ totalCount }} 条
          </span>
          <TButton v-if="filtersActive" variant="outline" @click="emit('reset')">重置</TButton>
        </template>
      </div>

      <div class="points-toolbar__right">
        <TButton variant="outline" @click="emit('export')">导出 CSV</TButton>
        <TButton
          icon-only
          :loading="refreshing"
          aria-label="刷新积分数据"
          title="刷新积分数据"
          @click="emit('refresh')"
        >
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.points-records-toolbar {
  border-bottom: 1px solid var(--73-border);
}

.points-tabs {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 20px;
}

.points-tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--73-ink-muted);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    color var(--73-transition),
    border-color var(--73-transition);
}

.points-tabs__tab:hover {
  color: var(--73-ink);
}

.points-tabs__tab.is-active {
  border-bottom-color: var(--73-accent);
  color: var(--73-accent);
  font-weight: 600;
}

.points-tabs__count {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--73-inset);
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.5;
}

.points-tabs__tab.is-active .points-tabs__count {
  background: var(--73-accent-soft);
  color: var(--73-accent);
}

.points-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 20px;
  background: color-mix(in srgb, var(--73-bg) 55%, transparent);
}

.points-toolbar__left,
.points-toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.points-toolbar__scope {
  width: 160px;
}

.points-toolbar__search {
  width: 260px;
  max-width: 100%;
}

.points-toolbar__hint {
  color: var(--73-ink-muted);
  font-size: 12px;
}

@media (max-width: 640px) {
  .points-tabs {
    gap: 16px;
  }

  .points-toolbar__search {
    width: 100%;
  }
}
</style>
