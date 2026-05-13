<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import { listRequirements, type RequirementItem } from '@/api/requirements'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { buildDevPortalUrl } from '@/config/runtime'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type CustomResourceCard = {
  id: number
  requirementId: string
  requirementTitle: string
  title: string
  ownerName: string
  author: string
  description: string
  platform: string
  rootSlug: string
  entrySlug: string
  tags: string[]
  updatedAt: string
  sourceUrl: string | null
  docsUrl: string | null
  coverUrl: string | null
  visibility: 'public' | 'private'
}

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const searchQuery = ref('')
const selectedPlatform = ref('all')
const selectedVisibility = ref<'all' | 'public' | 'private'>('all')
const selectedSort = ref<'最新' | '标题'>('最新')
const requirements = ref<RequirementItem[]>([])
const { showToast } = useToast()

const cards = computed<CustomResourceCard[]>(() => {
  return requirements.value
    .filter((item) => item.bound_resource_id != null && item.bound_resource_title)
    .map((item) => {
      const tagSelections = item.bound_resource_tag_selections ?? []
      const rootName = tagSelections.find((s) => s.group_path.length > 0)?.group_path[0] ?? ''
      const entryName =
        tagSelections.find((s) => s.group_path.length > 1)?.group_path[1] ??
        (item.bound_resource_platform || '')
      const rootAlias =
        tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 0)
          ?.group_path_aliases?.[0] ?? ''
      const entryAlias =
        tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 1)
          ?.group_path_aliases?.[1] ?? ''

      return {
        id: item.bound_resource_id as number,
        requirementId: item.requirement_id,
        requirementTitle: item.title,
        title: item.bound_resource_title as string,
        ownerName:
          item.creator?.trim() || auth.username || item.bound_resource_author?.trim() || item.title,
        author: item.bound_resource_author?.trim() || '未知作者',
        description: item.bound_resource_description?.trim() || '暂未填写资源说明。',
        platform: item.bound_resource_platform || '未知平台',
        rootSlug: rootAlias || getTagRouteSlug(rootName),
        entrySlug: entryAlias || getTagRouteSlug(entryName),
        tags: Array.from(
          new Set(
            (item.bound_resource_tag_selections ?? [])
              .flatMap((entry) => entry.tag_names)
              .filter(Boolean),
          ),
        ),
        updatedAt: item.bound_resource_updated_at || item.updated_at,
        sourceUrl: item.bound_resource_source_url ?? null,
        docsUrl: item.bound_resource_docs_url ?? null,
        coverUrl: item.bound_resource_cover_url ? apiUrl(item.bound_resource_cover_url) : null,
        visibility: item.resource_visibility === 'public' ? 'public' : 'private',
      }
    })
})

const filteredCards = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  const filtered = cards.value.filter((card) => {
    if (selectedPlatform.value !== 'all' && card.platform !== selectedPlatform.value) {
      return false
    }

    if (selectedVisibility.value !== 'all' && card.visibility !== selectedVisibility.value) {
      return false
    }

    if (!keyword) {
      return true
    }

    const haystack = [
      card.title,
      card.author,
      card.description,
      card.requirementTitle,
      ...card.tags,
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(keyword)
  })

  if (selectedSort.value === '标题') {
    return filtered.slice().sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
  }

  return filtered
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
})

const stats = computed(() => {
  const total = cards.value.length
  const publicCount = cards.value.filter((card) => card.visibility === 'public').length
  return {
    total,
    privateCount: total - publicCount,
    publicCount,
  }
})

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

function resetFilters() {
  searchQuery.value = ''
  selectedPlatform.value = 'all'
  selectedVisibility.value = 'all'
  selectedSort.value = '最新'
}

const availablePlatforms = computed(() => {
  const platforms = new Set(cards.value.map((card) => card.platform))
  return [...platforms].sort()
})

function openPrimaryLink(card: CustomResourceCard) {
  router.push({
    name: 'resource-detail',
    params: {
      rootSlug: card.rootSlug,
      entrySlug: card.entrySlug,
      resourceSlug: getResourceDetailSlug(card.id, card.ownerName),
    },
  })
}

function openDevWorkbench() {
  void router.push(buildDevPortalUrl(auth.token))
}

function openTicketCenter() {
  void router.push({ name: 'workbench-tickets' })
}

async function loadCustomResources() {
  if (!auth.token) {
    requirements.value = []
    return
  }

  loading.value = true
  try {
    requirements.value = await listRequirements(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载我的定制资源失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  void loadCustomResources()
})
</script>

<template>
  <main class="portal-page custom-resource-page">
    <section class="portal-page__stats">
      <article class="portal-page__stat-card">
        <strong>{{ stats.total }}</strong>
        <span>已关联资源</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ stats.publicCount }}</strong>
        <span>公开中</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ stats.privateCount }}</strong>
        <span>私有中</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ availablePlatforms.length }}</strong>
        <span>涉及平台</span>
      </article>
    </section>

    <section class="portal-page__panel custom-resource-browser__filters">
      <div class="portal-page__section-header">
        <div>
          <p class="portal-page__eyebrow">资源筛选</p>
          <h2>按平台、可见性和关键词过滤你的交付资源</h2>
        </div>
      </div>

      <div class="custom-resource-browser__row custom-resource-browser__row--between">
        <div class="custom-resource-browser__group">
          <span class="custom-resource-browser__label">平台：</span>
          <button class="custom-resource-browser__tag"
            :class="{ 'custom-resource-browser__tag--active': selectedPlatform === 'all' }" type="button"
            @click="selectedPlatform = 'all'">
            全部
          </button>
          <button v-for="p in availablePlatforms" :key="p" class="custom-resource-browser__tag"
            :class="{ 'custom-resource-browser__tag--active': selectedPlatform === p }" type="button"
            @click="selectedPlatform = p">
            {{ p }}
          </button>
        </div>

        <label class="custom-resource-browser__search">
          <span class="custom-resource-browser__search-icon">🔍</span>
          <input v-model="searchQuery" type="text" placeholder="搜索我的定制资源..." />
        </label>
      </div>

      <div
        class="custom-resource-browser__row custom-resource-browser__row--between custom-resource-browser__row--wrap">
        <div class="custom-resource-browser__group">
          <span class="custom-resource-browser__label">可见性：</span>
          <button class="custom-resource-browser__tag"
            :class="{ 'custom-resource-browser__tag--active': selectedVisibility === 'all' }" type="button"
            @click="selectedVisibility = 'all'">
            全部
          </button>
          <button class="custom-resource-browser__tag"
            :class="{ 'custom-resource-browser__tag--active': selectedVisibility === 'public' }" type="button"
            @click="selectedVisibility = 'public'">
            公开中
          </button>
          <button class="custom-resource-browser__tag"
            :class="{ 'custom-resource-browser__tag--active': selectedVisibility === 'private' }" type="button"
            @click="selectedVisibility = 'private'">
            私有中
          </button>
        </div>

        <div class="custom-resource-browser__group">
          <span class="custom-resource-browser__label">排序：</span>
          <button class="custom-resource-browser__tag"
            :class="{ 'custom-resource-browser__tag--active': selectedSort === '最新' }" type="button"
            @click="selectedSort = '最新'">
            最新
          </button>
          <button class="custom-resource-browser__tag"
            :class="{ 'custom-resource-browser__tag--active': selectedSort === '标题' }" type="button"
            @click="selectedSort = '标题'">
            标题
          </button>
          <button class="custom-resource-browser__reset" type="button" @click="resetFilters">
            ↻ 重置筛选
          </button>
        </div>
      </div>
    </section>

    <section class="custom-resource-browser__grid">
      <article v-for="card in filteredCards" :key="`${card.requirementId}-${card.id}`"
        class="custom-resource-browser__card">
        <div v-if="card.coverUrl" class="custom-resource-browser__cover custom-resource-browser__cover--image">
          <img :src="card.coverUrl" :alt="card.title" class="custom-resource-browser__cover-image" />
        </div>
        <div v-else class="custom-resource-browser__cover custom-resource-browser__cover--fallback">
          📁
        </div>

        <div class="custom-resource-browser__body">
          <div class="custom-resource-browser__topline">
            <span class="custom-resource-browser__pill">需求单 {{ card.requirementId }}</span>
            <span class="custom-resource-browser__pill" :class="`custom-resource-browser__pill--${card.visibility}`">
              {{ card.visibility === 'public' ? '公开中' : '私有中' }}
            </span>
          </div>

          <div class="custom-resource-browser__headline">
            <div>
              <h3>{{ card.title }}</h3>
              <p class="custom-resource-browser__author">by {{ card.author }}</p>
            </div>
            <span class="custom-resource-browser__updated">{{
              formatUpdatedAt(card.updatedAt)
              }}</span>
          </div>

          <p class="custom-resource-browser__requirement">关联需求：{{ card.requirementTitle }}</p>
          <p class="custom-resource-browser__desc">{{ card.description }}</p>

          <div class="custom-resource-browser__tags">
            <span v-for="tag in card.tags.length ? card.tags : ['未标注']" :key="`${card.id}-${tag}`">{{ tag }}</span>
          </div>

          <div class="custom-resource-browser__footer">
            <span class="custom-resource-browser__meta">{{ card.platform }}</span>
            <button class="custom-resource-browser__action" type="button" @click="openPrimaryLink(card)">
              {{ card.visibility === 'public' ? '查看公开页' : '查看并下载' }}
            </button>
          </div>
        </div>
      </article>

      <div v-if="!loading && filteredCards.length === 0" class="custom-resource-browser__empty">
        <h3>{{ cards.length === 0 ? '你还没有关联资源项目' : '没有符合当前筛选条件的资源' }}</h3>
        <p>
          {{
            cards.length === 0
              ? '当开发者把资源项目关联到你的需求单后，这里会自动出现对应的资源卡片。'
              : '可以尝试重置筛选，或者回到工单中心调整资源公开状态。'
          }}
        </p>
        <button class="custom-resource-browser__reset" type="button"
          @click="cards.length === 0 ? openTicketCenter() : resetFilters">
          {{ cards.length === 0 ? '前往工单中心' : '重置筛选' }}
        </button>
      </div>

      <div v-if="loading" class="custom-resource-browser__empty">
        <h3>资源加载中...</h3>
        <p>正在同步你的需求关联资源。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.custom-resource-browser__filters,
.custom-resource-browser__card,
.custom-resource-browser__empty {
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
}

.custom-resource-browser__filters {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.custom-resource-browser__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.custom-resource-browser__row--between {
  justify-content: space-between;
}

.custom-resource-browser__row--wrap {
  flex-wrap: wrap;
}

.custom-resource-browser__group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.custom-resource-browser__label,
.custom-resource-browser__author,
.custom-resource-browser__updated,
.custom-resource-browser__requirement,
.custom-resource-browser__desc,
.custom-resource-browser__empty p {
  color: #64748b;
}

.custom-resource-browser__label {
  font-size: 13px;
  font-weight: 700;
}

.custom-resource-browser__tag,
.custom-resource-browser__reset,
.custom-resource-browser__action {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.custom-resource-browser__tag {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.custom-resource-browser__tag--active {
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.2);
}

.custom-resource-browser__search {
  position: relative;
  min-width: 260px;
}

.custom-resource-browser__search input {
  width: 100%;
  padding: 12px 16px 12px 40px;
  border: 1px solid rgba(198, 210, 236, 0.82);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  outline: none;
}

.custom-resource-browser__search input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
}

.custom-resource-browser__search-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
}

.custom-resource-browser__reset {
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
  color: #475569;
  font-weight: 700;
}

.custom-resource-browser__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.custom-resource-browser__card {
  display: flex;
  gap: 16px;
  padding: 16px;
  border-radius: 16px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.custom-resource-browser__card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px rgba(76, 103, 172, 0.12);
}

.custom-resource-browser__cover {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 14px;
  font-size: 34px;
  color: #fff;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.custom-resource-browser__cover--image {
  overflow: hidden;
  background: rgba(226, 232, 240, 0.72);
}

.custom-resource-browser__cover-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.custom-resource-browser__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-resource-browser__topline,
.custom-resource-browser__headline,
.custom-resource-browser__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.custom-resource-browser__pill,
.custom-resource-browser__meta,
.custom-resource-browser__tags span {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.custom-resource-browser__pill {
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
}

.custom-resource-browser__pill--public {
  background: rgba(220, 252, 231, 0.92);
  color: #15803d;
}

.custom-resource-browser__pill--private {
  background: rgba(255, 237, 213, 0.92);
  color: #c2410c;
}

.custom-resource-browser__headline h3,
.custom-resource-browser__empty h3 {
  margin: 0;
  color: #0f172a;
}

.custom-resource-browser__author,
.custom-resource-browser__updated,
.custom-resource-browser__requirement,
.custom-resource-browser__desc,
.custom-resource-browser__empty p {
  margin: 0;
  line-height: 1.7;
}

.custom-resource-browser__author,
.custom-resource-browser__updated,
.custom-resource-browser__requirement {
  font-size: 13px;
}

.custom-resource-browser__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.custom-resource-browser__tags span,
.custom-resource-browser__meta {
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
}

.custom-resource-browser__action {
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 700;
}

.custom-resource-browser__empty {
  grid-column: 1 / -1;
  display: flex;
  min-height: 200px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  border-radius: 16px;
  text-align: center;
}

@media (max-width: 900px) {

  .custom-resource-browser__row,
  .custom-resource-browser__row--between,
  .custom-resource-browser__headline,
  .custom-resource-browser__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .custom-resource-browser__search {
    min-width: 100%;
  }

  .custom-resource-browser__grid {
    grid-template-columns: 1fr;
  }

  .custom-resource-browser__card {
    flex-direction: column;
  }
}
</style>
