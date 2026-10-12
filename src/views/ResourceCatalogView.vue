<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQueryRaw } from 'vue-router'

import { ArrowDown, TDropdown, TDropdownItem, TDropdownMenu, TIcon } from 'ui_73info'

import ResourceCatalog from '@/components/ResourceCatalog.vue'
import MobileResourceList from '@/components/MobileResourceList.vue'
import ResourceModeSwitch from '@/components/ResourceModeSwitch.vue'
import {
  getMcPluginPlatformEntries,
  getTagRouteSlug,
  type McPluginPlatformEntry,
  type McProcessedTagTree,
} from '@/api/resourceTags'
import { useTagTreeStore } from '@/stores/tagTree'
import { useToast } from '@/composables/useToast'
import {
  resolveResourceListingSale,
  type ResourceListingSale,
} from '@/shared/resourceSale'

/** 已选筛选汇总出来的一枚 chip（由 ResourceCatalog 上报，点击可逐个移除） */
type CatalogFilterChip = {
  key: string
  sectionId: number
  label: string
  tag: string
}

type CatalogPageState = {
  current: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  totalItems: number
}

const router = useRouter()
const route = useRoute()
const { showToast } = useToast()
const tagTreeStore = useTagTreeStore()

// 免费 / 付费的页内切换是「本地状态 + 路由 `?sale=`」：
// 点击先本地切（列表立刻换，不等导航），再把分区写回 URL。
// 连点靠自增序号丢弃过期导航，避免旧 replace 的收尾把 pending 又改回去。
const pendingListingMode = ref<ResourceListingSale | null>(null)
let listingSwitchSeq = 0

const activeListingMode = computed<ResourceListingSale>(
  () => pendingListingMode.value ?? resolveResourceListingSale(route.query.sale),
)

async function switchListingMode(mode: ResourceListingSale) {
  if (mode === activeListingMode.value && pendingListingMode.value === null) {
    return
  }

  const seq = ++listingSwitchSeq
  pendingListingMode.value = mode
  try {
    await router.replace({ query: { ...route.query, sale: mode } })
  } catch {
    // 导航被更新的一次切换打断（或重复导航）时忽略，按序号决定谁收尾
  } finally {
    if (seq === listingSwitchSeq) {
      pendingListingMode.value = null
    }
  }
}

/** 分类跳转沿用的 query：分区（`?sale=`）始终带上，切根 / 二级分区也不丢。 */
function withListingQuery(query: LocationQueryRaw = {}): LocationQueryRaw {
  return { ...query, sale: activeListingMode.value }
}
const rootTabs = ref<Array<{ slug: string; label: string; firstEntrySlug: string | null }>>([])
const platformTabs = ref<McPluginPlatformEntry[]>([])
const currentRootName = ref('')
const currentRootSlug = computed(() => {
  const raw = route.params.rootSlug
  return typeof raw === 'string' ? getTagRouteSlug(raw) : ''
})
const currentEntrySlug = computed(() => {
  const raw = route.params.entrySlug
  return typeof raw === 'string' ? getTagRouteSlug(raw) : ''
})
const currentTab = computed(() => {
  return (
    platformTabs.value.find((tab) => tab.slug === currentEntrySlug.value) ??
    platformTabs.value[0] ??
    null
  )
})
const currentPlatform = computed(() => currentTab.value?.platform ?? '')
const currentEntryLabel = computed(() => currentTab.value?.groupName ?? '当前分区')
const sortOptions = ['最新', '点赞', '标题'] as const
const selectedSort = ref<(typeof sortOptions)[number]>('最新')
const catalogRef = ref<InstanceType<typeof ResourceCatalog> | null>(null)
const isMobile = ref(false)

// 工具条上的三块状态都由 ResourceCatalog 上报（数据在它那里，切换分区 / 排序仍是本地过滤）
const listingCounts = ref<{ free: number; paid: number }>({ free: 0, paid: 0 })
const activeFilterChips = ref<CatalogFilterChip[]>([])
const pageState = ref<CatalogPageState>({
  current: 1,
  total: 1,
  hasPrev: false,
  hasNext: false,
  totalItems: 0,
})

/** 多页时才出现的页码胶囊：页数多时用「…」收口，只留首尾与当前附近 */
const pageNumbers = computed<Array<number | '…'>>(() => {
  const total = pageState.value.total
  const current = pageState.value.current
  if (total <= 1) {
    return []
  }
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const keep = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...keep].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)
  const numbers: Array<number | '…'> = []
  let previous = 0
  for (const page of sorted) {
    if (previous !== 0 && page - previous > 1) {
      numbers.push('…')
    }
    numbers.push(page)
    previous = page
  }
  return numbers
})

function setCatalogSort(sort: (typeof sortOptions)[number]) {
  selectedSort.value = sort
  catalogRef.value?.setSort(sort)
}

function handleSortCommand(command: unknown) {
  const sort = String(command)
  if (sortOptions.includes(sort as (typeof sortOptions)[number])) {
    setCatalogSort(sort as (typeof sortOptions)[number])
  }
}

function handlePageStateChange(state: CatalogPageState) {
  pageState.value = state
}

function handleListingCounts(counts: { free: number; paid: number }) {
  listingCounts.value = counts
}

function handleFiltersChange(chips: CatalogFilterChip[]) {
  activeFilterChips.value = chips
}

function removeFilterChip(chip: CatalogFilterChip) {
  catalogRef.value?.removeFilter(chip.sectionId, chip.tag)
}

function clearAllFilters() {
  catalogRef.value?.clearFilters()
}

function goToPage(page: number) {
  catalogRef.value?.goToPage(page)
}

function goPrevPage() {
  catalogRef.value?.prevPage()
}

function goNextPage() {
  catalogRef.value?.nextPage()
}

function openPlatform(entrySlug: string) {
  if (entrySlug === currentEntrySlug.value) {
    return
  }

  router.push({
    name: 'resource-catalog',
    params: { rootSlug: currentRootSlug.value, entrySlug },
    query: withListingQuery({ ...route.query }),
  })
}

function openRoot(rootSlug: string, firstEntrySlug: string | null) {
  if (rootSlug === currentRootSlug.value) {
    return
  }

  router.push({
    name: 'resource-catalog',
    params: firstEntrySlug ? { rootSlug, entrySlug: firstEntrySlug } : { rootSlug },
    query: withListingQuery({ ...route.query }),
  })
}

/** 面包屑里的根分区是下拉：换专区仍走 openRoot，行为与原来的专区行一致 */
function handleRootCommand(command: unknown) {
  const rootSlug = String(command)
  const root = rootTabs.value.find((item) => item.slug === rootSlug)
  if (!root) {
    return
  }

  openRoot(root.slug, root.firstEntrySlug)
}

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  void loadPlatformTabs()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
})

watch(
  () => [currentRootSlug.value, currentEntrySlug.value],
  () => {
    void loadPlatformTabs()
  },
)

async function loadPlatformTabs() {
  try {
    const tree = await tagTreeStore.ensure()

    rootTabs.value = tree.roots.map((root) => ({
      slug: root.key,
      label: root.label,
      firstEntrySlug: root.first_entry_key,
    }))

    const resolvedRoot = resolveCurrentRoot(tree)
    if (!resolvedRoot) {
      rootTabs.value = []
      platformTabs.value = []
      currentRootName.value = ''
      return
    }

    currentRootName.value = resolvedRoot.label
    platformTabs.value = getMcPluginPlatformEntries(tree, resolvedRoot.key)

    const firstTab = platformTabs.value[0]
    if (!firstTab) {
      return
    }

    const needsCatalogRoute =
      route.name === 'resources' ||
      currentRootSlug.value !== resolvedRoot.key ||
      !platformTabs.value.some((tab) => tab.slug === currentEntrySlug.value)

    if (needsCatalogRoute) {
      await router.replace({
        name: 'resource-catalog',
        params: { rootSlug: resolvedRoot.key, entrySlug: firstTab.slug },
        query: withListingQuery({ ...route.query }),
      })
    } else if (route.query.sale !== activeListingMode.value) {
      // 地址上没有分区（或分区非法）时补上当前分区，刷新 / 分享后落在同一个列表
      await router.replace({
        query: withListingQuery({ ...route.query }),
      })
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载资源目录失败', 'warning')
  }
}

function resolveCurrentRoot(tree: McProcessedTagTree) {
  if (currentRootSlug.value) {
    const matched = tree.roots.find((r: typeof tree.roots[number]) => r.key === currentRootSlug.value)
    if (matched) return matched
  }

  return tree.roots.find((r: typeof tree.roots[number]) => r.entries.length > 0) ?? tree.roots[0] ?? null
}

function updateViewport() {
  isMobile.value = window.innerWidth <= 900
}
</script>

<template>
  <main class="portal-page catalog-layout-page">
    <!-- 顶栏两行（专区行 / 子类行）合并成一行：面包屑 + 分区标题 -->
    <nav v-if="!isMobile" class="catalog-breadcrumb" aria-label="资源分区面包屑">
      <RouterLink class="catalog-breadcrumb__link" :to="{ name: 'resources' }">资源项目</RouterLink>
      <span class="catalog-breadcrumb__sep" aria-hidden="true">/</span>

      <TDropdown trigger="click" placement="bottom-start" @command="handleRootCommand">
        <button class="catalog-breadcrumb__trigger" type="button" aria-label="切换专区">
          <span>{{ currentRootName || '选择专区' }}</span>
          <TIcon class="catalog-breadcrumb__chevron">
            <ArrowDown />
          </TIcon>
        </button>
        <template #dropdown>
          <TDropdownMenu>
            <TDropdownItem v-for="root in rootTabs" :key="root.slug" :command="root.slug"
              :active="root.slug === currentRootSlug">
              {{ root.label }}
            </TDropdownItem>
          </TDropdownMenu>
        </template>
      </TDropdown>

      <span class="catalog-breadcrumb__sep" aria-hidden="true">/</span>
      <h1 class="catalog-breadcrumb__title">{{ currentEntryLabel }}</h1>
    </nav>

    <!-- 工具条：第一行「分区 segmented（唯一一处）+ 子类下划线 Tab」，
         第二行「已选筛选 chip + 排序下拉 + 统计 / 翻页」 -->
    <section v-if="!isMobile" class="catalog-toolbar">
      <div class="catalog-toolbar__row">
        <ResourceModeSwitch :model-value="activeListingMode" :counts="listingCounts"
          @update:model-value="switchListingMode" />

        <nav class="catalog-subtabs" aria-label="子分区切换">
          <button v-for="tab in platformTabs" :key="tab.slug" class="catalog-subtab"
            :class="{ 'catalog-subtab--active': tab.slug === currentEntrySlug }" type="button"
            @click="openPlatform(tab.slug)">
            {{ tab.groupName }}
          </button>
        </nav>
      </div>

      <div class="catalog-toolbar__row">
        <div class="catalog-chipbar">
          <template v-if="activeFilterChips.length > 0">
            <button v-for="chip in activeFilterChips" :key="chip.key" class="catalog-chip" type="button"
              :aria-label="`移除筛选：${chip.label} ${chip.tag}`" @click="removeFilterChip(chip)">
              <span>{{ chip.label }}：{{ chip.tag }}</span>
              <span class="catalog-chip__close" aria-hidden="true">×</span>
            </button>
            <button class="catalog-chip-clear" type="button" @click="clearAllFilters">清除全部</button>
          </template>
          <span v-else class="catalog-chipbar__hint">未选择筛选条件</span>
        </div>

        <div class="catalog-toolbar__trailing">
          <TDropdown trigger="click" placement="bottom-end" @command="handleSortCommand">
            <button class="catalog-sort-trigger" type="button" aria-label="排序方式">
              <span>排序：{{ selectedSort }}</span>
              <TIcon class="catalog-sort-trigger__chevron">
                <ArrowDown />
              </TIcon>
            </button>
            <template #dropdown>
              <TDropdownMenu>
                <TDropdownItem v-for="option in sortOptions" :key="option" :command="option"
                  :active="selectedSort === option">
                  {{ option }}
                </TDropdownItem>
              </TDropdownMenu>
            </template>
          </TDropdown>

          <span class="catalog-count">
            共 {{ pageState.totalItems }} 个
            <template v-if="pageState.total > 1"> · 第 {{ pageState.current }}/{{ pageState.total }} 页</template>
          </span>

          <!-- 分页只在多页时出现（单页整条隐藏） -->
          <nav v-if="pageState.total > 1" class="catalog-pager" aria-label="结果分页">
            <button class="catalog-pager__btn" type="button" :disabled="!pageState.hasPrev" @click="goPrevPage">
              上一页
            </button>
            <template v-for="(page, index) in pageNumbers" :key="`${page}-${index}`">
              <span v-if="page === '…'" class="catalog-pager__ellipsis" aria-hidden="true">…</span>
              <button v-else class="catalog-pager__btn"
                :class="{ 'catalog-pager__btn--active': page === pageState.current }" type="button"
                :aria-current="page === pageState.current ? 'page' : undefined" @click="goToPage(page)">
                {{ page }}
              </button>
            </template>
            <button class="catalog-pager__btn" type="button" :disabled="!pageState.hasNext" @click="goNextPage">
              下一页
            </button>
          </nav>
        </div>
      </div>
    </section>

    <section class="catalog-layout-page__browser">
      <MobileResourceList v-if="isMobile" :platform="currentPlatform" :rootSlug="currentRootSlug"
        :entrySlug="currentEntrySlug" :groupName="currentTab?.groupName || currentEntryLabel"
        :listing-mode="activeListingMode" @switch-listing-mode="switchListingMode"
        @listing-counts="handleListingCounts" />
      <ResourceCatalog v-else ref="catalogRef" :platform="currentPlatform" :rootSlug="currentRootSlug"
        :entrySlug="currentEntrySlug" :groupName="currentTab?.groupName || currentEntryLabel"
        :listing-mode="activeListingMode" @page-state-change="handlePageStateChange"
        @listing-counts="handleListingCounts" @filters-change="handleFiltersChange"
        @switch-listing-mode="switchListingMode" />
    </section>
  </main>
</template>
