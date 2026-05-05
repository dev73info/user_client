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
const catalogSignals = computed(() => [
  currentRootName.value ? `当前根分区：${currentRootName.value}` : '自动定位可用根分区',
  currentEntryLabel.value ? `当前二级分区：${currentEntryLabel.value}` : '自动定位可用二级分区',
  '支持按根节点与二级节点连续筛选',
])
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
    <section class="portal-page__hero">
      <div class="portal-page__hero-copy">
        <p class="portal-page__eyebrow">Resource Catalog</p>
        <h1>{{ currentRootName || '免费资源目录' }}</h1>
        <p>按根节点与二级分区逐层浏览公开资源目录，当前页已切换到与门户首页一致的视觉层，目录切换和资源浏览能力保持不变。</p>

        <div class="portal-page__signal-list">
          <span v-for="signal in catalogSignals" :key="signal" class="portal-page__signal">{{ signal }}</span>
        </div>

        <div class="portal-page__hero-actions">
          <button class="portal-page__primary" type="button"
            @click="router.push({ name: 'free-resources' })">返回导航</button>
          <button class="portal-page__secondary" type="button" @click="router.push({ name: 'home' })">返回门户</button>
        </div>
      </div>

      <div class="portal-page__hero-visual" aria-hidden="true">
        <div class="portal-page__hero-orbit">
          <div class="portal-page__hero-core">录</div>
          <div class="portal-page__hero-float portal-page__hero-float--one">根</div>
          <div class="portal-page__hero-float portal-page__hero-float--two">类</div>
          <div class="portal-page__hero-float portal-page__hero-float--three">签</div>
          <div class="portal-page__hero-float portal-page__hero-float--four">源</div>
        </div>
      </div>
    </section>

    <section class="portal-page__stats">
      <article v-for="item in catalogStats" :key="item.label" class="portal-page__stat-card">
        <strong>{{ item.value }}</strong>
        <span>{{ item.label }}</span>
      </article>
    </section>

    <section class="portal-page__panel">
      <div class="portal-page__section-header">
        <div>
          <p class="portal-page__eyebrow">目录切换</p>
          <h2>继续沿用现有分区导航能力</h2>
        </div>
      </div>

      <div class="catalog-nav-stack">
        <section class="catalog-nav-row" aria-label="根节点导航">
          <div class="catalog-nav-row__header">
            <span class="catalog-nav-row__label">根节点</span>
            <span class="catalog-nav-row__meta">切换资源大类</span>
          </div>
          <div class="hero-root-nav">
            <button v-for="root in rootTabs" :key="root.slug" class="root-node-chip"
              :class="{ active: root.slug === currentRootSlug }" type="button"
              @click="openRoot(root.slug, root.firstEntrySlug)">
              {{ root.label }}
            </button>
          </div>
        </section>
        <section class="catalog-nav-row" aria-label="二级节点导航">
          <div class="catalog-nav-row__header">
            <span class="catalog-nav-row__label">二级节点</span>
            <span class="catalog-nav-row__meta">当前：{{ currentEntryLabel }}</span>
          </div>
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
