<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'

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

function formatUpdatedAt(value: string): string[] {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ['最近更新']
  }

  return [
    date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  ]
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
        <span>已关联资源</span>
        <strong>{{ stats.total }}</strong>
      </article>
      <article class="portal-page__stat-card">
        <span>公开中</span>
        <strong>{{ stats.publicCount }}</strong>
      </article>
      <article class="portal-page__stat-card">
        <span>私有中</span>
        <strong>{{ stats.privateCount }}</strong>
      </article>
      <article class="portal-page__stat-card">
        <span>涉及平台</span>
        <strong>{{ availablePlatforms.length }}</strong>
      </article>
    </section>

    <section class="portal-page__panel custom-resource-browser__filters">
      <div class="portal-page__section-header">
        <div>
          <p class="portal-page__eyebrow">资源筛选</p>
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
          <span class="custom-resource-browser__search-icon">
            <el-icon>
              <Search />
            </el-icon>
          </span>
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
        <div class="custom-resource-browser__card-main">
          <div v-if="card.coverUrl" class="custom-resource-browser__cover custom-resource-browser__cover--image">
            <img :src="card.coverUrl" :alt="card.title" class="custom-resource-browser__cover-image" />
          </div>
          <div v-else class="custom-resource-browser__cover">📁</div>

          <div class="custom-resource-browser__headline">
            <div class="custom-resource-browser__title-row">
              <h3>{{ card.title }}</h3>
              <span class="custom-resource-browser__updated">
                <span v-for="part in formatUpdatedAt(card.updatedAt)" :key="part">{{ part }}</span>
              </span>
            </div>
            <div class="custom-resource-browser__meta-line">
              <span class="custom-resource-browser__author-pill">作者 / 开发者 {{ card.author }}</span>
              <span class="custom-resource-browser__pill" :class="`custom-resource-browser__pill--${card.visibility}`">
                {{ card.visibility === 'public' ? '公开中' : '私有中' }}
              </span>
            </div>
          </div>
        </div>

        <p class="custom-resource-browser__requirement">需求单 {{ card.requirementId }} · {{ card.requirementTitle }}</p>
        <p class="custom-resource-browser__desc">{{ card.description }}</p>

        <div class="custom-resource-browser__footer">
          <div class="custom-resource-browser__tags">
            <span class="custom-resource-browser__meta">{{ card.platform }}</span>
            <span v-for="tag in card.tags.length ? card.tags : ['未标注']" :key="`${card.id}-${tag}`">{{ tag }}</span>
          </div>
          <div class="custom-resource-browser__actions">
            <button class="custom-resource-browser__action" type="button" @click="openPrimaryLink(card)">
              {{ card.visibility === 'public' ? '查看公开页' : '查看并下载' }}
            </button>
          </div>
        </div>
      </article>

      <div v-if="!loading && filteredCards.length === 0" class="custom-resource-browser__empty">
        <p>
          {{
            cards.length === 0
              ? '当开发者把资源项目关联到你的需求单后，这里会自动出现对应的资源卡片。'
              : '可以尝试重置筛选，或者回到工单中心调整资源公开状态。'
          }}
        </p>
      </div>

      <div v-if="loading" class="custom-resource-browser__empty">
        <p>正在同步你的需求关联资源。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.portal-page__stat-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.06);
}

.portal-page__stat-card span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.portal-page__stat-card strong {
  display: block;
  margin-bottom: 0;
  color: #0f172a;
  font-size: 28px;
  line-height: 1;
}

.custom-resource-browser__filters,
.custom-resource-browser__card,
.custom-resource-browser__empty {
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.12);
  backdrop-filter: blur(18px);
}

.custom-resource-browser__filters {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.portal-page__section-header {
  margin-bottom: 0;
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
  display: inline-flex;
  align-items: center;
  color: #94a3b8;
}

.custom-resource-browser__search-icon .el-icon {
  font-size: 16px;
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
  align-items: stretch;
  gap: 18px;
}

.custom-resource-browser__card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.custom-resource-browser__card:hover {
  transform: translateY(-3px);
  box-shadow: 0 24px 40px rgba(76, 103, 172, 0.16);
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

.custom-resource-browser__card-main {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.custom-resource-browser__headline {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-resource-browser__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.custom-resource-browser__title-row h3 {
  min-width: 0;
}

.custom-resource-browser__meta-line {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.custom-resource-browser__footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
  margin-top: auto;
}

.custom-resource-browser__actions {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.custom-resource-browser__pill,
.custom-resource-browser__meta,
.custom-resource-browser__author-pill,
.custom-resource-browser__tags span {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.custom-resource-browser__pill,
.custom-resource-browser__author-pill {
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

.custom-resource-browser__updated,
.custom-resource-browser__requirement,
.custom-resource-browser__desc,
.custom-resource-browser__empty p {
  margin: 0;
  line-height: 1.7;
}

.custom-resource-browser__updated {
  flex-shrink: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 12px;
  line-height: 1.35;
  text-align: right;
}

.custom-resource-browser__requirement {
  font-size: 13px;
}

.custom-resource-browser__tags {
  display: flex;
  align-items: flex-end;
  flex: 1;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.custom-resource-browser__tags span {
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
}

/* 平台属性和标签区分开，用靛蓝，与资源详情页一致 */
.custom-resource-browser__meta {
  background: rgba(99, 102, 241, 0.14);
  color: #4f46e5;
}

.custom-resource-browser__action {
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 700;
  white-space: nowrap;
}

.custom-resource-browser__empty {
  grid-column: 1 / -1;
  color: var(--profile-text-sub);
  padding: 20px 18px;
  font-size: 14px;
  line-height: 1.6;
  border: 1px dashed rgba(204, 214, 237, 0.98);
  border-radius: 16px;
  background: rgba(248, 251, 255, 0.8);
  box-shadow: none;
}

@media (max-width: 900px) {

  .custom-resource-browser__row,
  .custom-resource-browser__row--between {
    flex-direction: column;
    align-items: stretch;
  }

  .custom-resource-browser__search {
    min-width: 100%;
  }

  .custom-resource-browser__grid {
    grid-template-columns: 1fr;
  }

  .custom-resource-browser__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .custom-resource-browser__actions {
    display: flex;
    align-items: stretch;
  }

  .custom-resource-browser__action {
    flex: 1;
    min-height: 44px;
  }
}
</style>
