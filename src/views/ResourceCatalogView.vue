<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ResourceCatalog from '@/components/ResourceCatalog.vue'
import {
  getMcPluginPlatformEntries,
  getProcessedTagTree,
  getTagRouteSlug,
  type McPluginPlatformEntry,
  type McProcessedTagTree,
} from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const route = useRoute()
const { showToast } = useToast()
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
const sortOptions = ['最新', '点赞'] as const
const selectedSort = ref<(typeof sortOptions)[number]>('最新')
const catalogRef = ref<InstanceType<typeof ResourceCatalog> | null>(null)
const pageState = ref({
  current: 1,
  total: 1,
  hasPrev: false,
  hasNext: false,
  totalItems: 0,
})
const catalogStats = computed(() => [
  { label: '根分区', value: `${rootTabs.value.length}` },
  { label: '二级分区', value: `${platformTabs.value.length}` },
  { label: '当前平台', value: currentPlatform.value || '待选择' },
  { label: '浏览模式', value: '门户目录' },
])

function setCatalogSort(sort: (typeof sortOptions)[number]) {
  selectedSort.value = sort
  catalogRef.value?.setSort(sort)
}

function resetCatalogFilters() {
  selectedSort.value = '最新'
  catalogRef.value?.resetFilters()
}

function handlePageStateChange(state: {
  current: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  totalItems: number
}) {
  pageState.value = state
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

  router.push({ name: 'resource-catalog', params: { rootSlug: currentRootSlug.value, entrySlug } })
}

function openRoot(rootSlug: string, firstEntrySlug: string | null) {
  if (rootSlug === currentRootSlug.value) {
    return
  }

  router.push({
    name: 'resource-catalog',
    params: firstEntrySlug ? { rootSlug, entrySlug: firstEntrySlug } : { rootSlug },
  })
}

onMounted(() => {
  void loadPlatformTabs()
})

watch(
  () => [currentRootSlug.value, currentEntrySlug.value],
  () => {
    void loadPlatformTabs()
  },
)

async function loadPlatformTabs() {
  try {
    const tree = await getProcessedTagTree()

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

    if (
      currentRootSlug.value !== resolvedRoot.key ||
      !platformTabs.value.some((tab) => tab.slug === currentEntrySlug.value)
    ) {
      await router.replace({
        name: 'resource-catalog',
        params: { rootSlug: resolvedRoot.key, entrySlug: firstTab.slug },
        query: route.query,
      })
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载免费资源目录失败', 'warning')
  }
}

function resolveCurrentRoot(tree: McProcessedTagTree) {
  if (currentRootSlug.value) {
    const matched = tree.roots.find((r) => r.key === currentRootSlug.value)
    if (matched) return matched
  }

  return tree.roots.find((r) => r.entries.length > 0) ?? tree.roots[0] ?? null
}
</script>

<template>
  <main class="portal-page catalog-layout-page">
    <section class="portal-page__panel catalog-switch-panel">
      <section class="catalog-nav-row catalog-nav-row--root-top catalog-nav-row--no-label" aria-label="根节点导航">
        <div class="hero-root-nav">
          <button v-for="root in rootTabs" :key="root.slug" class="root-node-chip"
            :class="{ active: root.slug === currentRootSlug }" type="button"
            @click="openRoot(root.slug, root.firstEntrySlug)">
            {{ root.label }}
          </button>
        </div>
      </section>
    </section>

    <section class="catalog-layout-page__body">
      <aside class="catalog-layout-page__nodes">
        <div class="catalog-nav-stack">
          <section class="catalog-nav-row" aria-label="二级节点导航">
            <div class="hero-actions hero-actions--catalog">
              <button v-for="tab in platformTabs" :key="tab.slug" class="platform-path-chip"
                :class="{ active: tab.slug === currentEntrySlug }" type="button" @click="openPlatform(tab.slug)">
                <span class="platform-path-chip__label">{{ tab.groupName }}</span>
              </button>
            </div>
          </section>
        </div>
      </aside>

      <section class="catalog-layout-page__sort" aria-label="排序与筛选操作">
        <div class="catalog-sort-panel">
          <div class="catalog-nav-row__tools">
            <div class="catalog-nav-row__sort-actions">
              <button v-for="s in sortOptions" :key="s" class="catalog-nav-row__sort-chip"
                :class="{ 'catalog-nav-row__sort-chip--active': selectedSort === s }" type="button"
                @click="setCatalogSort(s)">
                {{ s }}
              </button>
              <button class="catalog-nav-row__reset" type="button" @click="resetCatalogFilters">
                ↻ 重置筛选
              </button>
            </div>
            <div class="catalog-nav-row__pager">
              <button class="catalog-nav-row__pager-btn" type="button" :disabled="!pageState.hasPrev"
                @click="goPrevPage">
                上一页
              </button>
              <span class="catalog-nav-row__pager-text">{{ pageState.current }} / {{ pageState.total }}</span>
              <button class="catalog-nav-row__pager-btn" type="button" :disabled="!pageState.hasNext"
                @click="goNextPage">
                下一页
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="catalog-layout-page__browser">
        <ResourceCatalog ref="catalogRef" :platform="currentPlatform" :rootSlug="currentRootSlug"
          :entrySlug="currentEntrySlug" :groupName="currentTab?.groupName || currentEntryLabel"
          @page-state-change="handlePageStateChange" />
      </section>
    </section>
  </main>
</template>
