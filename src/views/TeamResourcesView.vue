<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import { listTeamResources, type McResourcePayload } from '@dev/api/mcResources'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type TeamResourceCard = {
  id: number
  title: string
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
  visibility: 'published' | 'draft' | 'archived'
  creator: string
}

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const searchQuery = ref('')
const selectedPlatform = ref('all')
const selectedSort = ref<'最新' | '标题'>('最新')
const resources = ref<McResourcePayload[]>([])
const { showToast } = useToast()

const cards = computed<TeamResourceCard[]>(() => {
  return resources.value.map((item) => {
    const tagSelections = item.tag_selections ?? []
    const rootName = tagSelections.find((s) => s.group_path.length > 0)?.group_path[0] ?? ''
    const entryName =
      tagSelections.find((s) => s.group_path.length > 1)?.group_path[1] ??
      (item.platform || '')
    const rootAlias =
      tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 0)
        ?.group_path_aliases?.[0] ?? ''
    const entryAlias =
      tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 1)
        ?.group_path_aliases?.[1] ?? ''

    return {
      id: item.id,
      title: item.title,
      author: item.author || '未知作者',
      description: item.description || '暂未填写资源说明。',
      platform: item.platform || '未知平台',
      rootSlug: rootAlias || getTagRouteSlug(rootName),
      entrySlug: entryAlias || getTagRouteSlug(entryName),
      tags: Array.from(
        new Set(
          (item.tag_selections ?? [])
            .flatMap((entry) => entry.tag_names)
            .filter(Boolean),
        ),
      ),
      updatedAt: item.updated_at || item.created_at,
      sourceUrl: item.source_url ?? null,
      docsUrl: item.docs_url ?? null,
      coverUrl: item.cover_url ? apiUrl(item.cover_url) : null,
      visibility: item.visibility,
      creator: item.creator,
    }
  })
})

const filteredCards = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  const filtered = cards.value.filter((card) => {
    if (selectedPlatform.value !== 'all' && card.platform !== selectedPlatform.value) {
      return false
    }

    if (!keyword) {
      return true
    }

    const haystack = [
      card.title,
      card.author,
      card.description,
      card.creator,
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
  const publishedCount = cards.value.filter((card) => card.visibility === 'published').length
  return {
    total,
    draftCount: total - publishedCount,
    publishedCount,
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
  selectedSort.value = '最新'
}

const availablePlatforms = computed(() => {
  const platforms = new Set(cards.value.map((card) => card.platform))
  return [...platforms].sort()
})

function openPrimaryLink(card: TeamResourceCard) {
  router.push({
    name: 'resource-detail',
    params: {
      rootSlug: card.rootSlug,
      entrySlug: card.entrySlug,
      resourceSlug: getResourceDetailSlug(card.id, card.creator),
    },
  })
}

async function loadResources() {
  if (!auth.token) {
    resources.value = []
    return
  }

  loading.value = true
  try {
    resources.value = await listTeamResources(auth.token)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载团队资源失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  void loadResources()
})
</script>

<template>
  <main class="portal-page team-resource-page">
    <section class="portal-page__stats">
      <article class="portal-page__stat-card">
        <strong>{{ stats.total }}</strong>
        <span>团队资源总数</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ stats.publishedCount }}</strong>
        <span>已发布</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ stats.draftCount }}</strong>
        <span>草稿/待审核</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ availablePlatforms.length }}</strong>
        <span>涉及平台</span>
      </article>
    </section>

    <section class="portal-page__panel team-resource-browser__filters">
      <div class="portal-page__section-header">
        <div>
          <p class="portal-page__eyebrow">团队资源</p>
          <h2>管理并查看你所在团队共享的所有资源项目</h2>
        </div>
      </div>

      <div class="team-resource-browser__row team-resource-browser__row--between">
        <div class="team-resource-browser__group">
          <span class="team-resource-browser__label">平台：</span>
          <button class="team-resource-browser__tag"
            :class="{ 'team-resource-browser__tag--active': selectedPlatform === 'all' }" type="button"
            @click="selectedPlatform = 'all'">
            全部
          </button>
          <button v-for="p in availablePlatforms" :key="p" class="team-resource-browser__tag"
            :class="{ 'team-resource-browser__tag--active': selectedPlatform === p }" type="button"
            @click="selectedPlatform = p">
            {{ p }}
          </button>
        </div>

        <label class="team-resource-browser__search">
          <span class="team-resource-browser__search-icon">🔍</span>
          <input v-model="searchQuery" type="text" placeholder="搜索团队资源..." />
        </label>
      </div>

      <div
        class="team-resource-browser__row team-resource-browser__row--between team-resource-browser__row--wrap">
        <div class="team-resource-browser__group">
          <span class="team-resource-browser__label">排序：</span>
          <button class="team-resource-browser__tag"
            :class="{ 'team-resource-browser__tag--active': selectedSort === '最新' }" type="button"
            @click="selectedSort = '最新'">
            最新
          </button>
          <button class="team-resource-browser__tag"
            :class="{ 'team-resource-browser__tag--active': selectedSort === '标题' }" type="button"
            @click="selectedSort = '标题'">
            标题
          </button>
          <button class="team-resource-browser__reset" type="button" @click="resetFilters">
            ↻ 重置筛选
          </button>
        </div>
      </div>
    </section>

    <section class="team-resource-browser__grid">
      <article v-for="card in filteredCards" :key="card.id"
        class="team-resource-browser__card">
        <div v-if="card.coverUrl" class="team-resource-browser__cover team-resource-browser__cover--image">
          <img :src="card.coverUrl" :alt="card.title" class="team-resource-browser__cover-image" />
        </div>
        <div v-else class="team-resource-browser__cover team-resource-browser__cover--fallback">
          📦
        </div>

        <div class="team-resource-browser__body">
          <div class="team-resource-browser__topline">
            <span class="team-resource-browser__pill">资源 ID: {{ card.id }}</span>
            <span class="team-resource-browser__pill" :class="`team-resource-browser__pill--${card.visibility}`">
              {{ card.visibility === 'published' ? '已发布' : '草稿' }}
            </span>
          </div>

          <div class="team-resource-browser__headline">
            <div>
              <h3>{{ card.title }}</h3>
              <p class="team-resource-browser__author">by {{ card.author }} (创建者: {{ card.creator }})</p>
            </div>
            <span class="team-resource-browser__updated">{{
              formatUpdatedAt(card.updatedAt)
              }}</span>
          </div>

          <p class="team-resource-browser__desc">{{ card.description }}</p>

          <div class="team-resource-browser__tags">
            <span v-for="tag in card.tags.length ? card.tags : ['未标注']" :key="`${card.id}-${tag}`">{{ tag }}</span>
          </div>

          <div class="team-resource-browser__footer">
            <span class="team-resource-browser__meta">{{ card.platform }}</span>
            <button class="team-resource-browser__action" type="button" @click="openPrimaryLink(card)">
              查看详情
            </button>
          </div>
        </div>
      </article>

      <div v-if="!loading && filteredCards.length === 0" class="team-resource-browser__empty">
        <h3>{{ resources.length === 0 ? '团队还没有共享资源项目' : '没有符合当前筛选条件的资源' }}</h3>
        <p>
          {{
            resources.length === 0
              ? '团队成员可以在资源初始化时选择“团队项目”来共享资源。'
              : '可以尝试重置筛选，或者搜索其他关键词。'
          }}
        </p>
        <button class="team-resource-browser__reset" type="button" @click="resetFilters">
          重置筛选
        </button>
      </div>

      <div v-if="loading" class="team-resource-browser__empty">
        <h3>资源加载中...</h3>
        <p>正在同步团队共享资源。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.team-resource-browser__filters,
.team-resource-browser__card,
.team-resource-browser__empty {
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
}

.team-resource-browser__filters {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  border-radius: 16px;
  margin-bottom: 24px;
}

.team-resource-browser__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-resource-browser__row--between {
  justify-content: space-between;
}

.team-resource-browser__row--wrap {
  flex-wrap: wrap;
}

.team-resource-browser__group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.team-resource-browser__label,
.team-resource-browser__author,
.team-resource-browser__updated,
.team-resource-browser__desc,
.team-resource-browser__empty p {
  color: #64748b;
}

.team-resource-browser__label {
  font-size: 13px;
  font-weight: 700;
}

.team-resource-browser__tag,
.team-resource-browser__reset,
.team-resource-browser__action {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.team-resource-browser__tag {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.team-resource-browser__tag--active {
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.2);
}

.team-resource-browser__search {
  position: relative;
  min-width: 260px;
}

.team-resource-browser__search input {
  width: 100%;
  padding: 12px 16px 12px 40px;
  border: 1px solid rgba(198, 210, 236, 0.82);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  outline: none;
}

.team-resource-browser__search input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
}

.team-resource-browser__search-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
}

.team-resource-browser__reset {
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
  color: #475569;
  font-weight: 700;
}

.team-resource-browser__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.team-resource-browser__card {
  display: flex;
  gap: 16px;
  padding: 16px;
  border-radius: 16px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.team-resource-browser__card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px rgba(76, 103, 172, 0.12);
}

.team-resource-browser__cover {
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

.team-resource-browser__cover--image {
  overflow: hidden;
  background: rgba(226, 232, 240, 0.72);
}

.team-resource-browser__cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.team-resource-browser__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.team-resource-browser__topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.team-resource-browser__pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #64748b;
}

.team-resource-browser__pill--published {
  background: #f0fdf4;
  color: #16a34a;
}

.team-resource-browser__pill--draft {
  background: #fffbeb;
  color: #d97706;
}

.team-resource-browser__headline {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.team-resource-browser__headline h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.team-resource-browser__author {
  font-size: 12px;
  margin: 2px 0 0;
}

.team-resource-browser__updated {
  font-size: 11px;
}

.team-resource-browser__desc {
  font-size: 13px;
  line-height: 1.5;
  margin: 4px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.team-resource-browser__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0;
}

.team-resource-browser__tags span {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.team-resource-browser__footer {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.team-resource-browser__meta {
  font-size: 12px;
  font-weight: 700;
  color: #2563eb;
}

.team-resource-browser__action {
  padding: 8px 16px;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  transition: background 0.2s;
}

.team-resource-browser__action:hover {
  background: #1d4ed8;
}

.team-resource-browser__empty {
  grid-column: 1 / -1;
  padding: 60px;
  text-align: center;
  border-radius: 20px;
}

.team-resource-browser__empty h3 {
  font-size: 20px;
  margin-bottom: 8px;
}

@media (max-width: 980px) {
  .team-resource-browser__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .team-resource-browser__filters {
    padding: 16px;
  }
  
  .team-resource-browser__row--between {
    flex-direction: column;
    align-items: stretch;
  }
  
  .team-resource-browser__search {
    min-width: 0;
  }
}
</style>
