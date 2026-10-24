<script setup lang="ts">
/**
 * 资源目录（门户 `/`、`/<rootSlug>`、`/<rootSlug>/<entrySlug>` 三档路由共用）。
 *
 * 这一页只负责排版与组合：
 * - 数据与动作（专区 / 子分区页签、免费付费分区、页内详情、排序、列表读数、视口分档）
 *   → `useResourceCatalogPage`；
 * - 工具条（专区下拉 / 子分区 Tab / 分区 segmented / 已选筛选 / 排序 / 统计 / 翻页）→ `CatalogToolbar`；
 * - 页码胶囊 → `CatalogPager`（工具条内）；
 * - 页码收口、`?resource=` 解析、query 改写等纯函数 → `@/shared/resourceCatalogDisplay`。
 */
import MobileResourceList from '@/components/MobileResourceList.vue'
import ResourceCatalog from '@/components/ResourceCatalog.vue'
import ResourceDetailPanel from '@/components/ResourceDetailPanel.vue'
import CatalogToolbar from '@/components/resource-catalog/CatalogToolbar.vue'
import { useResourceCatalogPage } from '@/composables/useResourceCatalogPage'

const {
  activeFilterChips,
  activeListingMode,
  catalogRef,
  clearAllFilters,
  clearSelectedResource,
  currentEntryLabel,
  currentEntrySlug,
  currentPlatform,
  currentRootName,
  currentRootSlug,
  currentTab,
  goNextPage,
  goPrevPage,
  goToPage,
  handleFiltersChange,
  handleListingCounts,
  handlePageStateChange,
  handleRootCommand,
  handleSortCommand,
  isMobile,
  listingCounts,
  listingReported,
  openPlatform,
  pageNumbers,
  pageState,
  platformTabs,
  removeFilterChip,
  rootTabs,
  selectResource,
  selectedResourceId,
  selectedSort,
  switchListingMode,
} = useResourceCatalogPage()
</script>

<template>
  <main class="portal-page catalog-layout-page">
    <!-- 面包屑整条移除后，本页在桌面端只剩这一个 h1：视觉隐藏、保留在 DOM 里，
         供屏幕阅读器与搜索引擎定位当前分区；分区名在右侧分区间页签里仍然可见 -->
    <h1 v-if="!isMobile" class="catalog-visually-hidden">{{ currentEntryLabel }}</h1>

    <!-- 工具条：第一行「专区下拉 + 子类下划线 Tab …… 分区 segmented（唯一一处）」，
         第二行「已选筛选 chip + 排序下拉 + 统计 / 翻页」 -->
    <CatalogToolbar
      v-if="!isMobile"
      :root-tabs="rootTabs"
      :current-root-name="currentRootName"
      :current-root-slug="currentRootSlug"
      :platform-tabs="platformTabs"
      :current-entry-slug="currentEntrySlug"
      :listing-mode="activeListingMode"
      :listing-counts="listingCounts"
      :listing-reported="listingReported"
      :filter-chips="activeFilterChips"
      :selected-sort="selectedSort"
      :page-state="pageState"
      :page-numbers="pageNumbers"
      :has-selection="selectedResourceId !== null"
      @root-command="handleRootCommand"
      @select-platform="openPlatform"
      @switch-listing-mode="switchListingMode"
      @remove-filter="removeFilterChip"
      @clear-filters="clearAllFilters"
      @sort-command="handleSortCommand"
      @go-page="goToPage"
      @go-prev-page="goPrevPage"
      @go-next-page="goNextPage"
      @back="clearSelectedResource"
    />

    <section class="catalog-layout-page__browser">
      <!-- 移动端（≤900px）：与桌面端同一套入口与同一套「页内详情」——
           未选中时列表独占内容区，选中一条资源时列表整块收起、详情铺满；
           工具条只在桌面端渲染，移动端的退出口由面板内的窄屏返回控件（`close` 事件）提供。
           KeepAlive 同桌面端：收起期间列表实例被缓存，返回时筛选 / 页码原样恢复。 -->
      <template v-if="isMobile">
        <KeepAlive>
          <MobileResourceList
            v-if="selectedResourceId === null"
            :platform="currentPlatform"
            :rootSlug="currentRootSlug"
            :entrySlug="currentEntrySlug"
            :groupName="currentTab?.groupName || currentEntryLabel"
            :listing-mode="activeListingMode"
            @switch-listing-mode="switchListingMode"
            @listing-counts="handleListingCounts"
          />
        </KeepAlive>

        <aside
          v-if="selectedResourceId !== null"
          class="catalog-master__detail"
          aria-label="资源详情"
        >
          <ResourceDetailPanel
            :key="selectedResourceId"
            :resource-id="selectedResourceId"
            @close="clearSelectedResource"
          />
        </aside>
      </template>

      <!-- 桌面端是「单栏两块、同一时刻只渲染一块」：未选中时资源列表独占内容区整宽，
           选中一条资源时整个列表收起、详情独占内容区整宽（不再左右并排，也不留空栏）。
           选中只改 URL 的 query（`?resource=<id>`），不整页跳转、不切路由。
           KeepAlive：列表收起时用 `v-if` 让整块从文档里移除（选择器查不到，也不再跑取数与布局），
           但组件实例被缓存住，返回时排序 / 已选筛选 / 当前页码原样恢复，不用重新取数。 -->
      <div v-else class="catalog-master">
        <KeepAlive>
          <ResourceCatalog
            v-if="selectedResourceId === null"
            ref="catalogRef"
            class="catalog-master__list"
            master-detail
            :platform="currentPlatform"
            :rootSlug="currentRootSlug"
            :entrySlug="currentEntrySlug"
            :groupName="currentTab?.groupName || currentEntryLabel"
            :listing-mode="activeListingMode"
            @page-state-change="handlePageStateChange"
            @listing-counts="handleListingCounts"
            @filters-change="handleFiltersChange"
            @switch-listing-mode="switchListingMode"
            @select-resource="selectResource"
          />
        </KeepAlive>

        <aside
          v-if="selectedResourceId !== null"
          class="catalog-master__detail"
          aria-label="资源详情"
        >
          <ResourceDetailPanel
            :key="selectedResourceId"
            :resource-id="selectedResourceId"
            @close="clearSelectedResource"
          />
        </aside>
      </div>
    </section>
  </main>
</template>
