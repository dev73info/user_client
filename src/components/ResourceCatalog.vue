<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { HttpError, apiUrl } from '@/api/http'
import {
  invalidateResourceListCache,
  likePublicMcResource,
  listPublicMcResources,
  unlikePublicMcResource,
  type McResourcePlatform,
  type PublicMcResourceItem,
} from '@/api/resources'
import {
  getProcessedTagTree,
  getResourceDetailSlug,
  getTagFilterSections,
  getTagRouteSlug,
  normalizeTagName,
  type McTagFilterSection,
} from '@/api/resourceTags'
import { useMultiSelectTags } from '@/composables/useMultiSelectTags'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type McCardItem = {
  id: number
  title: string
  ownerName: string
  author: string
  description: string
  groupTags: Record<string, string[]>
  tags: string[]
  updatedAt: string
  sourceUrl: string
  coverUrl: string | null
  likeCount: number
  likedByMe: boolean
  likeSubmitting: boolean
}

type FilterSectionView = McTagFilterSection & {
  selected: string[]
}

const props = defineProps<{
  platform: McResourcePlatform
  rootSlug: string
  entrySlug: string
  groupName: string
}>()

const sortOptions = ['最新', '点赞', '标题']
const { showToast } = useToast()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const filterSections = ref<FilterSectionView[]>([])

const searchQuery = ref('')
const selectedSort = ref('最新')

const { onTagPointerDown, onTagPointerEnter, onTagPointerUp, onTagPointerCancel, onTagClick } =
  useMultiSelectTags()

const cards = ref<McCardItem[]>([])

const groupLabel = computed(() => normalizeTagName(props.groupName || '当前分区'))
const searchPlaceholder = computed(() => `搜索 ${groupLabel.value} 资源...`)
const fallbackIconClass = computed(() => 'bg-blue')
const fallbackIcon = computed(() => '📁')
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
    ownerName: item.creator.trim() || item.author.trim() || item.title,
    author: item.author,
    description: item.description,
    groupTags,
    tags: tags.length > 0 ? tags : ['未标注'],
    updatedAt: item.updated_at,
    sourceUrl: item.source_url,
    coverUrl: item.cover_url ? apiUrl(item.cover_url) : null,
    likeCount: item.like_count ?? 0,
    likedByMe: item.liked_by_me ?? false,
    likeSubmitting: false,
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
  const normalizedSearch = searchQuery.value.trim().toLowerCase()
  const filtered = cards.value.filter((card) => {
    if (normalizedSearch) {
      const searchable = [
        card.title,
        card.description,
        card.author,
        card.ownerName,
        ...card.tags,
        ...Object.keys(card.groupTags),
        ...Object.values(card.groupTags).flat(),
      ]
        .join(' ')
        .toLowerCase()

      if (!searchable.includes(normalizedSearch)) {
        return false
      }
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
  if (selectedSort.value === '点赞') {
    return filtered
      .slice()
      .sort(
        (a, b) => b.likeCount - a.likeCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      )
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
  router.push({
    name: 'resource-detail',
    params: {
      rootSlug: props.rootSlug,
      entrySlug: props.entrySlug || getTagRouteSlug(props.groupName),
      resourceSlug: getResourceDetailSlug(card.id, card.ownerName),
    },
  })
}

function openLikeLogin() {
  showToast('请先登录后再点赞', 'info')
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
}

async function toggleCardLike(card: McCardItem) {
  if (card.likeSubmitting) {
    return
  }

  if (!auth.isAuthed || !auth.token.trim()) {
    openLikeLogin()
    return
  }

  card.likeSubmitting = true
  try {
    const state = card.likedByMe
      ? await unlikePublicMcResource(auth.token, card.id)
      : await likePublicMcResource(auth.token, card.id)
    card.likedByMe = state.liked_by_me
    card.likeCount = state.like_count
    invalidateResourceListCache()
    showToast(state.liked_by_me ? '已点赞' : '已取消点赞', 'success')
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
      openLikeLogin()
    } else {
      showToast(error instanceof Error ? error.message : '点赞操作失败', 'error')
    }
  } finally {
    card.likeSubmitting = false
  }
}

async function loadTagTree() {
  try {
    const token = auth.token?.trim() ? auth.token : null
    const [tree, resources] = await Promise.all([
      getProcessedTagTree(),
      listPublicMcResources(props.platform, token),
    ])
    cards.value = resources.map(mapResourceToCard)
    filterSections.value = getTagFilterSections(tree, props.rootSlug, props.entrySlug).map(
      (section) => ({
        ...section,
        selected: [],
      }),
    )
    applyFiltersFromQuery()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载标签失败', 'warning')
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
  () => {
    applyFiltersFromQuery()
  },
)

watch(
  () => auth.token,
  () => {
    void loadTagTree()
  },
)
</script>

<template>
  <section class="portal-resource-browser">
    <section class="portal-resource-browser__filters">
      <div class="portal-resource-browser__row portal-resource-browser__row--between">
        <div v-if="primaryFilterSection" class="portal-resource-browser__group">
          <span class="portal-resource-browser__label">{{ primaryFilterSection.label }}：</span>
          <button v-for="tag in primaryFilterSection.tags" :key="tag" class="portal-resource-browser__tag" :class="{
            'portal-resource-browser__tag--active': primaryFilterSection.selected.includes(tag),
          }" @pointerdown="onTagPointerDown(primaryFilterSection.selected, tag, $event)"
            @pointerenter="onTagPointerEnter(primaryFilterSection.selected, tag)" @pointerup="onTagPointerUp"
            @pointercancel="onTagPointerCancel" @click="onTagClick(primaryFilterSection.selected, tag, toggleFilter)">
            {{ tag }}
          </button>
        </div>

        <label class="portal-resource-browser__search">
          <span class="portal-resource-browser__search-icon">🔍</span>
          <input v-model="searchQuery" type="text" :placeholder="searchPlaceholder" />
        </label>
      </div>

      <div v-for="section in secondaryFilterSections" :key="section.id" class="portal-resource-browser__row">
        <div class="portal-resource-browser__group portal-resource-browser__group--wrap"
          :class="{ 'portal-resource-browser__group--top': section.tags.length > 8 }">
          <span class="portal-resource-browser__label">{{ section.label }}：</span>
          <div class="portal-resource-browser__tag-cloud">
            <button v-for="tag in section.tags" :key="tag" class="portal-resource-browser__tag"
              :class="{ 'portal-resource-browser__tag--active': section.selected.includes(tag) }"
              @pointerdown="onTagPointerDown(section.selected, tag, $event)"
              @pointerenter="onTagPointerEnter(section.selected, tag)" @pointerup="onTagPointerUp"
              @pointercancel="onTagPointerCancel" @click="onTagClick(section.selected, tag, toggleFilter)">
              {{ tag }}
            </button>
          </div>
        </div>
      </div>

      <div class="portal-resource-browser__row portal-resource-browser__row--between">
        <div class="portal-resource-browser__group">
          <span class="portal-resource-browser__label">排序：</span>
          <button v-for="s in sortOptions" :key="s" class="portal-resource-browser__tag"
            :class="{ 'portal-resource-browser__tag--active': selectedSort === s }" @click="selectedSort = s">
            {{ s }}
          </button>
        </div>
        <button class="portal-resource-browser__reset" type="button" @click="resetFilters">
          ↻ 重置筛选
        </button>
      </div>
    </section>

    <section class="portal-resource-browser__grid">
      <article v-for="card in filteredCards" :key="card.id" class="portal-resource-browser__card">
        <div v-if="card.coverUrl" class="portal-resource-browser__cover portal-resource-browser__cover--image">
          <img :src="card.coverUrl" :alt="card.title" class="portal-resource-browser__cover-image" />
        </div>
        <div v-else class="portal-resource-browser__cover" :class="fallbackIconClass">
          {{ fallbackIcon }}
        </div>

        <div class="portal-resource-browser__body">
          <div class="portal-resource-browser__headline">
            <div>
              <h3>{{ card.title }}</h3>
              <p class="portal-resource-browser__author">by {{ card.author }}</p>
            </div>
            <span class="portal-resource-browser__updated">{{
              formatUpdatedAt(card.updatedAt)
            }}</span>
          </div>

          <p class="portal-resource-browser__desc">{{ card.description }}</p>

          <div class="portal-resource-browser__tags">
            <span v-for="tag in card.tags" :key="`${card.id}-${tag}`">{{ tag }}</span>
          </div>

          <div class="portal-resource-browser__footer">
            <span class="portal-resource-browser__meta">{{ groupLabel }}</span>
            <div class="portal-resource-browser__actions">
              <button class="portal-resource-browser__like" type="button"
                :class="{ 'portal-resource-browser__like--active': card.likedByMe }" :disabled="card.likeSubmitting"
                :aria-pressed="card.likedByMe" @click="toggleCardLike(card)">
                <span aria-hidden="true">{{ card.likedByMe ? '♥' : '♡' }}</span>
                <span>{{ card.likeCount }}</span>
              </button>
              <button class="portal-resource-browser__action" type="button" @click="openResource(card)">
                查看详情
              </button>
            </div>
          </div>
        </div>
      </article>

      <p v-if="filteredCards.length === 0" class="portal-resource-browser__empty">
        当前没有符合条件的资源。
      </p>
    </section>
  </section>
</template>

<style scoped>
.portal-resource-browser {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.portal-resource-browser__filters,
.portal-resource-browser__card,
.portal-resource-browser__empty {
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.12);
  backdrop-filter: blur(18px);
}

.portal-resource-browser__filters {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border-radius: 24px;
}

.portal-resource-browser__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.portal-resource-browser__row--between {
  justify-content: space-between;
}

.portal-resource-browser__group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.portal-resource-browser__group--wrap {
  width: 100%;
}

.portal-resource-browser__group--top {
  align-items: flex-start;
}

.portal-resource-browser__label,
.portal-resource-browser__author,
.portal-resource-browser__updated,
.portal-resource-browser__meta {
  color: #64748b;
}

.portal-resource-browser__label {
  font-size: 13px;
  font-weight: 700;
}

.portal-resource-browser__tag,
.portal-resource-browser__reset,
.portal-resource-browser__action,
.portal-resource-browser__like {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.portal-resource-browser__tag {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.portal-resource-browser__tag--active {
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.2);
}

.portal-resource-browser__tag-cloud {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 8px;
}

.portal-resource-browser__search {
  position: relative;
  min-width: 260px;
}

.portal-resource-browser__search input {
  width: 100%;
  padding: 12px 16px 12px 40px;
  border: 1px solid rgba(198, 210, 236, 0.82);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  outline: none;
}

.portal-resource-browser__search input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
}

.portal-resource-browser__search-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
}

.portal-resource-browser__reset {
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
  color: #475569;
  font-weight: 700;
}

.portal-resource-browser__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.portal-resource-browser__card {
  display: flex;
  gap: 16px;
  padding: 18px;
  border-radius: 22px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.portal-resource-browser__card:hover {
  transform: translateY(-3px);
  box-shadow: 0 24px 40px rgba(76, 103, 172, 0.16);
}

.portal-resource-browser__cover {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 18px;
  font-size: 34px;
  color: #fff;
}

.portal-resource-browser__cover--image {
  overflow: hidden;
  background: rgba(226, 232, 240, 0.72);
}

.portal-resource-browser__cover-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portal-resource-browser__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.portal-resource-browser__headline,
.portal-resource-browser__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.portal-resource-browser__headline h3 {
  margin: 0;
  color: #0f172a;
}

.portal-resource-browser__author,
.portal-resource-browser__desc,
.portal-resource-browser__updated,
.portal-resource-browser__meta,
.portal-resource-browser__empty {
  line-height: 1.7;
}

.portal-resource-browser__author,
.portal-resource-browser__updated {
  margin: 4px 0 0;
  font-size: 12px;
}

.portal-resource-browser__desc {
  margin: 0;
  color: #475569;
}

.portal-resource-browser__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.portal-resource-browser__tags span,
.portal-resource-browser__meta {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.portal-resource-browser__action {
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 700;
}

.portal-resource-browser__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.portal-resource-browser__like {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 66px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.96);
  color: #64748b;
  font-weight: 800;
}

.portal-resource-browser__like--active {
  background: rgba(254, 226, 226, 0.94);
  color: #dc2626;
}

.portal-resource-browser__like:disabled {
  cursor: wait;
  opacity: 0.7;
}

.portal-resource-browser__empty {
  grid-column: 1 / -1;
  padding: 28px;
  border-radius: 22px;
  text-align: center;
  color: #64748b;
}

@media (max-width: 900px) {

  .portal-resource-browser__row,
  .portal-resource-browser__row--between,
  .portal-resource-browser__headline,
  .portal-resource-browser__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .portal-resource-browser__search {
    min-width: 100%;
  }

  .portal-resource-browser__grid {
    grid-template-columns: 1fr;
  }

  .portal-resource-browser__card {
    flex-direction: column;
  }

  .portal-resource-browser__actions {
    justify-content: space-between;
  }
}
</style>
