<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

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
const freeResourceSections = ref<FreeResourceSectionView[]>([])
const freeResourceLoading = ref(false)
const freeResourceLoaded = ref(false)
const freeResourceError = ref('')
const { showToast } = useToast()

const showResourceSkeleton = computed(() => freeResourceLoading.value && !freeResourceLoaded.value)
const freeResourceRefreshing = computed(() => freeResourceLoading.value && freeResourceLoaded.value)

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
  router.push({
    name: 'resource-catalog',
    params: { rootSlug: section.rootSlug, entrySlug: entry.entrySlug },
  })
}

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
            <button
              class="portal-page__link-btn"
              type="button"
              @click="router.push({ name: 'home' })"
            >
              返回首页
            </button>
          </div>
        </div>

        <div
          v-if="showResourceSkeleton"
          class="portal-page__resource-grid portal-page__resource-grid--loading"
          aria-busy="true"
          aria-label="正在加载免费资源分类"
        >
          <article
            v-for="index in 4"
            :key="index"
            class="portal-page__card portal-page__resource-skeleton"
          >
            <span class="portal-page__skeleton-chip"></span>
            <span class="portal-page__skeleton-title"></span>
            <span class="portal-page__skeleton-line portal-page__skeleton-line--wide"></span>
            <span class="portal-page__skeleton-line"></span>
            <span class="portal-page__skeleton-action"></span>
          </article>
        </div>

        <div
          v-else-if="freeResourceSections.length > 0"
          class="portal-page__resource-grid free-resource-grid"
        >
          <article
            v-for="section in freeResourceSections"
            :key="section.rootId"
            class="portal-page__card free-resource-group"
          >
            <div class="free-resource-group__head">
              <div class="free-resource-group__title">
                <span>一级标签组</span>
                <h2>{{ section.rootName }}</h2>
              </div>
              <span class="free-resource-group__count"
                >{{ section.entries.length }} 个二级标签组</span
              >
            </div>

            <div
              v-if="section.entries.length"
              class="free-resource-entry-list"
              aria-label="二级标签组"
            >
              <button
                v-for="entry in section.entries"
                :key="entry.entryId"
                class="free-resource-entry"
                type="button"
                @click="openFreeResourceEntry(section, entry)"
              >
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
          <strong>{{ freeResourceError ? '加载失败' : '标签树暂无可用分区' }}</strong>
          <span v-if="freeResourceError">{{ freeResourceError }}</span>
          <button
            v-if="freeResourceError"
            class="portal-page__action"
            type="button"
            @click="loadFreeResourceSections"
          >
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
            <li
              v-for="item in resourceGuide"
              :key="item.title"
              class="portal-page__timeline-item free-resource-guide__item"
            >
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

.portal-page--nav .free-resource-group {
  gap: 16px;
  min-height: 0;
  padding: 18px;
  overflow: hidden;
  border-color: rgba(191, 219, 254, 0.88);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96)),
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.1), transparent 30%);
  box-shadow: 0 10px 26px rgba(71, 85, 105, 0.08);
}

.free-resource-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.free-resource-group__title {
  display: grid;
  gap: 5px;
  min-width: 0;
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
  padding: 6px 11px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.62);
}

.free-resource-entry-list {
  display: grid;
  gap: 6px;
}

.free-resource-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.free-resource-entry:hover,
.free-resource-entry:focus-visible {
  border-color: rgba(37, 99, 235, 0.42);
  background: #f8fbff;
  transform: translateY(-1px);
  outline: none;
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

@media (max-width: 640px) {
  .portal-page--nav .free-resource-group {
    padding: 16px;
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
