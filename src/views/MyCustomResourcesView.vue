<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'

import { apiUrl } from '@/api/http'
import {
  listRequirements,
  updateRequirementResourceVisibility,
  type RequirementItem,
} from '@/api/requirements'
import {
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  listPublicMcResourceVersions,
  resolveResourceDownloadFileName,
} from '@/api/resources'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { buildDevPortalUrl } from '@/config/runtime'
import { useResourceDownload } from '@/composables/useResourceDownload'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type ResourceVisibility = 'public' | 'review' | 'private'

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
  visibility: ResourceVisibility
  /** 需求未完成时不允许调整公开状态，与需求列表页同一门槛 */
  canToggleVisibility: boolean
}

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const searchQuery = ref('')
const selectedPlatform = ref('all')
const selectedVisibility = ref<'all' | ResourceVisibility>('all')
const selectedSort = ref<'最新' | '标题'>('最新')
const requirements = ref<RequirementItem[]>([])
const resourceVisibilityLoadingId = ref<string | null>(null)
const resourceDownloadingId = ref<number | null>(null)
const { triggerDownload } = useResourceDownload()
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
        visibility: toResourceVisibility(item.resource_visibility),
        canToggleVisibility: item.status === 'completed',
      }
    })
})

function toResourceVisibility(value: RequirementItem['resource_visibility']): ResourceVisibility {
  if (value === 'public' || value === 'review') {
    return value
  }

  return 'private'
}

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
  const reviewCount = cards.value.filter((card) => card.visibility === 'review').length
  return {
    total,
    publicCount,
    reviewCount,
    privateCount: total - publicCount - reviewCount,
  }
})

/** 卡片状态标签与筛选按钮共用的文案 */
const VISIBILITY_LABELS: Record<ResourceVisibility, string> = {
  public: '公开中',
  review: '审核中',
  private: '私有中',
}

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

/** 状态按钮文案：公开中可撤回为私有，审核中不可点，私有时提交审核 */
function resourceVisibilityActionLabel(card: CustomResourceCard) {
  if (card.visibility === 'public') {
    return '设为私有'
  }

  if (card.visibility === 'review') {
    return '审核中'
  }

  return '设为公开'
}

async function toggleResourceVisibility(card: CustomResourceCard) {
  if (!auth.token || card.visibility === 'review') {
    return
  }

  const visibility = card.visibility === 'public' ? 'private' : 'public'
  resourceVisibilityLoadingId.value = card.requirementId
  try {
    await updateRequirementResourceVisibility(auth.token, card.requirementId, { visibility })
    showToast(visibility === 'public' ? '关联资源已提交公开审核' : '关联资源已设为私有')
    await loadCustomResources()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '调整资源公开状态失败', 'error')
  } finally {
    resourceVisibilityLoadingId.value = null
  }
}

async function downloadCardResource(card: CustomResourceCard) {
  if (!auth.token) {
    return
  }

  resourceDownloadingId.value = card.id
  try {
    const versions = await listPublicMcResourceVersions(card.id, auth.token)
    const latest = versions[0]
    if (!latest) {
      showToast('开发者还没有发布可下载的版本', 'info')
      return
    }

    const fallbackFileName = `resource-${card.id}-v${latest.id}`
    const fileName = extractResourceFileNameFromUrl(latest.resource, fallbackFileName)
    await triggerDownload(
      (onProgress) =>
        downloadPublicMcResourceVersionFile(
          card.id,
          latest.id,
          auth.token?.trim() || null,
          onProgress,
        ),
      fileName,
    )
  } catch (err) {
    showToast(err instanceof Error ? err.message : '下载资源失败', 'warning')
  } finally {
    resourceDownloadingId.value = null
  }
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
        <span>审核中</span>
        <strong>{{ stats.reviewCount }}</strong>
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
      <div class="custom-resource-browser__filters-head">
        <div class="custom-resource-browser__filters-title">
          <span class="custom-resource-browser__eyebrow">资源筛选</span>
          <span class="custom-resource-browser__count">
            {{ filteredCards.length }} / {{ cards.length }} 个资源
          </span>
        </div>

        <label class="custom-resource-browser__search">
          <span class="custom-resource-browser__search-icon">
            <el-icon>
              <Search />
            </el-icon>
          </span>
          <input v-model="searchQuery" type="search" inputmode="search" autocomplete="off" spellcheck="false"
            placeholder="搜索标题、作者或标签" @keydown.esc="searchQuery = ''" />
        </label>
      </div>

      <div class="custom-resource-browser__filters-body">
        <div class="custom-resource-browser__group">
          <span class="custom-resource-browser__label">平台</span>
          <div class="custom-resource-browser__segments">
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
        </div>

        <span class="custom-resource-browser__divider" aria-hidden="true"></span>

        <div class="custom-resource-browser__group">
          <span class="custom-resource-browser__label">可见性</span>
          <div class="custom-resource-browser__segments">
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
              :class="{ 'custom-resource-browser__tag--active': selectedVisibility === 'review' }" type="button"
              @click="selectedVisibility = 'review'">
              审核中
            </button>
            <button class="custom-resource-browser__tag"
              :class="{ 'custom-resource-browser__tag--active': selectedVisibility === 'private' }" type="button"
              @click="selectedVisibility = 'private'">
              私有中
            </button>
          </div>
        </div>

        <span class="custom-resource-browser__divider" aria-hidden="true"></span>

        <div class="custom-resource-browser__group">
          <span class="custom-resource-browser__label">排序</span>
          <div class="custom-resource-browser__segments">
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
          </div>
        </div>

        <button class="custom-resource-browser__reset" type="button" @click="resetFilters">
          ↻ 重置
        </button>
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
                {{ VISIBILITY_LABELS[card.visibility] }}
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
            <button v-if="card.canToggleVisibility" class="custom-resource-browser__action custom-resource-browser__action--ghost"
              type="button" :disabled="card.visibility === 'review' || resourceVisibilityLoadingId === card.requirementId"
              @click="toggleResourceVisibility(card)">
              {{
                resourceVisibilityLoadingId === card.requirementId
                  ? '提交中…'
                  : resourceVisibilityActionLabel(card)
              }}
            </button>
            <button class="custom-resource-browser__action custom-resource-browser__action--ghost" type="button"
              @click="openPrimaryLink(card)">
              主页
            </button>
            <button class="custom-resource-browser__action" type="button"
              :disabled="resourceDownloadingId === card.id" @click="downloadCardResource(card)">
              {{ resourceDownloadingId === card.id ? '准备中…' : '下载' }}
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
  gap: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 250, 255, 0.92));
}

.custom-resource-browser__filters-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.custom-resource-browser__filters-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.custom-resource-browser__eyebrow {
  color: #0f172a;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.custom-resource-browser__count {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.72);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.custom-resource-browser__filters-body {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding-top: 14px;
  border-top: 1px dashed rgba(203, 213, 245, 0.9);
}

.custom-resource-browser__divider {
  width: 1px;
  height: 22px;
  background: rgba(203, 213, 245, 0.9);
}

.custom-resource-browser__group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.custom-resource-browser__segments {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(219, 228, 248, 0.96);
  border-radius: 999px;
  background: rgba(241, 245, 255, 0.9);
}

.custom-resource-browser__label,
.custom-resource-browser__updated,
.custom-resource-browser__requirement,
.custom-resource-browser__desc,
.custom-resource-browser__empty p {
  color: #64748b;
}

.custom-resource-browser__label {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.custom-resource-browser__tag,
.custom-resource-browser__reset,
.custom-resource-browser__action {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.custom-resource-browser__tag {
  padding: 6px 14px;
  border-radius: 999px;
  background: transparent;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.custom-resource-browser__tag:hover {
  background: rgba(219, 234, 254, 0.72);
  color: #1d4ed8;
}

.custom-resource-browser__tag--active,
.custom-resource-browser__tag--active:hover {
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  box-shadow: 0 8px 16px rgba(37, 99, 235, 0.22);
}

.custom-resource-browser__search {
  position: relative;
  flex: 1 1 240px;
  max-width: 320px;
}

.custom-resource-browser__search input {
  width: 100%;
  padding: 11px 16px 11px 40px;
  border: 1px solid rgba(198, 210, 236, 0.82);
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.custom-resource-browser__search input::placeholder {
  color: #a5b0c2;
}

.custom-resource-browser__search input:focus {
  border-color: #60a5fa;
  background: #fff;
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
  margin-left: auto;
  padding: 9px 16px;
  border: 1px solid rgba(198, 210, 236, 0.9);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #475569;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}

.custom-resource-browser__reset:hover {
  border-color: rgba(96, 165, 250, 0.9);
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
}

.custom-resource-browser__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 18px;
}

/* 本页统计有 5 张卡（比全局的 4 列多一张），宽屏下改成按宽度自适应；窄屏沿用全局的 2 列 */
@media (min-width: 901px) {
  .custom-resource-page .portal-page__stats {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
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
  flex-wrap: wrap;
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
  gap: 8px;
  /* 三个动作按钮比原来的一个宽，放不下时整组换行并靠右 */
  margin-left: auto;
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

.custom-resource-browser__pill--review {
  background: rgba(254, 249, 195, 0.92);
  color: #a16207;
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

/* 主页与公开/私有开关是次级动作，弱化成描边按钮，让「下载」保持主按钮视觉 */
.custom-resource-browser__action--ghost {
  border: 1px solid rgba(198, 210, 236, 0.9);
  background: rgba(255, 255, 255, 0.92);
  color: #475569;
}

.custom-resource-browser__action--ghost:hover:not(:disabled) {
  border-color: rgba(96, 165, 250, 0.9);
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
}

.custom-resource-browser__action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
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
  /* 移动端把统计卡片收成 2×2 窄条，避免四张大卡纵向占满首屏 */
  .portal-page__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  /* 选择器要压过 UserWorkbenchView 里 :deep(.portal-page__stat-card) 的样式 */
  .custom-resource-page .portal-page__stats > .portal-page__stat-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 44px;
    padding: 10px 14px;
    border-radius: 14px;
  }

  .custom-resource-page .portal-page__stats > .portal-page__stat-card span {
    font-size: 12px;
    line-height: 1.3;
  }

  .custom-resource-page .portal-page__stats > .portal-page__stat-card strong {
    font-size: 20px;
  }

  .custom-resource-browser__filters {
    gap: 14px;
  }

  .custom-resource-browser__filters-head,
  .custom-resource-browser__filters-body {
    flex-direction: column;
    align-items: stretch;
  }

  .custom-resource-browser__divider {
    display: none;
  }

  .custom-resource-browser__group {
    justify-content: space-between;
  }

  .custom-resource-browser__segments {
    flex: 1;
    flex-wrap: wrap;
    justify-content: flex-start;
    border-radius: 16px;
  }

  .custom-resource-browser__tag {
    min-height: 40px;
  }

  .custom-resource-browser__search {
    flex: 1 1 auto;
    max-width: none;
  }

  .custom-resource-browser__reset {
    margin-left: 0;
    min-height: 44px;
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
    flex-wrap: wrap;
    align-items: stretch;
    gap: 8px;
  }

  .custom-resource-browser__action {
    flex: 1 1 auto;
    min-height: 44px;
  }
}
</style>
