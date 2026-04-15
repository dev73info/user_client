<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiUrl } from '@/api/http'
import { listPublicMcResources, type PublicMcResourceItem } from '@/api/mcResources'
import { getPlatformTagFilters, getPublicMcTagTree, type McTagGroup } from '@/api/mcTags'
import { useToast } from '@/composables/useToast'
import { useMultiSelectTags } from '@/composables/useMultiSelectTags'
import '../styles/McPluginsView.css'

type McCardItem = {
  id: number
  title: string
  author: string
  description: string
  platform: string
  side: string[]
  version: string[]
  loader: string[]
  category: string[]
  tags: string[]
  updatedAt: string
  sourceUrl: string
  coverUrl: string | null
}

const currentPlatform = 'Java'
const sortOptions = ['最新', '标题']
const { showToast } = useToast()
const router = useRouter()

const tagTree = ref<McTagGroup[]>([])
const sides = ref<string[]>([])
const versions = ref<string[]>([])
const loaders = ref<string[]>([])
const categories = ref<string[]>([])

const searchQuery = ref('')
const selectedSides = ref<string[]>([])
const selectedVersions = ref<string[]>([])
const selectedLoaders = ref<string[]>([])
const selectedCategories = ref<string[]>([])
const selectedSort = ref('最新')

const {
  onTagPointerDown,
  onTagPointerEnter,
  onTagPointerUp,
  onTagPointerCancel,
  onTagClick,
} = useMultiSelectTags()

const cards = ref<McCardItem[]>([])

function extractTagValues(item: PublicMcResourceItem, groupName: string): string[] {
  return item.tag_selections.find((entry) => entry.group_name === groupName)?.tag_names ?? []
}

function mapResourceToCard(item: PublicMcResourceItem): McCardItem {
  const tags = Array.from(new Set(item.tag_selections.flatMap((entry) => entry.tag_names)))

  return {
    id: item.id,
    title: item.title,
    author: item.author,
    description: item.description,
    platform: 'Java',
    side: extractTagValues(item, '适用端'),
    version: extractTagValues(item, '版本'),
    loader: extractTagValues(item, '加载器'),
    category: extractTagValues(item, '类别'),
    tags: tags.length > 0 ? tags : ['未标注'],
    updatedAt: item.updated_at,
    sourceUrl: item.source_url,
    coverUrl: item.cover_url ? apiUrl(item.cover_url) : null,
  }
}

function toggleFilter(list: string[], item: string) {
  const index = list.indexOf(item)
  if (index >= 0) {
    list.splice(index, 1)
  } else {
    list.push(item)
  }
}

const filteredCards = computed(() => {
  const filtered = cards.value.filter((card) => {
    if (card.platform !== currentPlatform) {
      return false
    }
    if (searchQuery.value && !card.title.toLowerCase().includes(searchQuery.value.toLowerCase())) {
      return false
    }
    const sideMatch = selectedSides.value.some((side) => card.side.includes(side))
    if (selectedSides.value.length > 0 && !sideMatch) return false
    const versionMatch = selectedVersions.value.some((version) => card.version.includes(version))
    if (selectedVersions.value.length > 0 && !versionMatch) return false
    const loaderMatch = selectedLoaders.value.some((loader) => card.loader.includes(loader))
    if (selectedLoaders.value.length > 0 && !loaderMatch) return false
    const categoryMatch = selectedCategories.value.some((category) => card.category.includes(category))
    if (selectedCategories.value.length > 0 && !categoryMatch) return false
    return true
  })

  if (selectedSort.value === '标题') {
    return filtered.slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  }
  return filtered.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
})

function resetFilters() {
  searchQuery.value = ''
  selectedSides.value = [...sides.value]
  selectedVersions.value = [...versions.value]
  selectedLoaders.value = [...loaders.value]
  selectedCategories.value = [...categories.value]
  selectedSort.value = '最新'
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '最近更新'
  }

  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openResource(card: McCardItem) {
  router.push({ name: 'mc-resource-detail', params: { id: card.id } })
}

async function loadTagTree() {
  try {
    const [groups, resources] = await Promise.all([
      getPublicMcTagTree(),
      listPublicMcResources('java'),
    ])
    tagTree.value = groups
    cards.value = resources.map(mapResourceToCard)
    const filters = getPlatformTagFilters(tagTree.value, 'Java 版')

    sides.value = filters.sides
    versions.value = filters.versions
    loaders.value = filters.loaders
    categories.value = filters.categories
    selectedSides.value = [...filters.sides]
    selectedVersions.value = [...filters.versions]
    selectedLoaders.value = [...filters.loaders]
    selectedCategories.value = [...filters.categories]
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载标签失败', 'warning')
  }
}

onMounted(() => {
  loadTagTree()
})
</script>

<template>
  <section>
    <section class="mc-filter-panel">
      <div class="filter-row flex-between">
        <div class="filter-group">
          <span class="label">端：</span>
          <button v-for="side in sides" :key="side" class="tag" :class="{ active: selectedSides.includes(side) }"
            @pointerdown="onTagPointerDown(selectedSides, side, $event)"
            @pointerenter="onTagPointerEnter(selectedSides, side)" @pointerup="onTagPointerUp"
            @pointercancel="onTagPointerCancel" @click="onTagClick(selectedSides, side, toggleFilter)">
            {{ side }}
          </button>
        </div>
        <div class="search-bar">
          <input v-model="searchQuery" type="text" placeholder="搜索 Java 版资源..." />
          <span class="search-icon">🔍</span>
        </div>
      </div>

      <div class="filter-row">
        <div class="filter-group">
          <span class="label">版本：</span>
          <div class="tag-cloud">
            <button v-for="v in versions" :key="v" class="tag" :class="{ active: selectedVersions.includes(v) }"
              @pointerdown="onTagPointerDown(selectedVersions, v, $event)"
              @pointerenter="onTagPointerEnter(selectedVersions, v)" @pointerup="onTagPointerUp"
              @pointercancel="onTagPointerCancel" @click="onTagClick(selectedVersions, v, toggleFilter)">
              {{ v }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <div class="filter-group">
          <span class="label">加载器：</span>
          <div class="tag-cloud">
            <button v-for="l in loaders" :key="l" class="tag" :class="{ active: selectedLoaders.includes(l) }"
              @pointerdown="onTagPointerDown(selectedLoaders, l, $event)"
              @pointerenter="onTagPointerEnter(selectedLoaders, l)" @pointerup="onTagPointerUp"
              @pointercancel="onTagPointerCancel" @click="onTagClick(selectedLoaders, l, toggleFilter)">
              {{ l }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <div class="filter-group align-start">
          <span class="label mt-1">类别：</span>
          <div class="tag-cloud">
            <button v-for="c in categories" :key="c" class="tag" :class="{ active: selectedCategories.includes(c) }"
              @pointerdown="onTagPointerDown(selectedCategories, c, $event)"
              @pointerenter="onTagPointerEnter(selectedCategories, c)" @pointerup="onTagPointerUp"
              @pointercancel="onTagPointerCancel" @click="onTagClick(selectedCategories, c, toggleFilter)">
              {{ c }}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-row flex-between mt-2">
        <div class="filter-group">
          <span class="label">排序：</span>
          <button v-for="s in sortOptions" :key="s" class="tag" :class="{ active: selectedSort === s }"
            @click="selectedSort = s">
            {{ s }}
          </button>
        </div>
        <button class="btn-reset" type="button" @click="resetFilters">↻ 重置筛选</button>
      </div>
    </section>

    <section class="mc-content-grid">
      <div v-for="card in filteredCards" :key="card.id" class="res-card">
        <div v-if="card.coverUrl" class="res-icon res-icon--image">
          <img :src="card.coverUrl" :alt="card.title" class="res-icon__image" />
        </div>
        <div v-else class="res-icon bg-blue">☕</div>
        <div class="res-info">
          <h3>{{ card.title }}</h3>
          <p class="author">by {{ card.author }}</p>
          <p class="desc">{{ card.description }}</p>
          <div class="res-tags">
            <span v-for="tag in card.tags" :key="`${card.id}-${tag}`">{{ tag }}</span>
          </div>
        </div>
        <div class="res-stats">
          <span>{{ formatUpdatedAt(card.updatedAt) }}</span>
          <button class="btn-download" type="button" @click="openResource(card)">
            查看详情
          </button>
        </div>
      </div>
      <p v-if="filteredCards.length === 0" class="empty-state">当前没有符合条件的资源。</p>
    </section>
  </section>
</template>
