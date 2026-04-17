<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import {
  listPublicMcResources,
  type McResourcePlatform,
  type PublicMcResourceItem,
} from '@/api/resources'
import {
  getAllPublicMcTagTree,
  getTagFilterSections,
  normalizeTagName,
  type McTagFilterSection,
  type McTagGroup,
} from '@/api/resourceTags'
import { useMultiSelectTags } from '@/composables/useMultiSelectTags'
import { useToast } from '@/composables/useToast'

type McCardItem = {
  id: number
  title: string
  author: string
  description: string
  groupTags: Record<string, string[]>
  tags: string[]
  updatedAt: string
  sourceUrl: string
  coverUrl: string | null
}

type FilterSectionView = McTagFilterSection & {
  selected: string[]
}

const props = defineProps<{
  platform: McResourcePlatform | null
  groupName: string
}>()

const sortOptions = ['最新', '标题']
const { showToast } = useToast()
const route = useRoute()
const router = useRouter()

const tagTree = ref<McTagGroup[]>([])
const filterSections = ref<FilterSectionView[]>([])

const searchQuery = ref('')
const selectedSort = ref('最新')

const {
  onTagPointerDown,
  onTagPointerEnter,
  onTagPointerUp,
  onTagPointerCancel,
  onTagClick,
} = useMultiSelectTags()

const cards = ref<McCardItem[]>([])

const groupLabel = computed(() => normalizeTagName(props.groupName || '当前分区'))
const searchPlaceholder = computed(() => `搜索 ${groupLabel.value} 资源...`)
const fallbackIconClass = computed(() => (props.platform === 'bedrock' ? 'bg-teal' : props.platform === 'java' ? 'bg-blue' : 'bg-blue'))
const fallbackIcon = computed(() => (props.platform === 'bedrock' ? '🧱' : props.platform === 'java' ? '☕' : '📁'))
const primaryFilterSection = computed(() => filterSections.value[0] ?? null)
const secondaryFilterSections = computed(() => filterSections.value.slice(1))

function normalizeQueryValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function applyFiltersFromQuery() {
  searchQuery.value = typeof route.query.search === 'string' ? route.query.search.trim() : ''
  filterSections.value.forEach((section) => {
    section.selected = normalizeQueryValues(route.query[section.queryKey])
  })
}

function mapResourceToCard(item: PublicMcResourceItem): McCardItem {
  const tags = Array.from(new Set(item.tag_selections.flatMap((entry) => entry.tag_names)))
  const groupTags = Object.fromEntries(
    item.tag_selections.map((entry) => [
      normalizeTagName(entry.group_name),
      entry.tag_names.map((tag) => normalizeTagName(tag)).filter(Boolean),
    ]),
  )

  return {
    id: item.id,
    title: item.title,
    author: item.author,
    description: item.description,
    groupTags,
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
    if (searchQuery.value && !card.title.toLowerCase().includes(searchQuery.value.toLowerCase())) {
      return false
    }

    for (const section of filterSections.value) {
      if (section.selected.length === 0) {
        continue
      }

      const groupValues = card.groupTags[section.label] ?? []
      const matched = section.selected.some((tag) => groupValues.includes(tag))
      if (!matched) {
        return false
      }
    }

    return true
  })

  if (selectedSort.value === '标题') {
    return filtered.slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  }
  return filtered.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
})

function resetFilters() {
  searchQuery.value = ''
  filterSections.value.forEach((section) => {
    section.selected = []
  })
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
      getAllPublicMcTagTree(),
      props.platform ? listPublicMcResources(props.platform) : Promise.resolve([]),
    ])
    tagTree.value = groups
    cards.value = resources.map(mapResourceToCard)
    filterSections.value = getTagFilterSections(tagTree.value, props.groupName).map((section) => ({
      ...section,
      selected: [],
    }))
    applyFiltersFromQuery()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载标签失败', 'warning')
  }
}

onMounted(() => {
  void loadTagTree()
})

watch(
  () => [props.platform, props.groupName],
  () => {
    void loadTagTree()
  },
)

watch(
  () => route.query,
  () => {
    applyFiltersFromQuery()
  },
)
</script>

<template>
  <section>
    <section class="mc-filter-panel">
      <div class="filter-row flex-between">
        <div v-if="primaryFilterSection" class="filter-group">
          <span class="label">{{ primaryFilterSection.label }}：</span>
          <button v-for="tag in primaryFilterSection.tags" :key="tag" class="tag"
            :class="{ active: primaryFilterSection.selected.includes(tag) }"
            @pointerdown="onTagPointerDown(primaryFilterSection.selected, tag, $event)"
            @pointerenter="onTagPointerEnter(primaryFilterSection.selected, tag)" @pointerup="onTagPointerUp"
            @pointercancel="onTagPointerCancel" @click="onTagClick(primaryFilterSection.selected, tag, toggleFilter)">
            {{ tag }}
          </button>
        </div>
        <div class="search-bar">
          <input v-model="searchQuery" type="text" :placeholder="searchPlaceholder" />
          <span class="search-icon">🔍</span>
        </div>
      </div>

      <div v-for="section in secondaryFilterSections" :key="section.id" class="filter-row">
        <div class="filter-group" :class="{ 'align-start': section.tags.length > 8 }">
          <span class="label" :class="{ 'mt-1': section.tags.length > 8 }">{{ section.label }}：</span>
          <div class="tag-cloud">
            <button v-for="tag in section.tags" :key="tag" class="tag"
              :class="{ active: section.selected.includes(tag) }"
              @pointerdown="onTagPointerDown(section.selected, tag, $event)"
              @pointerenter="onTagPointerEnter(section.selected, tag)" @pointerup="onTagPointerUp"
              @pointercancel="onTagPointerCancel" @click="onTagClick(section.selected, tag, toggleFilter)">
              {{ tag }}
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
        <div v-else class="res-icon" :class="fallbackIconClass">{{ fallbackIcon }}</div>
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
