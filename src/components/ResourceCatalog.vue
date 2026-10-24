<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { listPublicMcResources, type McResourcePlatform } from '@/api/resources'
import { getTagFilterSections, getTagRouteSlug } from '@/api/resourceTags'
import { useTagTreeStore } from '@/stores/tagTree'
import { useAuthStore } from '@/stores/auth'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import { DEFAULT_RESOURCE_LISTING_SALE, type ResourceListingSale } from '@/shared/resourceSale'
import {
  useResourceCatalogFiltering,
  type ActiveFilterChip,
} from '@/composables/useResourceCatalogFiltering'
import ResourceCatalogCardItem from '@/components/resource-catalog/ResourceCatalogCardItem.vue'
import ResourceCatalogEmptyState from '@/components/resource-catalog/ResourceCatalogEmptyState.vue'
import ResourceCatalogFilterMenu from '@/components/resource-catalog/ResourceCatalogFilterMenu.vue'
import {
  mapResourceToCard,
  type McCardItem,
} from '@/components/resource-catalog/resourceCatalogModel'
import { TMessage } from 'ui_73info'

/**
 * 桌面资源列表（资源列表页主栏的那一套）。
 *
 * 这一层只留「取数 + 上报 + 跳转」：筛选 / 排序 / 分页的派生在
 * `useResourceCatalogListing`，卡片、筛选菜单与空态是 `components/resource-catalog/`
 * 下的子组件，卡片形状与展示换算在 `resourceCatalogModel.ts`。
 * 对外的五个事件、`defineExpose` 的六个方法、翻页与筛选的上报口径都与拆分前一致。
 */
const props = defineProps<{
  platform: McResourcePlatform
  rootSlug: string
  entrySlug: string
  groupName: string
  /** 免费 / 付费分区：由页内分段切换写入（见 ResourceCatalogView），这里只做展示过滤 */
  listingMode?: ResourceListingSale | null
  /**
   * 资源列表页（桌面端）：卡片不跳独立详情路由，而是把选中项交给父级，
   * 由父级把整个列表换出、就地在同一块内容区渲染详情（见 ResourceCatalogView / ResourceDetailPanel）。
   */
  masterDetail?: boolean
}>()

type CatalogPageState = {
  current: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  totalItems: number
}

const emit = defineEmits<{
  (e: 'page-state-change', state: CatalogPageState): void
  /** 两个分区的资源计数（本地算，不额外请求），供工具条上的分段控件带计数 */
  (e: 'listing-counts', counts: { free: number; paid: number }): void
  /** 已选筛选的汇总，供父页面渲染 chip 条 */
  (e: 'filters-change', chips: ActiveFilterChip[]): void
  /** 空态里「切换分区」出口，交给父页面写回路由 `?sale=` */
  (e: 'switch-listing-mode', value: ResourceListingSale): void
  /** 主从双栏下选中某条资源：父页面据此更新右栏与地址栏（`?resource=<id>`） */
  (e: 'select-resource', id: number): void
}>()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const tagTreeStore = useTagTreeStore()

const {
  filterSections,
  cards,
  currentPage,
  listingCounts,
  activeFilterChips,
  hasActiveFilters,
  filteredCards,
  pagedCards,
  totalPages,
  goToPage,
  nextPage,
  prevPage,
  setSort,
  removeFilter,
  clearSection,
  clearFilters,
  toggleTag,
  applyFiltersFromQuery,
} = useResourceCatalogFiltering({
  getListingMode: () => props.listingMode ?? DEFAULT_RESOURCE_LISTING_SALE,
})

const pageState = computed<CatalogPageState>(() => ({
  current: currentPage.value,
  total: totalPages.value,
  hasPrev: currentPage.value > 1,
  hasNext: currentPage.value < totalPages.value,
  totalItems: filteredCards.value.length,
}))

defineExpose({
  setSort,
  nextPage,
  prevPage,
  goToPage,
  removeFilter,
  clearFilters,
})

function openResource(card: McCardItem) {
  // 主从双栏（资源列表页桌面端）：不跳独立详情路由，交给父级在右栏就地展开
  // （选中态写进 URL 的 `?resource=` 由父级统一负责）。
  if (props.masterDetail) {
    emit('select-resource', card.id)
    return
  }

  // 本组件当独立列表页用时：同样落到页内详情态（独立详情页已废弃）
  void router.push(
    resourceDetailLocation({
      resourceId: card.id,
      rootSlug: props.rootSlug,
      entrySlug: props.entrySlug || getTagRouteSlug(props.groupName),
      sale: resourceListingSaleOf(card.priceFen, card.pricePoints),
    }),
  )
}

/** 空态出口：去首页发布需求（沿用门户既有 `?modal=publish` 口径） */
function goPublishRequirement() {
  void router.push({ name: 'home', query: { modal: 'publish' } })
}

async function loadTagTree() {
  try {
    const token = auth.token?.trim() ? auth.token : null
    const tree = await tagTreeStore.ensure()
    const resources = await listPublicMcResources(props.platform, token)
    cards.value = resources.map(mapResourceToCard)
    filterSections.value = getTagFilterSections(tree, props.rootSlug, props.entrySlug).map(
      (section) => ({
        ...section,
        selected: [],
      }),
    )
    applyFiltersFromQuery()
  } catch (err) {
    TMessage.warning(err instanceof Error ? err.message : '加载标签失败')
  }
}

onMounted(() => {
  auth.hydrate()
  void loadTagTree()
})

watch(
  () => [props.platform, props.entrySlug, props.groupName],
  () => {
    void loadTagTree()
  },
)

watch(
  () => route.query,
  (next, prev) => {
    // `?sale=` 是免费 / 付费页内切换写的，`?resource=` 是主从双栏选中项写的，
    // 两者都与标签筛选无关：只改它们时不要重新套用 query 里的筛选，否则已选标签会被清掉。
    const changedKeys = new Set([...Object.keys(next ?? {}), ...Object.keys(prev ?? {})])
    changedKeys.delete('sale')
    changedKeys.delete('resource')
    if (changedKeys.size === 0) {
      return
    }

    applyFiltersFromQuery()
  },
)

watch(
  () => auth.token,
  () => {
    void loadTagTree()
  },
)

// 翻页状态上报（当前页 / 总页数 / 有无上下页 / 总条数）：任一变化都重发一次。
watch(pageState, (state) => emit('page-state-change', state), { immediate: true })

// 计数与已选筛选汇总上报给父页面（工具条上的分段计数与 chip 条）：
// 数据全在本地，切换分区只重算这两个 computed，不发请求。
watch(listingCounts, (counts) => emit('listing-counts', counts), { immediate: true })

watch(activeFilterChips, (chips) => emit('filters-change', chips), { immediate: true })
</script>

<template>
  <section class="portal-resource-browser">
    <ResourceCatalogFilterMenu
      :sections="filterSections"
      @toggle-tag="toggleTag"
      @clear-section="clearSection"
    />

    <section class="portal-resource-browser__grid">
      <ResourceCatalogCardItem
        v-for="card in pagedCards"
        :key="card.id"
        :card="card"
        @open="openResource(card)"
      />

      <ResourceCatalogEmptyState
        v-if="filteredCards.length === 0"
        :has-active-filters="hasActiveFilters"
        :listing-mode="props.listingMode"
        @clear-filters="clearFilters"
        @switch-listing-mode="(mode) => emit('switch-listing-mode', mode)"
        @publish="goPublishRequirement"
      />
    </section>
  </section>
</template>

<style scoped src="./resource-catalog/resource-catalog-page.css"></style>
