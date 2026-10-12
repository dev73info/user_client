<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'

import { ArrowDown, TDropdown, TDropdownItem, TDropdownMenu, TIcon } from 'ui_73info'

import ResourceCatalog from '@/components/ResourceCatalog.vue'
import ResourceDetailPanel from '@/components/ResourceDetailPanel.vue'
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
  // 换分区等于换一批数据，右栏的选中项随之作废。
  // 这里只清本地状态不单独导航：下面这次 replace 会用 withoutSelection 把 `?resource=` 一并摘掉，
  // 连续两次 replace 只会白跑一次历史记录。
  selectedResourceId.value = null
  try {
    await router.replace({ query: { ...withoutSelection(route.query), sale: mode } })
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

/**
 * 当前选中的资源（列表页的页内详情：桌面端与移动端都走它）。
 *
 * 选中态落在 URL 上（`?resource=<id>`），刷新 / 复制分享可还原；它只是**同一路由内的 query 变化**，
 * 页面组件不会卸载重挂。选中后列表整块收起、详情独占内容区（见模板）。
 */
const selectedResourceId = ref<number | null>(null)

function parseSelectedResourceId(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  const id = Number.parseInt(String(raw ?? ''), 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * 选中项只在当前列表里成立：换专区 / 子分区 / 免费付费分区时把它从 query 中摘掉
 * （否则会出现「地址上选中的是付费资源、左边却在看免费分区」这种对不上的状态）。
 */
function withoutSelection(query: LocationQueryRaw = {}): LocationQueryRaw {
  const next = { ...query }
  delete next.resource
  return next
}

function syncSelectionFromQuery() {
  selectedResourceId.value = parseSelectedResourceId(route.query.resource)
}

/** 列表里点了「查看详情」：就地选中并写回 URL，不跳独立详情路由 */
function selectResource(id: number) {
  if (selectedResourceId.value === id) {
    return
  }
  selectedResourceId.value = id
  void router.replace({ query: { ...route.query, resource: String(id) } })
}

/** 右栏「收起详情」/ 工具条「返回」：清掉选中并把它从 URL 上摘掉（其余 query 一律保留） */
function clearSelectedResource() {
  selectedResourceId.value = null
  if ('resource' in route.query) {
    void router.replace({ query: withoutSelection(route.query) })
  }
}

watch(() => route.query.resource, syncSelectionFromQuery, { immediate: true })

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

/**
 * 列表是否至少上报过一次。
 *
 * 工具条上的计数、统计与分页都来自列表本地数据，而详情态下**整个列表不渲染**
 * （见模板里的主从单栏）。冷启动直接带 `?resource=<id>` 打开时列表没跑过，
 * 这里若照旧渲染，工具条会显示一个假的「共 0 个」；所以上报过之前一律不显示这些数字。
 * 从列表点进详情的情形不受影响：上一次上报的值仍在，返回时也不会闪一下 0。
 */
const listingReported = ref(false)

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
  listingReported.value = true
}

function handleListingCounts(counts: { free: number; paid: number }) {
  listingCounts.value = counts
  listingReported.value = true
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

  // 换子分区即换一批资源：右栏的选中项作废（只清本地状态，URL 交给下面这次 push 一并改写）
  selectedResourceId.value = null
  router.push({
    name: 'resource-catalog',
    params: { rootSlug: currentRootSlug.value, entrySlug },
    query: withListingQuery(withoutSelection(route.query)),
  })
}

function openRoot(rootSlug: string, firstEntrySlug: string | null) {
  if (rootSlug === currentRootSlug.value) {
    return
  }

  selectedResourceId.value = null
  router.push({
    name: 'resource-catalog',
    params: firstEntrySlug ? { rootSlug, entrySlug: firstEntrySlug } : { rootSlug },
    query: withListingQuery(withoutSelection(route.query)),
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
    <!-- 面包屑整条移除后，本页在桌面端只剩这一个 h1：视觉隐藏、保留在 DOM 里，
         供屏幕阅读器与搜索引擎定位当前分区；分区名在右侧分区间页签里仍然可见 -->
    <h1 v-if="!isMobile" class="catalog-visually-hidden">{{ currentEntryLabel }}</h1>

    <!-- 工具条：第一行「专区下拉 + 分区 segmented（唯一一处）+ 子类下划线 Tab」，
         第二行「已选筛选 chip + 排序下拉 + 统计 / 翻页」 -->
    <section v-if="!isMobile" class="catalog-toolbar">
      <div class="catalog-toolbar__row">
        <div class="catalog-toolbar__lead">
          <TDropdown trigger="click" placement="bottom-start" @command="handleRootCommand">
            <button class="catalog-zone-trigger" type="button" aria-label="切换专区">
              <span>{{ currentRootName || '选择专区' }}</span>
              <TIcon class="catalog-zone-trigger__chevron">
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

          <ResourceModeSwitch :model-value="activeListingMode"
            :counts="listingReported ? listingCounts : null" @update:model-value="switchListingMode" />
        </div>

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

          <!-- 统计与分页来自列表的本地数据；详情态下列表不渲染、冷启动深链时更没跑过，
               所以在列表首次上报之前不显示（否则会出现假的「共 0 个」） -->
          <span v-if="listingReported" class="catalog-count">
            共 {{ pageState.totalItems }} 个
            <template v-if="pageState.total > 1"> · 第 {{ pageState.current }}/{{ pageState.total }} 页</template>
          </span>

          <!-- 分页只在多页时出现（单页整条隐藏） -->
          <nav v-if="listingReported && pageState.total > 1" class="catalog-pager" aria-label="结果分页">
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

          <!-- 打开详情才出现：清掉 `?resource=` 让列表回来，其余 query（专区 / 分区 / 排序 / 筛选）
               原样保留，用户回到点进详情前的位置 -->
          <button v-if="selectedResourceId !== null" class="catalog-back-btn" type="button"
            aria-label="返回资源列表" @click="clearSelectedResource">
            <span aria-hidden="true">←</span>
            <span>返回</span>
          </button>
        </div>
      </div>
    </section>

    <section class="catalog-layout-page__browser">
      <!-- 移动端（≤900px）：与桌面端同一套入口与同一套「页内详情」——
           未选中时列表独占内容区，选中一条资源时列表整块收起、详情铺满；
           「收起详情」由面板自身提供（工具条只在桌面端渲染）。
           KeepAlive 同桌面端：收起期间列表实例被缓存，返回时筛选 / 页码原样恢复。 -->
      <template v-if="isMobile">
        <KeepAlive>
          <MobileResourceList v-if="selectedResourceId === null" :platform="currentPlatform"
            :rootSlug="currentRootSlug" :entrySlug="currentEntrySlug"
            :groupName="currentTab?.groupName || currentEntryLabel" :listing-mode="activeListingMode"
            @switch-listing-mode="switchListingMode" @listing-counts="handleListingCounts" />
        </KeepAlive>

        <aside v-if="selectedResourceId !== null" class="catalog-master__detail" aria-label="资源详情">
          <ResourceDetailPanel :key="selectedResourceId" :resource-id="selectedResourceId"
            @close="clearSelectedResource" />
        </aside>
      </template>

      <!-- 桌面端是「单栏两块、同一时刻只渲染一块」：未选中时资源列表独占内容区整宽，
           选中一条资源时整个列表收起、详情独占内容区整宽（不再左右并排，也不留空栏）。
           选中只改 URL 的 query（`?resource=<id>`），不整页跳转、不切路由。
           KeepAlive：列表收起时用 `v-if` 让整块从文档里移除（选择器查不到，也不再跑取数与布局），
           但组件实例被缓存住，返回时排序 / 已选筛选 / 当前页码原样恢复，不用重新取数。 -->
      <div v-else class="catalog-master">
        <KeepAlive>
          <ResourceCatalog v-if="selectedResourceId === null" ref="catalogRef" class="catalog-master__list"
            master-detail :platform="currentPlatform" :rootSlug="currentRootSlug" :entrySlug="currentEntrySlug"
            :groupName="currentTab?.groupName || currentEntryLabel" :listing-mode="activeListingMode"
            @page-state-change="handlePageStateChange" @listing-counts="handleListingCounts"
            @filters-change="handleFiltersChange" @switch-listing-mode="switchListingMode"
            @select-resource="selectResource" />
        </KeepAlive>

        <aside v-if="selectedResourceId !== null" class="catalog-master__detail" aria-label="资源详情">
          <ResourceDetailPanel :key="selectedResourceId" :resource-id="selectedResourceId"
            @close="clearSelectedResource" />
        </aside>
      </div>
    </section>
  </main>
</template>
