<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getCachedProcessedTagTree,
  getProcessedTagTree,
  type McTagCatalogEntry,
  type McProcessedTagTree,
} from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type FreeResourceSectionView = {
  rootId: number
  rootName: string
  rootSlug: string
  entries: FreeResourceEntryView[]
}

type FreeResourceEntryView = {
  entryId: string
  entryName: string
  entrySlug: string
  groupCount: number
  tagCount: number
}

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const freeResourceSections = ref<FreeResourceSectionView[]>([])
const freeResourceLoading = ref(false)
const freeResourceLoaded = ref(false)
const freeResourceError = ref('')
const freeResourceKeyword = ref('')
const { showToast } = useToast()

const showResourceSkeleton = computed(() => freeResourceLoading.value && !freeResourceLoaded.value)
const freeResourceRefreshing = computed(() => freeResourceLoading.value && freeResourceLoaded.value)
const normalizedFreeResourceKeyword = computed(() => freeResourceKeyword.value.trim().toLowerCase())
const freeResourceSearchActive = computed(() => normalizedFreeResourceKeyword.value.length > 0)
const filteredFreeResourceSections = computed(() => {
  const keyword = normalizedFreeResourceKeyword.value
  if (!keyword) {
    return freeResourceSections.value
  }

  return freeResourceSections.value
    .map((section) => {
      const rootMatches = section.rootName.toLowerCase().includes(keyword)
      const entries = rootMatches
        ? section.entries
        : section.entries.filter((entry) =>
          [entry.entryName, entry.entrySlug].join(' ').toLowerCase().includes(keyword),
        )

      return entries.length > 0 ? { ...section, entries } : null
    })
    .filter((section): section is FreeResourceSectionView => Boolean(section))
})
const filteredFreeResourceEntryCount = computed(() =>
  filteredFreeResourceSections.value.reduce((sum, section) => sum + section.entries.length, 0),
)

const resourceGuide = [
  { title: '选择分区', detail: '从根分区进入对应资源目录。' },
  { title: '按标签筛选', detail: '在目录内按标签、分组和资源 slug 定位。' },
  { title: '开发者功能', detail: '上传、维护和版本管理在工作台处理。' },
]

function countEntryTags(entry: McTagCatalogEntry) {
  return entry.publish_groups.reduce((sum, group) => sum + group.items.length, 0)
}

function mapFreeResourceEntries(entries: McTagCatalogEntry[]): FreeResourceEntryView[] {
  return entries.map((entry) => ({
    entryId: entry.key,
    entryName: entry.label,
    entrySlug: entry.key,
    groupCount: entry.publish_groups.length,
    tagCount: countEntryTags(entry),
  }))
}

function mapFreeResourceSections(tree: McProcessedTagTree): FreeResourceSectionView[] {
  return tree.roots.map((root, index): FreeResourceSectionView => {
    return {
      rootId: index,
      rootName: root.label,
      rootSlug: root.key,
      entries: mapFreeResourceEntries(root.entries),
    }
  })
}

function applyFreeResourceTree(tree: McProcessedTagTree) {
  freeResourceSections.value = mapFreeResourceSections(tree)
  freeResourceLoaded.value = true
  freeResourceError.value = ''
}

function hydrateFreeResourceSectionsFromCache() {
  const cachedTree = getCachedProcessedTagTree()
  if (cachedTree) {
    applyFreeResourceTree(cachedTree)
  }
}

async function loadFreeResourceSections() {
  freeResourceLoading.value = true
  try {
    const tree = await getProcessedTagTree()
    applyFreeResourceTree(tree)
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载免费资源导航失败'
    freeResourceError.value = message
    freeResourceLoaded.value = true
    showToast(message, 'warning')
  } finally {
    freeResourceLoading.value = false
  }
}

function openFreeResourceEntry(section: FreeResourceSectionView, entry: FreeResourceEntryView) {
  const keyword = freeResourceKeyword.value.trim()
  router.push({
    name: 'resource-catalog',
    params: { rootSlug: section.rootSlug, entrySlug: entry.entrySlug },
    query: keyword ? { search: keyword } : {},
  })
}

function resetFreeResourceKeyword() {
  freeResourceKeyword.value = ''
  if (route.query.keyword) {
    const nextQuery = { ...route.query }
    delete nextQuery.keyword
    void router.replace({ query: nextQuery })
  }
}

watch(
  () => route.query.keyword,
  (value) => {
    freeResourceKeyword.value = typeof value === 'string' ? value.trim() : ''
  },
  { immediate: true },
)

onMounted(() => {
  auth.hydrate()
  hydrateFreeResourceSectionsFromCache()
  void loadFreeResourceSections()
})
</script>

<template>
  <main class="portal-page portal-page--nav">
    <section class="portal-page__content">
      <section class="portal-page__panel">
        <div class="portal-page__section-header">
          <div>
            <p class="portal-page__eyebrow">开放分区</p>
            <h2>免费资源目录</h2>
          </div>
          <div class="portal-page__header-actions">
            <span v-if="freeResourceRefreshing" class="portal-page__loading-chip">更新中</span>
            <button class="portal-page__link-btn" type="button" @click="router.push({ name: 'home' })">
              返回首页
            </button>
          </div>
        </div>

        <div v-if="freeResourceSearchActive" class="free-resource-search-summary">
          <div>
            <strong>“{{ freeResourceKeyword.trim() }}”</strong>
            <span>匹配 {{ filteredFreeResourceEntryCount }} 个分区入口</span>
          </div>
          <button class="portal-page__link-btn" type="button" @click="resetFreeResourceKeyword">
            清除
          </button>
        </div>

        <div v-if="showResourceSkeleton" class="portal-page__resource-grid portal-page__resource-grid--loading"
          aria-busy="true" aria-label="正在加载免费资源分类">
          <article v-for="index in 4" :key="index" class="portal-page__card portal-page__resource-skeleton">
            <span class="portal-page__skeleton-chip"></span>
            <span class="portal-page__skeleton-title"></span>
            <span class="portal-page__skeleton-line portal-page__skeleton-line--wide"></span>
            <span class="portal-page__skeleton-line"></span>
            <span class="portal-page__skeleton-action"></span>
          </article>
        </div>

        <div v-else-if="filteredFreeResourceSections.length > 0" class="portal-page__resource-grid free-resource-grid">
          <article v-for="(section, sectionIndex) in filteredFreeResourceSections" :key="section.rootId"
            class="portal-page__card free-resource-group" :style="{ '--group-index': String(sectionIndex) }">
            <div class="free-resource-group__head">
              <div class="free-resource-group__title">
                <span>一级标签组</span>
                <h2>{{ section.rootName }}</h2>
              </div>
              <span class="free-resource-group__count">{{ section.entries.length }} 个二级标签组</span>
            </div>

            <div v-if="section.entries.length" class="free-resource-entry-list" aria-label="二级标签组">
              <button v-for="(entry, entryIndex) in section.entries" :key="entry.entryId" class="free-resource-entry"
                type="button" :style="{ '--entry-index': String(entryIndex) }"
                @click="openFreeResourceEntry(section, entry)">
                <strong>{{ entry.entryName }}</strong>
                <span class="free-resource-entry__meta">
                  <span>{{ entry.groupCount }} 个入口</span>
                  <span v-if="entry.tagCount > 0">{{ entry.tagCount }} 个标签</span>
                </span>
              </button>
            </div>

            <p v-else class="free-resource-group__empty">暂无二级标签组</p>
          </article>
        </div>

        <div v-else class="portal-page__empty portal-page__empty--stacked">
          <strong>{{ freeResourceError ? '加载失败' : freeResourceSearchActive ? '没有匹配的资源分区' : '标签树暂无可用分区' }}</strong>
          <span v-if="freeResourceError">{{ freeResourceError }}</span>
          <span v-else-if="freeResourceSearchActive">换个关键词或清除搜索后再试。</span>
          <button v-if="freeResourceError" class="portal-page__action" type="button" @click="loadFreeResourceSections">
            重新加载
          </button>
        </div>
      </section>

      <aside class="portal-page__aside">
        <section class="portal-page__aside-card free-resource-guide">
          <div class="portal-page__aside-head">
            <h3>资源浏览指引</h3>
          </div>
          <ul class="portal-page__timeline free-resource-guide__list">
            <li v-for="item in resourceGuide" :key="item.title"
              class="portal-page__timeline-item free-resource-guide__item">
              <div>
                <strong>{{ item.title }}</strong>
                <p>{{ item.detail }}</p>
              </div>
            </li>
          </ul>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.free-resource-grid {
  gap: 14px;
}

.free-resource-search-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid rgba(191, 219, 254, 0.82);
  border-radius: 16px;
  background: rgba(239, 246, 255, 0.72);
}

.free-resource-search-summary div {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.free-resource-search-summary strong {
  min-width: 0;
  overflow: hidden;
  color: #1d4ed8;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.free-resource-search-summary span {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.portal-page--nav .free-resource-group {
  position: relative;
  gap: 16px;
  min-height: 0;
  padding: 20px;
  overflow: hidden;
  isolation: isolate;
  border-color: rgba(191, 219, 254, 0.78);
  background:
    radial-gradient(circle at 90% 0%, rgba(37, 99, 235, 0.1), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
  box-shadow: 0 10px 26px rgba(71, 85, 105, 0.08);
  opacity: 0;
  animation: free-resource-group-in 360ms ease both;
  animation-delay: calc(var(--group-index, 0) * 70ms);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.portal-page--nav .free-resource-group::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  pointer-events: none;
  height: 2px;
  background: linear-gradient(90deg,
      rgba(37, 99, 235, 0),
      rgba(37, 99, 235, 0.42),
      rgba(37, 99, 235, 0));
  opacity: 0;
  transform: translateX(-36%);
  transition:
    opacity 180ms ease,
    transform 260ms ease;
}

.portal-page--nav .free-resource-group::after {
  content: '';
  position: absolute;
  right: -42px;
  top: -58px;
  z-index: -1;
  width: 150px;
  height: 150px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.42);
  filter: blur(2px);
  opacity: 0.55;
  transition:
    opacity 180ms ease,
    transform 220ms ease;
}

.portal-page--nav .free-resource-group:hover,
.portal-page--nav .free-resource-group:focus-within {
  border-color: rgba(147, 197, 253, 0.96);
  box-shadow: 0 20px 44px rgba(37, 99, 235, 0.12);
  transform: translateY(-2px);
}

.portal-page--nav .free-resource-group:hover::before,
.portal-page--nav .free-resource-group:focus-within::before {
  opacity: 1;
  transform: translateX(0);
}

.portal-page--nav .free-resource-group:hover::after,
.portal-page--nav .free-resource-group:focus-within::after {
  opacity: 0.85;
  transform: translate(-8px, 8px) scale(1.05);
}

.free-resource-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.free-resource-group__title {
  position: relative;
  display: grid;
  gap: 5px;
  min-width: 0;
  padding-left: 12px;
}

.free-resource-group__title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, #2563eb, #93c5fd);
}

.free-resource-group__title span {
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.free-resource-group__title h2 {
  font-size: 21px;
  line-height: 1.28;
}

.free-resource-group__count {
  flex: 0 0 auto;
  padding: 7px 12px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
  box-shadow:
    inset 0 0 0 1px rgba(147, 197, 253, 0.62),
    0 8px 18px rgba(37, 99, 235, 0.08);
  transition:
    background-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.portal-page--nav .free-resource-group:hover .free-resource-group__count,
.portal-page--nav .free-resource-group:focus-within .free-resource-group__count {
  background: #dbeafe;
  box-shadow:
    inset 0 0 0 1px rgba(96, 165, 250, 0.72),
    0 10px 22px rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
}

.free-resource-entry-list {
  display: grid;
  gap: 6px;
}

.free-resource-entry {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  opacity: 0;
  animation: free-resource-entry-in 320ms ease both;
  animation-delay: calc(var(--group-index, 0) * 70ms + var(--entry-index, 0) * 50ms + 120ms);
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.free-resource-entry::before {
  content: '';
  position: absolute;
  inset: 9px auto 9px 0;
  z-index: -1;
  width: 3px;
  border-radius: 999px;
  background: #2563eb;
  opacity: 0;
  transform: scaleY(0.4);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.free-resource-entry::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(135deg,
      rgba(255, 255, 255, 0),
      rgba(255, 255, 255, 0.86),
      rgba(255, 255, 255, 0));
  opacity: 0;
  transform: translateX(-70%);
  transition:
    opacity 160ms ease,
    transform 340ms ease;
}

.free-resource-entry>* {
  position: relative;
  z-index: 1;
}

.free-resource-entry:hover,
.free-resource-entry:focus-visible {
  border-color: rgba(37, 99, 235, 0.42);
  background: #fff;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.08);
  transform: translateY(-2px);
  outline: none;
}

.free-resource-entry:hover::before,
.free-resource-entry:focus-visible::before {
  opacity: 1;
  transform: scaleY(1);
}

.free-resource-entry:hover::after,
.free-resource-entry:focus-visible::after {
  opacity: 1;
  transform: translateX(72%);
}

.free-resource-entry strong {
  color: #0f172a;
  font-size: 15px;
  line-height: 1.35;
}

.free-resource-entry__meta {
  display: inline-flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.free-resource-entry__meta span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.96);
  color: #475569;
  font-size: 12px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.9);
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.free-resource-entry:hover .free-resource-entry__meta span,
.free-resource-entry:focus-visible .free-resource-entry__meta span {
  background: rgba(239, 246, 255, 0.98);
  color: #1d4ed8;
  box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.72);
  transform: translateY(-1px);
}

.free-resource-group__empty {
  margin: 0;
  color: #64748b;
  font-size: 14px;
  font-weight: 700;
}

.free-resource-guide {
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
}

.free-resource-guide .portal-page__aside-head {
  padding-bottom: 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

.free-resource-guide .portal-page__aside-head h3 {
  font-size: 20px;
  line-height: 1.3;
}

.free-resource-guide__list {
  counter-reset: resource-guide;
  gap: 0;
}

.portal-page--nav .free-resource-guide .free-resource-guide__item {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: flex-start;
  justify-content: start;
  gap: 12px;
  padding: 14px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  counter-increment: resource-guide;
}

.free-resource-guide__item::before {
  content: counter(resource-guide, decimal-leading-zero);
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.58);
}

.free-resource-guide__item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 16px;
  top: 48px;
  bottom: -6px;
  width: 1px;
  background: rgba(191, 219, 254, 0.88);
}

.free-resource-guide__item strong {
  display: block;
  font-size: 15px;
  line-height: 1.45;
}

.free-resource-guide__item p {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 1.65;
}

@keyframes free-resource-group-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes free-resource-entry-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {

  .portal-page--nav .free-resource-group,
  .free-resource-entry {
    animation: none;
    opacity: 1;
  }

  .portal-page--nav .free-resource-group,
  .free-resource-entry,
  .free-resource-group__count,
  .free-resource-entry__meta span {
    transition: none;
  }
}

@media (max-width: 640px) {
  .portal-page--nav .free-resource-group {
    padding: 16px;
  }

  .free-resource-search-summary,
  .free-resource-search-summary div {
    align-items: flex-start;
    flex-direction: column;
  }

  .free-resource-group__head {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .free-resource-group__title h2 {
    font-size: 19px;
  }

  .free-resource-group__count {
    width: fit-content;
  }

  .free-resource-entry {
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .free-resource-entry__meta {
    justify-content: flex-start;
  }

  .portal-page--nav .free-resource-guide {
    padding: 14px 16px;
    border-radius: 16px;
  }

  .free-resource-guide .portal-page__aside-head {
    padding-bottom: 10px;
  }

  .free-resource-guide .portal-page__aside-head h3 {
    font-size: 18px;
  }

  .portal-page--nav .free-resource-guide .free-resource-guide__item {
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 10px;
    padding: 12px 0;
  }

  .free-resource-guide__item::before {
    width: 28px;
    height: 28px;
    font-size: 11px;
  }

  .free-resource-guide__item:not(:last-child)::after {
    left: 14px;
    top: 42px;
  }
}
</style>
