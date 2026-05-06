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
  return platformTabs.value.find((tab) => tab.slug === currentEntrySlug.value) ?? platformTabs.value[0] ?? null
})
const currentPlatform = computed(() => currentTab.value?.platform ?? '')
const currentEntryLabel = computed(() => currentTab.value?.groupName ?? '当前分区')
const catalogStats = computed(() => [
  { label: '根分区', value: `${rootTabs.value.length}` },
  { label: '二级分区', value: `${platformTabs.value.length}` },
  { label: '当前平台', value: currentPlatform.value || '待选择' },
  { label: '浏览模式', value: '门户目录' },
])

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
      currentRootSlug.value !== resolvedRoot.key
      || !platformTabs.value.some((tab) => tab.slug === currentEntrySlug.value)
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
  <main class="portal-page">
    <section class="portal-page__panel catalog-switch-panel">
      <div class="portal-page__section-header">
        <div>
          <p class="portal-page__eyebrow">目录切换</p>
          <h2>{{ currentRootName || '免费资源目录' }}</h2>
        </div>
        <span class="catalog-switch-panel__current">当前：{{ currentEntryLabel }}</span>
      </div>

      <div class="catalog-nav-stack">
        <section class="catalog-nav-row" aria-label="根节点导航">
          <span class="catalog-nav-row__label">根节点</span>
          <div class="hero-root-nav">
            <button v-for="root in rootTabs" :key="root.slug" class="root-node-chip"
              :class="{ active: root.slug === currentRootSlug }" type="button"
              @click="openRoot(root.slug, root.firstEntrySlug)">
              {{ root.label }}
            </button>
          </div>
        </section>
        <section class="catalog-nav-row" aria-label="二级节点导航">
          <span class="catalog-nav-row__label">二级节点</span>
          <div class="hero-actions hero-actions--catalog">
            <button v-for="tab in platformTabs" :key="tab.slug" class="platform-path-chip"
              :class="{ active: tab.slug === currentEntrySlug }" type="button" @click="openPlatform(tab.slug)">
              <span class="platform-path-chip__label">{{ tab.groupName }}</span>
            </button>
          </div>
        </section>
      </div>
    </section>

    <section class="portal-page__panel">
      <ResourceCatalog :platform="currentPlatform" :rootSlug="currentRootSlug"
        :groupName="currentTab?.groupName || currentEntryLabel" />
    </section>
  </main>
</template>
