<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { listPublicMcResources, type McResourcePlatform } from '@/api/resources'
import { getTagFilterSections, getTagRouteSlug } from '@/api/resourceTags'
import { useTagTreeStore } from '@/stores/tagTree'
import { useAuthStore } from '@/stores/auth'
import {
  isCashPaidListingResource,
  isFreeListingResource,
  type ResourceListingSale,
} from '@/shared/resourceSale'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import MobileResourceCardItem from '@/components/mobile-resource/MobileResourceCardItem.vue'
import MobileResourceEmptyState from '@/components/mobile-resource/MobileResourceEmptyState.vue'
import MobileResourceFilterDrawer from '@/components/mobile-resource/MobileResourceFilterDrawer.vue'
import MobileResourceHeader from '@/components/mobile-resource/MobileResourceHeader.vue'
import {
  mapResourceToCard,
  type EntryOption,
  type MobileCard,
  type RootOption,
  type SectionView,
} from '@/components/mobile-resource/mobileResourceModel'
import { TMessage } from 'ui_73info'

/**
 * 移动端资源列表（门户在窄屏下用的那一套）。
 *
 * 这一层只留「取数 + 筛选 + 排序 + 分页 + 跳转」：卡片、顶栏、筛选抽屉与空态都是
 * `components/mobile-resource/` 下的子组件，`mobileResourceModel.ts` 管卡片形状与映射。
 * 筛选状态（每组已选标签、分组展开态）留在这里，因为派生列表要按它过滤；
 * 抽屉与顶栏只回写事件，选择口径与原来一致（切分区、切节点都走同一个 `listingQuery`）。
 */
const props = defineProps<{
  platform: McResourcePlatform
  rootSlug: string
  entrySlug: string
  groupName: string
  /** 免费 / 付费分区：由页内分段切换写入（见 ResourceCatalogView），这里只做展示过滤 */
  listingMode?: ResourceListingSale | null
}>()

const emit = defineEmits<{
  (e: 'switch-listing-mode', value: ResourceListingSale): void
  (e: 'listing-counts', counts: { free: number; paid: number }): void
}>()

const auth = useAuthStore()
const tagTreeStore = useTagTreeStore()
const router = useRouter()

const sortMode = ref<'latest' | 'like'>('latest')
const menuOpen = ref(false)
const keyword = ref('')
const pageSize = 10
const visibleCount = ref(pageSize)
const currentRootLabel = ref('')
const currentEntryLabel = ref('')
const rootOptions = ref<RootOption[]>([])
const entryOptions = ref<EntryOption[]>([])

const cards = ref<MobileCard[]>([])
const filterSections = ref<SectionView[]>([])
const expandedSectionIds = ref<number[]>([])

/** 免费 / 付费计数：只数本地已加载的 cards，切分区仍是零请求 */
const listingCounts = computed(() => {
  let free = 0
  let paid = 0
  for (const card of cards.value) {
    if (isCashPaidListingResource(card.priceFen, card.pricePoints)) {
      paid += 1
    } else if (isFreeListingResource(card.priceFen, card.pricePoints)) {
      free += 1
    }
  }
  return { free, paid }
})

const hasActiveFilters = computed(() =>
  filterSections.value.some((section) => section.selected.length > 0),
)

const filteredItems = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  const mode = props.listingMode ?? null

  const data = cards.value.filter((card) => {
    if (mode === 'free' && !isFreeListingResource(card.priceFen, card.pricePoints)) {
      return false
    }
    if (mode === 'paid' && !isCashPaidListingResource(card.priceFen, card.pricePoints)) {
      return false
    }

    if (query) {
      const haystack = `${card.title} ${card.desc} ${card.author} ${card.tagsText}`.toLowerCase()
      if (!haystack.includes(query)) {
        return false
      }
    }

    for (const section of filterSections.value) {
      if (section.selected.length === 0) {
        continue
      }

      const selectedSet = new Set(section.selected)
      const groupValues = card.groupTags[section.label] ?? []
      const matched = groupValues.some((value) => selectedSet.has(value))
      if (!matched) {
        return false
      }
    }

    return true
  })

  if (sortMode.value === 'like') {
    return data.slice().sort((a, b) => b.likeCount - a.likeCount)
  }

  return data.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
})

const visibleItems = computed(() => filteredItems.value.slice(0, visibleCount.value))

function isSectionExpanded(sectionId: number) {
  return expandedSectionIds.value.includes(sectionId)
}

function toggleSection(sectionId: number) {
  if (isSectionExpanded(sectionId)) {
    expandedSectionIds.value = expandedSectionIds.value.filter((id) => id !== sectionId)
    return
  }

  expandedSectionIds.value = [...expandedSectionIds.value, sectionId]
}

function syncExpandedSections() {
  if (filterSections.value.length === 0) {
    expandedSectionIds.value = []
    return
  }

  const validIds = new Set(filterSections.value.map((section) => section.id))
  const retained = expandedSectionIds.value.filter((id) => validIds.has(id))
  expandedSectionIds.value = retained
}

function openMenu() {
  menuOpen.value = true
  syncExpandedSections()
}

function closeMenu() {
  menuOpen.value = false
}

function selectRoot(option: RootOption) {
  if (option.key === props.rootSlug) {
    return
  }

  const targetEntry = option.firstEntryKey
  if (!targetEntry) {
    return
  }

  void router.push({
    name: 'resource-catalog',
    params: {
      rootSlug: option.key,
      entrySlug: targetEntry,
    },
    query: listingQuery(),
  })
}

function selectEntry(entry: EntryOption) {
  if (entry.key === props.entrySlug) {
    return
  }

  void router.push({
    name: 'resource-catalog',
    params: {
      rootSlug: props.rootSlug,
      entrySlug: entry.key,
    },
    query: listingQuery(),
  })
}

function listingQuery() {
  const mode = props.listingMode
  return mode ? { sale: mode } : {}
}

function toggleSectionTag(sectionId: number, tag: string) {
  const section = filterSections.value.find((entry) => entry.id === sectionId)
  if (!section) {
    return
  }

  if (section.selected.includes(tag)) {
    section.selected = section.selected.filter((item) => item !== tag)
    return
  }

  section.selected = [...section.selected, tag]
}

function resetFilters() {
  sortMode.value = 'latest'
  keyword.value = ''
  filterSections.value.forEach((section) => {
    section.selected = []
  })
  visibleCount.value = pageSize
}

function applyFilters() {
  visibleCount.value = pageSize
  closeMenu()
}

/** 空态出口：去首页发布需求（沿用门户既有 `?modal=publish` 口径） */
function goPublishRequirement() {
  void router.push({ name: 'home', query: { modal: 'publish' } })
}

function loadMore() {
  visibleCount.value += pageSize
}

function openResource(card: MobileCard) {
  // 与桌面端同一套入口：落到资源列表页的页内详情态（`?resource=<id>`），
  // 独立详情路由已废弃。这里用 push 让移动端手势返回能回到列表。
  void router.push(
    resourceDetailLocation({
      resourceId: card.id,
      rootSlug: props.rootSlug,
      entrySlug: props.entrySlug || getTagRouteSlug(props.groupName),
      sale: resourceListingSaleOf(card.priceFen, card.pricePoints),
    }),
  )
}

async function loadData() {
  if (!props.platform) {
    cards.value = []
    filterSections.value = []
    return
  }

  try {
    const token = auth.token?.trim() ? auth.token : null
    const tree = await tagTreeStore.ensure()
    const resources = await listPublicMcResources(props.platform, token)

    const rootNode = tree.roots.find((root) => root.key === props.rootSlug)
    const entryNode = rootNode?.entries.find((entry) => entry.key === props.entrySlug) ?? null
    rootOptions.value = tree.roots.map((root) => ({
      key: root.key,
      label: root.label,
      firstEntryKey: root.first_entry_key,
    }))
    entryOptions.value = (rootNode?.entries ?? []).map((entry) => ({
      key: entry.key,
      label: entry.group_name,
    }))
    currentRootLabel.value = rootNode?.label || props.rootSlug
    currentEntryLabel.value = entryNode?.group_name || props.groupName

    cards.value = resources.map(mapResourceToCard)
    filterSections.value = getTagFilterSections(tree, props.rootSlug, props.entrySlug).map(
      (section) => ({
        ...section,
        selected: [],
      }),
    )
    syncExpandedSections()
    visibleCount.value = pageSize
  } catch (error) {
    TMessage.warning(error instanceof Error ? error.message : '加载资源失败')
  }
}

onMounted(() => {
  auth.hydrate()
  void loadData()
})

watch(
  () => [props.platform, props.rootSlug, props.entrySlug],
  () => {
    resetFilters()
    void loadData()
  },
)

watch(
  () => filteredItems.value.length,
  () => {
    if (visibleCount.value < pageSize) {
      visibleCount.value = pageSize
    }
  },
)

// 计数上报给父页面（移动端分段控件显示每段数量）
watch(listingCounts, (counts) => emit('listing-counts', counts), { immediate: true })
</script>

<template>
  <section class="mobile-resource-page" :class="{ 'mobile-resource-page--menu-open': menuOpen }">
    <button
      v-if="menuOpen"
      class="mobile-resource-menu-backdrop"
      type="button"
      aria-label="关闭筛选菜单"
      @click="closeMenu"
    />

    <MobileResourceFilterDrawer
      :open="menuOpen"
      :root-slug="props.rootSlug"
      :entry-slug="props.entrySlug"
      :root-options="rootOptions"
      :entry-options="entryOptions"
      :current-root-label="currentRootLabel"
      :current-entry-label="currentEntryLabel"
      :sections="filterSections"
      :expanded-section-ids="expandedSectionIds"
      @close="closeMenu"
      @select-root="selectRoot"
      @select-entry="selectEntry"
      @toggle-section="toggleSection"
      @toggle-tag="toggleSectionTag"
      @reset="resetFilters"
      @apply="applyFilters"
    />

    <MobileResourceHeader
      :sort-mode="sortMode"
      :keyword="keyword"
      :listing-mode="props.listingMode"
      :counts="listingCounts"
      @open-menu="openMenu"
      @update:sort-mode="(mode) => (sortMode = mode)"
      @update:keyword="(value) => (keyword = value)"
      @switch-listing-mode="(mode) => emit('switch-listing-mode', mode)"
    />

    <section class="mobile-card-list">
      <MobileResourceCardItem
        v-for="item in visibleItems"
        :key="item.id"
        :card="item"
        @open="openResource(item)"
      />

      <MobileResourceEmptyState
        v-if="filteredItems.length === 0"
        :has-active-filters="hasActiveFilters"
        :listing-mode="props.listingMode"
        @reset="resetFilters"
        @switch-listing-mode="(mode) => emit('switch-listing-mode', mode)"
        @publish="goPublishRequirement"
      />
      <button
        v-else-if="visibleItems.length < filteredItems.length"
        class="load-more"
        type="button"
        @click="loadMore"
      >
        加载更多
      </button>
    </section>
  </section>
</template>

<style scoped src="./mobile-resource/mobile-resource-page.css"></style>

<style src="./mobile-resource/mobile-resource-sort-dropdown.css"></style>
