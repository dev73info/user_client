<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppToast from '@/components/AppToast.vue'
import { getProcessedTagTree, type McTagCatalogRoot } from '@/api/resourceTags'
import { buildDevPortalUrl } from '@/config/runtime'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type FreeResourceSectionView = {
  rootId: number
  rootName: string
  rootSlug: string
  entrySlug: string | null
  summary: string
  actionLabel: string
}

type ResourceHighlight = {
  title: string
  summary: string
  action: string
}

const auth = useAuthStore()
const router = useRouter()
const freeResourceSections = ref<FreeResourceSectionView[]>([])
const freeResourceLoading = ref(false)
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

function openDevWorkbench() {
  void router.push(buildDevPortalUrl(auth.token))
}

const pageSignals = ['真实资源目录', '按标签分区浏览', '支持发布与管理']
const placeholderHighlights: ResourceHighlight[] = [
  { title: '素材与组件库', summary: '适合需要快速启动项目的团队，集中沉淀 UI 组件、图标与页面模版。', action: '浏览公开资源' },
  { title: '开发工具与脚手架', summary: '收录工程脚手架、自动化脚本和提效工具，支持即拿即用。', action: '进入工具分区' },
  { title: '行业专题资源', summary: '按教育、游戏、SaaS 等业务方向汇总资源，便于横向比较与选型。', action: '查看专题' },
]

const resourceStats = computed(() => {
  const rootCount = freeResourceSections.value.length
  const entryCount = freeResourceSections.value.reduce((sum, item) => sum + (item.entrySlug ? 1 : 0), 0)
  return [
    { label: '根分区', value: `${rootCount}` },
    { label: '可直达入口', value: `${entryCount}` },
    { label: '推荐专题', value: '12+' },
    { label: '本周上新', value: '18' },
  ]
})

const resourceGuide = [
  { title: '先选根分区', detail: '从平台当前开放的根节点开始，逐步进入具体资源目录。' },
  { title: '按标签筛选', detail: '进入目录后可继续按标签、发布分组和资源 slug 精准定位。' },
  { title: '进入开发者端', detail: '若你需要上传、维护或版本管理，请直接进入开发者工作台。' },
]

const platformFeeds = [
  '免费资源目录会根据标签树自动扩展，无需手工维护导航。',
  '当前部分专题卡片为占位数据，用于完善门户视觉与交互层级。',
  '后续可接入资源热度、下载量和最近更新记录。',
]

function buildFreeResourceSummary(root: McTagCatalogRoot) {
  const entryCount = root.entries.length
  const tagCount = root.entries.reduce(
    (sum, entry) => sum + entry.publish_groups.reduce((innerSum, group) => innerSum + group.items.length, 0),
    0,
  )
  const childNames = root.entries.map((entry) => entry.label)

  if (entryCount <= 0 && tagCount <= 0) {
    return '当前根节点下还没有公开标签内容。'
  }

  if (childNames.length > 0) {
    const previewNames = childNames.slice(0, 3).join(' / ')
    return `下含 ${previewNames}${childNames.length > 3 ? ' 等分区' : ''}。`
  }

  if (tagCount <= 0) {
    return `包含 ${entryCount} 个下级分组。`
  }

  return `包含 ${entryCount} 个下级分组，覆盖 ${tagCount} 个标签节点。`
}

async function loadFreeResourceSections() {
  freeResourceLoading.value = true
  try {
    const tree = await getProcessedTagTree()
    freeResourceSections.value = tree.roots.map((root, index): FreeResourceSectionView => {
      const hasContent = root.entries.length > 0
      return {
        rootId: index,
        rootName: root.label,
        rootSlug: root.key,
        entrySlug: root.first_entry_key,
        summary: buildFreeResourceSummary(root),
        actionLabel: hasContent ? '进入分区' : '即将开放',
      }
    })
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载免费资源导航失败', 'warning')
  } finally {
    freeResourceLoading.value = false
  }
}

function openFreeResourceRoot(section: FreeResourceSectionView) {
  router.push({
    name: 'resource-catalog',
    params: section.entrySlug
      ? { rootSlug: section.rootSlug, entrySlug: section.entrySlug }
      : { rootSlug: section.rootSlug },
  })
}

onMounted(() => {
  auth.hydrate()
  void loadFreeResourceSections()
})
</script>

<template>
  <main class="portal-page">
    <section class="portal-page__hero">
      <div class="portal-page__hero-copy">
        <p class="portal-page__eyebrow">Free Resources</p>
        <h1>免费资源导航</h1>
        <p>查看平台当前公开的免费资源根分区入口，按标签树和专题方向快速进入对应资源目录。缺失的热点、专题和下载量目前使用占位数据补齐门户层级。</p>

        <div class="portal-page__signal-list">
          <span v-for="signal in pageSignals" :key="signal" class="portal-page__signal">{{ signal }}</span>
        </div>

        <div class="portal-page__hero-actions">
          <button class="portal-page__primary" type="button" @click="openDevWorkbench">进入开发者工作台</button>
          <button class="portal-page__secondary" type="button" @click="router.push({ name: 'home' })">返回门户首页</button>
        </div>
      </div>

      <div class="portal-page__hero-visual" aria-hidden="true">
        <div class="portal-page__hero-orbit">
          <div class="portal-page__hero-core">◫</div>
          <div class="portal-page__hero-float portal-page__hero-float--one">#</div>
          <div class="portal-page__hero-float portal-page__hero-float--two">⊞</div>
          <div class="portal-page__hero-float portal-page__hero-float--three">⌘</div>
          <div class="portal-page__hero-float portal-page__hero-float--four">✦</div>
        </div>
      </div>
    </section>

    <section class="portal-page__stats">
      <article v-for="item in resourceStats" :key="item.label" class="portal-page__stat-card">
        <strong>{{ item.value }}</strong>
        <span>{{ item.label }}</span>
      </article>
    </section>

    <section class="portal-page__content">
      <section class="portal-page__panel">
        <div class="portal-page__section-header">
          <div>
            <p class="portal-page__eyebrow">开放分区</p>
            <h2>按标签树根节点进入资源目录</h2>
          </div>
          <button class="portal-page__link-btn" type="button" @click="router.push({ name: 'home' })">返回首页</button>
        </div>

        <div v-if="freeResourceLoading" class="portal-page__empty">正在加载免费资源分类...</div>

        <div v-else-if="freeResourceSections.length > 0" class="portal-page__resource-grid">
          <article v-for="section in freeResourceSections" :key="section.rootId" class="portal-page__card">
            <div class="portal-page__card-topline">
              <span class="portal-page__chip">资源入口</span>
              <span class="portal-page__meta">{{ section.entrySlug ? '可进入' : '占位中' }}</span>
            </div>
            <h2>{{ section.rootName }}</h2>
            <p>{{ section.summary }}</p>
            <div class="portal-page__card-footer">
              <strong>{{ section.entrySlug ? '已开放' : '待完善' }}</strong>
              <button class="portal-page__action" type="button" @click="openFreeResourceRoot(section)">
                {{ section.actionLabel }}
              </button>
            </div>
          </article>
        </div>

        <div v-else class="portal-page__empty">标签树暂无可用分区。</div>
      </section>

      <aside class="portal-page__aside">
        <section class="portal-page__aside-card">
          <div class="portal-page__aside-head">
            <h3>资源浏览指引</h3>
          </div>
          <ul class="portal-page__timeline">
            <li v-for="item in resourceGuide" :key="item.title" class="portal-page__timeline-item">
              <div>
                <strong>{{ item.title }}</strong>
                <p>{{ item.detail }}</p>
              </div>
            </li>
          </ul>
        </section>

        <section class="portal-page__aside-card">
          <div class="portal-page__aside-head">
            <h3>平台提示</h3>
          </div>
          <ul class="portal-page__list">
            <li v-for="item in platformFeeds" :key="item" class="portal-page__list-item">
              <strong>{{ item }}</strong>
            </li>
          </ul>
        </section>
      </aside>
    </section>

    <section class="portal-page__panel">
      <div class="portal-page__section-header">
        <div>
          <p class="portal-page__eyebrow">专题占位</p>
          <h2>在真实专题推荐上线前，先用占位卡片补齐门户体验</h2>
        </div>
      </div>
      <div class="portal-page__collection-grid">
        <article v-for="item in placeholderHighlights" :key="item.title" class="portal-page__collection-card">
          <span class="portal-page__icon-chip">✦ 专题</span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.summary }}</p>
          <button class="portal-page__action" type="button" @click="showToast('专题详情待接入真实数据', 'info')">{{ item.action
            }}</button>
        </article>
      </div>
    </section>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>
