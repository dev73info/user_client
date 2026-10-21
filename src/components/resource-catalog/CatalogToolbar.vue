<script setup lang="ts">
/**
 * 资源目录工具条（仅桌面端渲染）。
 *
 * 第一行「专区下拉 + 子类下划线 Tab …… 分区 segmented（唯一一处）」，
 * 第二行「已选筛选 chip + 排序下拉 + 统计 / 翻页 / 返回」。
 *
 * 数据全部由列表页经 props 传进来、操作一律 emit 出去：本组件不取数、不改路由，
 * 列表实例在父级手里（`remove-filter` / `clear-filters` / `go-*` 都由父级转给列表）。
 */
import { ArrowDown, TDropdown, TDropdownItem, TDropdownMenu, TIcon } from 'ui_73info'

import type { McPluginPlatformEntry } from '@/api/resourceTags'
import CatalogPager from '@/components/resource-catalog/CatalogPager.vue'
import ResourceModeSwitch from '@/components/ResourceModeSwitch.vue'
import {
  CATALOG_SORT_OPTIONS,
  type CatalogFilterChip,
  type CatalogPageState,
  type CatalogRootTab,
  type CatalogSort,
} from '@/shared/resourceCatalogDisplay'
import type { ResourceListingSale } from '@/shared/resourceSale'

defineProps<{
  rootTabs: CatalogRootTab[]
  currentRootName: string
  currentRootSlug: string
  platformTabs: McPluginPlatformEntry[]
  currentEntrySlug: string
  /** 免费 / 付费分区与两个分区的资源计数（计数只在列表上报过之后才显示） */
  listingMode: ResourceListingSale
  listingCounts: { free: number; paid: number }
  listingReported: boolean
  filterChips: CatalogFilterChip[]
  selectedSort: CatalogSort
  pageState: CatalogPageState
  pageNumbers: Array<number | '…'>
  /** 详情态才会出现「返回」（清掉 `?resource=` 让列表回来） */
  hasSelection: boolean
}>()

const emit = defineEmits<{
  (e: 'root-command', command: unknown): void
  (e: 'select-platform', entrySlug: string): void
  (e: 'switch-listing-mode', mode: ResourceListingSale): void
  (e: 'remove-filter', chip: CatalogFilterChip): void
  (e: 'clear-filters'): void
  (e: 'sort-command', command: unknown): void
  (e: 'go-page', page: number): void
  (e: 'go-prev-page'): void
  (e: 'go-next-page'): void
  (e: 'back'): void
}>()
</script>

<template>
  <section class="catalog-toolbar">
    <div class="catalog-toolbar__row">
      <div class="catalog-toolbar__lead">
        <TDropdown trigger="click" placement="bottom-start" @command="emit('root-command', $event)">
          <button class="catalog-zone-trigger" type="button" aria-label="切换专区">
            <span>{{ currentRootName || '选择专区' }}</span>
            <TIcon class="catalog-zone-trigger__chevron">
              <ArrowDown />
            </TIcon>
          </button>
          <template #dropdown>
            <TDropdownMenu>
              <TDropdownItem
                v-for="root in rootTabs"
                :key="root.slug"
                :command="root.slug"
                :active="root.slug === currentRootSlug"
              >
                {{ root.label }}
              </TDropdownItem>
            </TDropdownMenu>
          </template>
        </TDropdown>

        <nav class="catalog-subtabs" aria-label="子分区切换">
          <button
            v-for="tab in platformTabs"
            :key="tab.slug"
            class="catalog-subtab"
            :class="{ 'catalog-subtab--active': tab.slug === currentEntrySlug }"
            type="button"
            @click="emit('select-platform', tab.slug)"
          >
            {{ tab.groupName }}
          </button>
        </nav>
      </div>

      <ResourceModeSwitch
        :model-value="listingMode"
        :counts="listingReported ? listingCounts : null"
        @update:model-value="emit('switch-listing-mode', $event)"
      />
    </div>

    <div class="catalog-toolbar__row">
      <div class="catalog-chipbar">
        <template v-if="filterChips.length > 0">
          <button
            v-for="chip in filterChips"
            :key="chip.key"
            class="catalog-chip"
            type="button"
            :aria-label="`移除筛选：${chip.label} ${chip.tag}`"
            @click="emit('remove-filter', chip)"
          >
            <span>{{ chip.label }}：{{ chip.tag }}</span>
            <span class="catalog-chip__close" aria-hidden="true">×</span>
          </button>
          <button class="catalog-chip-clear" type="button" @click="emit('clear-filters')">
            清除全部
          </button>
        </template>
        <span v-else class="catalog-chipbar__hint">未选择筛选条件</span>
      </div>

      <div class="catalog-toolbar__trailing">
        <TDropdown trigger="click" placement="bottom-end" @command="emit('sort-command', $event)">
          <button class="catalog-sort-trigger" type="button" aria-label="排序方式">
            <span>排序：{{ selectedSort }}</span>
            <TIcon class="catalog-sort-trigger__chevron">
              <ArrowDown />
            </TIcon>
          </button>
          <template #dropdown>
            <TDropdownMenu>
              <TDropdownItem
                v-for="option in CATALOG_SORT_OPTIONS"
                :key="option"
                :command="option"
                :active="selectedSort === option"
              >
                {{ option }}
              </TDropdownItem>
            </TDropdownMenu>
          </template>
        </TDropdown>

        <!-- 统计与分页来自列表的本地数据；详情态下列表不渲染、冷启动深链时更没跑过，
             所以在列表首次上报之前不显示（否则会出现假的「共 0 个」） -->
        <span v-if="listingReported" class="catalog-count">
          共 {{ pageState.totalItems }} 个
          <template v-if="pageState.total > 1">
            · 第 {{ pageState.current }}/{{ pageState.total }} 页</template
          >
        </span>

        <!-- 分页只在多页时出现（单页整条隐藏） -->
        <CatalogPager
          v-if="listingReported && pageState.total > 1"
          :page-state="pageState"
          :page-numbers="pageNumbers"
          @go-page="emit('go-page', $event)"
          @go-prev-page="emit('go-prev-page')"
          @go-next-page="emit('go-next-page')"
        />

        <!-- 打开详情才出现：清掉 `?resource=` 让列表回来，其余 query（专区 / 分区 / 排序 / 筛选）
             原样保留，用户回到点进详情前的位置 -->
        <button
          v-if="hasSelection"
          class="catalog-back-btn"
          type="button"
          aria-label="返回资源列表"
          @click="emit('back')"
        >
          <span aria-hidden="true">←</span>
          <span>返回</span>
        </button>
      </div>
    </div>
  </section>
</template>
