<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { useRoute, useRouter } from 'vue-router'

import { HttpError, apiUrl } from '@/api/http'
import AppToast from '@/components/AppToast.vue'
import { buildDevPortalUrl } from '@/config/runtime'
import {
  getPublicMcResource,
  listPublicMcResourceVersions,
  downloadPublicMcResourceFile,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { getTagRouteSlug, normalizeTagName, parseResourceIdFromSlug } from '@/api/resourceTags'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

const loading = ref(false)
const resource = ref<PublicMcResourceItem | null>(null)
const versions = ref<PublicMcResourceVersionItem[]>([])

const tagNames = computed(() => resource.value?.tag_selections.flatMap((item) => item.tag_names) ?? [])
const platformLabel = computed(() => resource.value?.platform ?? '未知平台')
const visibilityLabel = computed(() => (resource.value?.visibility === 'published' ? '公开展示中' : '待正式发布'))
const currentRootSlug = computed(() => {
  const raw = route.params.rootSlug
  return typeof raw === 'string' ? raw.trim() : ''
})
const currentEntrySlug = computed(() => {
  const raw = route.params.entrySlug
  return typeof raw === 'string' ? raw.trim() : ''
})
const resourceRootName = computed(() => {
  const rootName = resource.value?.tag_selections.find((item) => item.group_path.length > 0)?.group_path[0]
  return normalizeTagName(rootName || '')
})
const detailSignals = computed(() => [
  platformLabel.value,
  visibilityLabel.value,
  latestVersion.value ? `最新版本 ${latestVersion.value.version}` : '当前暂无版本记录',
])
const infoCards = computed(() => {
  if (!resource.value) {
    return []
  }

  return [
    {
      label: '平台',
      value: platformLabel.value,
      hint: resource.value.platform,
      tone: 'platform',
    },
    {
      label: '历史版本',
      value: `${versions.value.length}`,
      hint: latestVersion.value ? `当前最新为 ${latestVersion.value.version}` : '当前还没有版本记录',
      tone: 'versions',
    },
    {
      label: '最近更新',
      value: formatUpdatedDate(resource.value.updated_at),
      hint: formatUpdatedTime(resource.value.updated_at),
      tone: 'updated',
    },
  ]
})
const resourceCoverUrl = computed(() => (resource.value?.cover_url ? apiUrl(resource.value.cover_url) : ''))
const latestVersion = computed(() => versions.value[0] ?? null)
const pageContentHtml = computed(() => formatHomepageContent(resource.value?.release_note || ''))

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

function sanitizeRichHtml(value: string): string {
  const template = document.createElement('template')
  template.innerHTML = value

  template.content.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove())

  template.content.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      const attributeValue = attribute.value.trim()
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name)
        return
      }

      if ((name === 'href' || name === 'src') && /^javascript:/i.test(attributeValue)) {
        element.removeAttribute(attribute.name)
      }
    })
  })

  return template.innerHTML
}

function formatHomepageContent(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return sanitizeRichHtml(trimmed)
  }

  return sanitizeRichHtml(markdownRenderer.render(trimmed))
}

function backToPlatform() {
  const fallbackRootSlug = getTagRouteSlug(resourceRootName.value)
  const fallbackEntrySlug = getTagRouteSlug(resource.value?.platform ?? '')
  router.push({
    name: 'resource-catalog',
    params: {
      rootSlug: currentRootSlug.value || fallbackRootSlug,
      entrySlug: currentEntrySlug.value || fallbackEntrySlug,
    },
  })
}

function openDevWorkbench() {
  void router.push(buildDevPortalUrl(auth.token))
}

function formatUpdatedDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '未知日期'
  }

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatUpdatedTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function triggerDownload(url: string, fileName: string) {
  const token = auth.token?.trim() ? auth.token : null
  try {
    const { blob, fileName: resolvedFileName } = await downloadPublicMcResourceFile(url, fileName, token)

    const objectUrl = URL.createObjectURL(blob)
    try {
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = resolvedFileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
      const isHistoryMode = import.meta.env.VITE_ROUTER_MODE === 'history'
      const normalizedPath = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : `${window.location.pathname}/`
      const target = isHistoryMode ? normalizedPath : `${normalizedPath}#/`
      window.location.replace(target)
      throw new Error('未登录或登录已过期，请重新登录')
    }

    throw error
  }
}

async function openResourceFile() {
  if (!latestVersion.value?.resource) {
    showToast('当前还没有可下载的历史版本', 'info')
    return
  }

  const fileName = resource.value?.file_name || latestVersion.value.resource.split('/').pop() || 'download'
  try {
    await triggerDownload(latestVersion.value.resource, fileName)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '下载资源失败', 'warning')
  }
}

async function downloadVersion(version: PublicMcResourceVersionItem) {
  const fileName = resource.value?.file_name || version.resource.split('/').pop() || 'download'
  try {
    await triggerDownload(version.resource, fileName)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '下载资源失败', 'warning')
  }
}

function formatVersionTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN')
}

async function loadResource() {
  const resourceSlug = String(route.params.resourceSlug ?? '')
  const resourceId = parseResourceIdFromSlug(resourceSlug)
  if (!resourceId) {
    showToast('资源编号无效', 'warning')
    router.replace({ name: 'home' })
    return
  }

  loading.value = true
  try {
    const token = auth.token?.trim() ? auth.token : null
    const [resourceDetail, resourceVersions] = await Promise.all([
      getPublicMcResource(resourceId, token),
      listPublicMcResourceVersions(resourceId, token),
    ])
    resource.value = resourceDetail
    versions.value = resourceVersions
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载资源主页失败'
    showToast(message, 'warning')
    router.replace({ name: 'home' })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  void loadResource()
})

watch(
  () => route.params.resourceSlug,
  () => {
    void loadResource()
  },
)
</script>

<template>
  <main class="portal-page resource-detail-page">
    <section class="portal-page__hero">
      <div class="portal-page__hero-copy">
        <p class="portal-page__eyebrow">Resource Detail</p>
        <h1>{{ resource?.title || '资源主页' }}</h1>
        <p>查看资源介绍、版本记录与下载入口；如需发布和管理自己的资源，可进入开发者工作台。当前页已切换到与门户首页一致的子页视觉层。</p>

        <div class="portal-page__signal-list">
          <span v-for="signal in detailSignals" :key="signal" class="portal-page__signal">{{ signal }}</span>
        </div>

        <div class="portal-page__hero-actions">
          <button class="portal-page__primary" type="button" @click="openDevWorkbench">进入开发者工作台</button>
          <button class="portal-page__secondary" type="button" @click="backToPlatform">返回目录</button>
        </div>
      </div>

      <div class="portal-page__hero-visual" aria-hidden="true">
        <div class="portal-page__hero-orbit">
          <div class="portal-page__hero-core">详</div>
          <div class="portal-page__hero-float portal-page__hero-float--one">版</div>
          <div class="portal-page__hero-float portal-page__hero-float--two">更</div>
          <div class="portal-page__hero-float portal-page__hero-float--three">下</div>
          <div class="portal-page__hero-float portal-page__hero-float--four">源</div>
        </div>
      </div>
    </section>

    <section v-if="infoCards.length" class="portal-page__stats">
      <article v-for="item in infoCards" :key="item.label"
        class="portal-page__stat-card resource-detail-page__stat-card">
        <strong>{{ item.value }}</strong>
        <span>{{ item.label }}</span>
        <small class="resource-detail-page__stat-hint">{{ item.hint }}</small>
      </article>
    </section>

    <section class="resource-detail-page__panel" v-loading="loading">
      <template v-if="resource">
        <section class="resource-detail-page__lead">
          <div class="resource-detail-page__cover-card">
            <img v-if="resource.cover_url" :src="resourceCoverUrl" :alt="resource.title"
              class="resource-detail-page__cover-image" />
            <div v-else class="resource-detail-page__cover-placeholder">📁
            </div>
          </div>

          <div class="resource-detail-page__summary-card">
            <div class="resource-detail-page__headline-row">
              <span class="resource-detail-page__status-pill">{{ visibilityLabel }}</span>
              <span class="resource-detail-page__author-pill">by {{ resource.author }}</span>
            </div>
            <p class="resource-detail-page__meta">创建者：{{ resource.creator }}</p>
            <p class="resource-detail-page__summary">{{ resource.description }}</p>

            <div v-if="tagNames.length > 0" class="resource-detail-page__tags">
              <span v-for="item in tagNames" :key="item" class="resource-detail-page__tag">{{ item }}</span>
            </div>

            <div class="resource-detail-page__cta-row">
              <button class="resource-detail-page__primary-btn" type="button" @click="openResourceFile">下载最新版本</button>
              <button class="resource-detail-page__secondary-btn" type="button" @click="backToPlatform">继续浏览</button>
            </div>
          </div>
        </section>

        <section class="resource-detail-page__detail-grid">
          <article class="resource-detail-page__content-card">
            <header class="resource-detail-page__section-head">
              <h2>页面内容</h2>
              <span>Content</span>
            </header>
            <div v-if="pageContentHtml" class="resource-detail-page__content-flow resource-detail-page__rich-text"
              v-html="pageContentHtml" />
            <p v-else class="resource-detail-page__paragraph">
              当前还没有额外补充说明。后续更新、兼容性说明或使用建议会展示在这里。
            </p>
          </article>

          <article class="resource-detail-page__content-card">
            <header class="resource-detail-page__section-head">
              <h2>历史版本</h2>
              <span>Versions</span>
            </header>
            <div v-if="versions.length" class="resource-detail-page__version-list">
              <article v-for="version in versions" :key="version.id" class="resource-detail-page__version-card">
                <div class="resource-detail-page__version-headline">
                  <div class="resource-detail-page__version-meta">
                    <strong>{{ version.version }}</strong>
                    <span>{{ formatVersionTime(version.created_at) }}</span>
                  </div>
                  <button class="resource-detail-page__version-download" type="button"
                    @click="downloadVersion(version)">
                    下载
                  </button>
                </div>
                <p class="resource-detail-page__paragraph">
                  {{ version.note || '当前版本暂无补充说明。' }}
                </p>
              </article>
            </div>
            <p v-else class="resource-detail-page__paragraph">
              当前还没有可展示的历史版本。
            </p>
          </article>
        </section>
      </template>
    </section>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>

<style scoped>
.resource-detail-page {
  gap: 28px;
}

.resource-detail-page__panel {
  border-radius: 28px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 42px rgba(76, 103, 172, 0.12);
  backdrop-filter: blur(18px);
  padding: 24px;
}

.resource-detail-page__lead {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.25fr);
  gap: 22px;
}

.resource-detail-page__cover-card,
.resource-detail-page__summary-card,
.resource-detail-page__content-card,
.resource-detail-page__version-card {
  border-radius: 24px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(248, 250, 252, 0.92);
}

.resource-detail-page__cover-card {
  min-height: 360px;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(84, 124, 255, 0.18), transparent 30%),
    linear-gradient(160deg, rgba(219, 234, 254, 0.95), rgba(239, 246, 255, 0.92));
}

.resource-detail-page__cover-image,
.resource-detail-page__cover-placeholder {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resource-detail-page__cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(72px, 10vw, 120px);
}

.resource-detail-page__summary-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-detail-page__headline-row,
.resource-detail-page__cta-row,
.resource-detail-page__version-headline,
.resource-detail-page__version-meta,
.resource-detail-page__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__status-pill,
.resource-detail-page__author-pill,
.resource-detail-page__tag,
.resource-detail-page__meta-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
}

.resource-detail-page__status-pill {
  color: #15803d;
  background: rgba(220, 252, 231, 0.92);
}

.resource-detail-page__author-pill {
  color: #1d4ed8;
  background: rgba(219, 234, 254, 0.92);
}

.resource-detail-page__meta,
.resource-detail-page__summary,
.resource-detail-page__paragraph,
.resource-detail-page__stat-hint,
.resource-detail-page__version-meta span,
.resource-detail-page__rich-text :deep(p),
.resource-detail-page__rich-text :deep(blockquote),
.resource-detail-page__rich-text :deep(ul),
.resource-detail-page__rich-text :deep(ol),
.resource-detail-page__rich-text :deep(td) {
  margin: 0;
  color: #64748b;
  line-height: 1.8;
}

.resource-detail-page__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.resource-detail-page__tag,
.resource-detail-page__meta-chip {
  color: #1d4ed8;
  background: rgba(219, 234, 254, 0.92);
}

.resource-detail-page__primary-btn,
.resource-detail-page__secondary-btn,
.resource-detail-page__version-download {
  border: 0;
  border-radius: 12px;
  min-height: 44px;
  padding: 0 16px;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.resource-detail-page__primary-btn:hover,
.resource-detail-page__secondary-btn:hover,
.resource-detail-page__version-download:hover {
  transform: translateY(-1px);
}

.resource-detail-page__primary-btn {
  border: 0;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  font-weight: 700;
}

.resource-detail-page__secondary-btn,
.resource-detail-page__version-download {
  color: #1d4ed8;
  background: rgba(239, 246, 255, 0.9);
  font-weight: 700;
}

.resource-detail-page__stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resource-detail-page__stat-hint,
.resource-detail-page__section-head span {
  font-size: 12px;
}

.resource-detail-page__detail-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.resource-detail-page__content-card {
  padding: 22px;
}

.resource-detail-page__section-head {
  align-items: baseline;
  margin-bottom: 16px;
}

.resource-detail-page__section-head h2 {
  margin: 0;
  color: #0f172a;
}

.resource-detail-page__content-flow {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-detail-page__rich-text :deep(h2) {
  margin: 0 0 12px;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.35;
}

.resource-detail-page__rich-text :deep(h1) {
  margin: 0 0 14px;
  color: #0f172a;
  font-size: 28px;
  line-height: 1.2;
}

.resource-detail-page__rich-text :deep(h3) {
  margin: 0 0 12px;
  color: #0f172a;
  font-size: 18px;
  line-height: 1.4;
}

.resource-detail-page__rich-text :deep(blockquote) {
  margin: 0 0 12px;
  padding-left: 14px;
  border-left: 3px solid rgba(96, 165, 250, 0.34);
}

.resource-detail-page__rich-text :deep(ul),
.resource-detail-page__rich-text :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
}

.resource-detail-page__rich-text :deep(a) {
  color: #2563eb;
}

.resource-detail-page__rich-text :deep(pre) {
  margin: 0 0 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.92);
  overflow-x: auto;
}

.resource-detail-page__rich-text :deep(code) {
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
}

.resource-detail-page__rich-text :deep(pre code) {
  color: #e2e8f0;
}

.resource-detail-page__rich-text :deep(hr) {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.resource-detail-page__rich-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 14px;
}

.resource-detail-page__rich-text :deep(th),
.resource-detail-page__rich-text :deep(td) {
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  text-align: left;
}

.resource-detail-page__rich-text :deep(th) {
  color: #0f172a;
  background: rgba(239, 246, 255, 0.96);
}

.resource-detail-page__version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-detail-page__version-card {
  border-radius: 18px;
  padding: 18px;
}

.resource-detail-page__version-meta strong {
  color: #0f172a;
}

@media (max-width: 980px) {
  .resource-detail-page__lead {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .resource-detail-page__panel {
    padding: 18px;
  }

  .resource-detail-page__cover-card {
    min-height: 280px;
  }

  .resource-detail-page__version-headline {
    align-items: flex-start;
  }
}
</style>
