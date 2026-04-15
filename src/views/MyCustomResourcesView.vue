<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import AppToast from '@/components/AppToast.vue'
import HomeHeroSection from '@/components/home/HomeHeroSection.vue'
import { listRequirements, type RequirementItem } from '@/api/requirements'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import '../styles/McPluginsView.css'

type CustomResourceCard = {
  id: number
  requirementId: string
  requirementTitle: string
  title: string
  author: string
  description: string
  platform: 'java' | 'bedrock'
  tags: string[]
  updatedAt: string
  sourceUrl: string | null
  docsUrl: string | null
  coverUrl: string | null
  visibility: 'public' | 'private'
}

const auth = useAuthStore()
const router = useRouter()
const menuOpen = ref(false)
const loading = ref(false)
const searchQuery = ref('')
const selectedPlatform = ref<'all' | 'java' | 'bedrock'>('all')
const selectedVisibility = ref<'all' | 'public' | 'private'>('all')
const selectedSort = ref<'最新' | '标题'>('最新')
const requirements = ref<RequirementItem[]>([])
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

const heroNavLinks = computed(() => [
  { label: '返回首页', to: { name: 'home' } },
  { label: 'MC插件与模组', to: { name: 'mc-plugins-java' } },
  { label: '我的定制资源', to: { name: 'my-custom-resources' }, active: true },
])

const cards = computed<CustomResourceCard[]>(() => {
  return requirements.value
    .filter((item) => item.bound_resource_id != null && item.bound_resource_title)
    .map((item) => ({
      id: item.bound_resource_id as number,
      requirementId: item.requirement_id,
      requirementTitle: item.title,
      title: item.bound_resource_title as string,
      author: item.bound_resource_author?.trim() || '未知作者',
      description: item.bound_resource_description?.trim() || '暂未填写资源说明。',
      platform: item.bound_resource_platform === 'bedrock' ? 'bedrock' : 'java',
      tags: Array.from(
        new Set(
          (item.bound_resource_tag_selections ?? []).flatMap((entry) => entry.tag_names).filter(Boolean),
        ),
      ),
      updatedAt: item.bound_resource_updated_at || item.updated_at,
      sourceUrl: item.bound_resource_source_url ?? null,
      docsUrl: item.bound_resource_docs_url ?? null,
      coverUrl: item.bound_resource_cover_url ? apiUrl(item.bound_resource_cover_url) : null,
      visibility: item.resource_visibility === 'public' ? 'public' : 'private',
    }))
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

    const haystack = [card.title, card.author, card.description, card.requirementTitle, ...card.tags]
      .join(' ')
      .toLowerCase()
    return haystack.includes(keyword)
  })

  if (selectedSort.value === '标题') {
    return filtered.slice().sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
  }

  return filtered.slice().sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
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

function openAuth(mode: 'login' | 'register') {
  router.push({ name: 'home', query: { modal: 'auth', mode } })
}

function toggleUserMenu() {
  menuOpen.value = !menuOpen.value
}

function closeUserMenu() {
  menuOpen.value = false
}

function goProfile() {
  closeUserMenu()
  router.push({ name: 'profile' })
}

function logout() {
  closeUserMenu()
  auth.logout()
  router.push({ name: 'home' })
}

function resetFilters() {
  searchQuery.value = ''
  selectedPlatform.value = 'all'
  selectedVisibility.value = 'all'
  selectedSort.value = '最新'
}

function canOpenUrl(value: string | null): value is string {
  return Boolean(value && /^https?:\/\//i.test(value))
}

function openPrimaryLink(card: CustomResourceCard) {
  if (card.visibility === 'public') {
    router.push({ name: 'mc-resource-detail', params: { id: card.id } })
    return
  }

  const url = canOpenUrl(card.sourceUrl) ? card.sourceUrl : card.docsUrl
  if (!url) {
    showToast('该资源暂未提供可访问链接', 'info')
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
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
  <main class="page-shell custom-page-shell">
    <HomeHeroSection :isAuthed="auth.isAuthed" :username="auth.username" :menuOpen="menuOpen" :navLinks="heroNavLinks"
      @open-auth="openAuth" @toggle-user-menu="toggleUserMenu" @go-profile="goProfile" @logout="logout">
      <div class="hero-meta custom-hero-meta">
        <div class="hero-copy">
          <h1>我的定制资源</h1>
          <p class="desc">
            这里集中展示你需求单已经关联的资源项目。卡片风格与 MC 插件与模组保持一致，但只显示你自己的定制交付内容。
          </p>
        </div>
        <div class="hero-actions custom-hero-stats" aria-label="资源统计">
          <div class="custom-stat-card">
            <strong>{{ stats.total }}</strong>
            <span>已关联资源</span>
          </div>
          <div class="custom-stat-card">
            <strong>{{ stats.publicCount }}</strong>
            <span>公开中</span>
          </div>
          <div class="custom-stat-card">
            <strong>{{ stats.privateCount }}</strong>
            <span>私有中</span>
          </div>
        </div>
      </div>
    </HomeHeroSection>

    <section class="mc-filter-panel">
      <div class="filter-row flex-between">
        <div class="filter-group">
          <span class="label">平台：</span>
          <button class="tag" :class="{ active: selectedPlatform === 'all' }" type="button"
            @click="selectedPlatform = 'all'">
            全部
          </button>
          <button class="tag" :class="{ active: selectedPlatform === 'java' }" type="button"
            @click="selectedPlatform = 'java'">
            Java
          </button>
          <button class="tag" :class="{ active: selectedPlatform === 'bedrock' }" type="button"
            @click="selectedPlatform = 'bedrock'">
            Bedrock
          </button>
        </div>
        <div class="search-bar">
          <input v-model="searchQuery" type="text" placeholder="搜索我的定制资源..." />
          <span class="search-icon">🔍</span>
        </div>
      </div>

      <div class="filter-row flex-between mt-2 filter-row--wrap">
        <div class="filter-group">
          <span class="label">可见性：</span>
          <button class="tag" :class="{ active: selectedVisibility === 'all' }" type="button"
            @click="selectedVisibility = 'all'">
            全部
          </button>
          <button class="tag" :class="{ active: selectedVisibility === 'public' }" type="button"
            @click="selectedVisibility = 'public'">
            公开中
          </button>
          <button class="tag" :class="{ active: selectedVisibility === 'private' }" type="button"
            @click="selectedVisibility = 'private'">
            私有中
          </button>
        </div>
        <div class="filter-group">
          <span class="label">排序：</span>
          <button class="tag" :class="{ active: selectedSort === '最新' }" type="button" @click="selectedSort = '最新'">
            最新
          </button>
          <button class="tag" :class="{ active: selectedSort === '标题' }" type="button" @click="selectedSort = '标题'">
            标题
          </button>
          <button class="btn-reset" type="button" @click="resetFilters">↻ 重置筛选</button>
        </div>
      </div>
    </section>

    <section class="mc-content-grid">
      <div v-for="card in filteredCards" :key="`${card.requirementId}-${card.id}`" class="res-card">
        <div v-if="card.coverUrl" class="res-icon res-icon--image">
          <img :src="card.coverUrl" :alt="card.title" class="res-icon__image" />
        </div>
        <div v-else class="res-icon" :class="card.platform === 'bedrock' ? 'bg-green' : 'bg-blue'">
          {{ card.platform === 'bedrock' ? '⬛' : '☕' }}
        </div>
        <div class="res-info">
          <div class="custom-card-topline">
            <span class="custom-requirement-pill">需求单 {{ card.requirementId }}</span>
            <span class="custom-visibility-pill" :class="`is-${card.visibility}`">
              {{ card.visibility === 'public' ? '公开中' : '私有中' }}
            </span>
          </div>
          <h3>{{ card.title }}</h3>
          <p class="author">by {{ card.author }}</p>
          <p class="custom-requirement-title">关联需求：{{ card.requirementTitle }}</p>
          <p class="desc">{{ card.description }}</p>
          <div class="res-tags">
            <span v-for="tag in card.tags.length ? card.tags : ['未标注']" :key="`${card.id}-${tag}`">{{ tag }}</span>
          </div>
        </div>
        <div class="res-stats custom-res-stats">
          <span>{{ formatUpdatedAt(card.updatedAt) }}</span>
          <button class="btn-download" type="button"
            :disabled="card.visibility !== 'public' && !canOpenUrl(card.sourceUrl) && !canOpenUrl(card.docsUrl)"
            @click="openPrimaryLink(card)">
            {{ card.visibility === 'public' ? '查看公开页' : canOpenUrl(card.sourceUrl) ? '查看资源' : canOpenUrl(card.docsUrl) ?
              '查看文档' : '待补充' }}
          </button>
        </div>
      </div>

      <div v-if="!loading && filteredCards.length === 0" class="custom-empty-state">
        <h3>{{ cards.length === 0 ? '你还没有关联资源项目' : '没有符合当前筛选条件的资源' }}</h3>
        <p>
          {{ cards.length === 0 ? '当开发者把资源项目关联到你的需求单后，这里会自动出现对应的资源卡片。' : '可以尝试重置筛选，或者回到需求管理中调整资源公开状态。' }}
        </p>
        <button class="btn-reset" type="button" @click="cards.length === 0 ? goProfile() : resetFilters">
          {{ cards.length === 0 ? '前往需求管理' : '重置筛选' }}
        </button>
      </div>

      <div v-if="loading" class="custom-empty-state">
        <h3>资源加载中...</h3>
        <p>正在同步你的需求关联资源。</p>
      </div>
    </section>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>

<style scoped>
.custom-page-shell {
  gap: 28px;
}

.custom-hero-meta {
  align-items: stretch;
}

.custom-hero-stats {
  gap: 14px;
  flex-wrap: wrap;
}

.custom-stat-card {
  min-width: 120px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(6, 32, 50, 0.4);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.custom-stat-card strong {
  font-size: 28px;
  line-height: 1;
  color: var(--text-main);
}

.custom-stat-card span {
  color: var(--text-sub);
  font-size: 13px;
}

.filter-row--wrap {
  flex-wrap: wrap;
}

.custom-card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.custom-requirement-pill,
.custom-visibility-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.custom-requirement-pill {
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(96, 165, 250, 0.32);
}

.custom-visibility-pill.is-public {
  color: #b7f7d4;
  background: rgba(34, 197, 94, 0.16);
  border: 1px solid rgba(74, 222, 128, 0.32);
}

.custom-visibility-pill.is-private {
  color: #ffd9a8;
  background: rgba(249, 115, 22, 0.16);
  border: 1px solid rgba(251, 146, 60, 0.3);
}

.custom-requirement-title {
  margin: 8px 0 10px;
  font-size: 13px;
  color: rgba(226, 232, 240, 0.78);
}

.custom-res-stats {
  gap: 12px;
}

.custom-empty-state {
  grid-column: 1 / -1;
  min-height: 260px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(6, 32, 50, 0.34);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 32px;
  text-align: center;
}

.custom-empty-state h3 {
  margin: 0;
  font-size: 24px;
}

.custom-empty-state p {
  margin: 0;
  max-width: 560px;
  color: var(--text-sub);
  line-height: 1.7;
}

@media (max-width: 860px) {
  .custom-hero-stats {
    width: 100%;
  }

  .custom-stat-card {
    flex: 1 1 0;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .custom-card-topline {
    align-items: flex-start;
  }

  .custom-stat-card strong {
    font-size: 24px;
  }
}
</style>
