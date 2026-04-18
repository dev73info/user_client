<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { useRoute, useRouter } from 'vue-router'

import { HttpError, apiUrl } from '@/api/http'
import AppToast from '@/components/AppToast.vue'
import AuthModal from '@/components/AuthModal.vue'
import HomeHeroSection from '@/components/home/HomeHeroSection.vue'
import {
  getPublicMcResource,
  listPublicMcResourceVersions,
  downloadPublicMcResourceFile,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import { getTagRouteSlug, normalizeTagName, parseResourceIdFromSlug } from '@/api/resourceTags'
import { useAuthForm } from '@/composables/useAuthForm'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()
const DEV_PORTAL_URL = 'https://dev.73info.cn'

const loading = ref(false)
const resource = ref<PublicMcResourceItem | null>(null)
const versions = ref<PublicMcResourceVersionItem[]>([])
const menuOpen = ref(false)
const authVisible = ref(false)
const authMode = ref<'login' | 'register' | 'reset'>('login')
const githubLoginLoading = ref(false)

const {
  authUsername,
  authPassword,
  authEmail,
  authEmailCode,
  acceptTerms,
  sendCodeLoading,
  sendCodeCountdown,
  resetAuthForm,
  loginWithGithub: loginWithGithubAction,
  sendAuthCode,
  submitAuth: submitAuthAction,
  changeAuthMode,
} = useAuthForm(authMode)

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
const heroNavLinks = computed(() => {
  const catalogLink = currentRootSlug.value
    ? {
      name: 'resource-catalog',
      params: currentEntrySlug.value
        ? { rootSlug: currentRootSlug.value, entrySlug: currentEntrySlug.value }
        : { rootSlug: currentRootSlug.value },
    }
    : { name: 'home' as const }

  const links = [
    { label: '返回首页', to: { name: 'home' } },
    { label: '免费资源', to: catalogLink, active: true },
    { label: '开发者端', href: DEV_PORTAL_URL },
    { label: '探索', href: '#' },
    { label: '免费资源', href: '#' },
    { label: '社区', href: '#' },
  ]

  if (auth.isAuthed) {
    links.splice(2, 0, { label: '我的定制资源', to: { name: 'my-custom-resources' } })
  }

  return links
})
const authTitle = computed(() => {
  if (authMode.value === 'login') return '登录账号'
  if (authMode.value === 'register') return '注册账号'
  return '找回密码'
})
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

function openAuth(mode: 'login' | 'register' | 'reset') {
  authMode.value = mode
  resetAuthForm()
  authVisible.value = true
}

function closeAuth() {
  authVisible.value = false
}

async function handleLoginWithGithub() {
  if (githubLoginLoading.value || auth.loading) {
    return
  }

  githubLoginLoading.value = true
  try {
    await loginWithGithubAction()
  } finally {
    githubLoginLoading.value = false
  }
}

async function handleSubmitAuth() {
  const result = await submitAuthAction()
  if (result) {
    closeAuth()
  }
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
  auth.logout()
  closeUserMenu()
  showToast('已退出登录', 'info')
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
      window.location.href = '/'
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
  <main class="page-shell resource-homepage">
    <HomeHeroSection :isAuthed="auth.isAuthed" :username="auth.username" :menuOpen="menuOpen" :navLinks="heroNavLinks"
      @open-auth="openAuth" @toggle-user-menu="toggleUserMenu" @go-profile="goProfile" @logout="logout">
    </HomeHeroSection>

    <section class="resource-homepage__panel" v-loading="loading">
      <template v-if="resource">
        <section class="resource-homepage__lead">
          <div class="resource-homepage__cover-card">
            <img v-if="resource.cover_url" :src="resourceCoverUrl" :alt="resource.title"
              class="resource-homepage__cover-image" />
            <div v-else class="resource-homepage__cover-placeholder">📁
            </div>
          </div>

          <div class="resource-homepage__summary-card">
            <div class="resource-homepage__headline-row">
              <span class="resource-homepage__status-pill">{{ visibilityLabel }}</span>
              <span class="resource-homepage__author-pill">by {{ resource.author }}</span>
            </div>
            <p class="resource-homepage__meta">创建者：{{ resource.creator }}</p>
            <p class="resource-homepage__summary">{{ resource.description }}</p>

            <div v-if="tagNames.length > 0" class="resource-homepage__tags">
              <span v-for="item in tagNames" :key="item" class="resource-homepage__tag">{{ item }}</span>
            </div>

            <div class="resource-homepage__cta-row">
              <button class="resource-homepage__primary-btn" type="button" @click="openResourceFile">下载最新版本</button>
              <button class="resource-homepage__secondary-btn" type="button" @click="backToPlatform">继续浏览</button>
            </div>
          </div>
        </section>

        <section class="resource-homepage__stats-grid">
          <article v-for="item in infoCards" :key="item.label" class="resource-homepage__stat-card"
            :class="`resource-homepage__stat-card--${item.tone}`">
            <span class="resource-homepage__stat-label">{{ item.label }}</span>
            <strong class="resource-homepage__stat-value">{{ item.value }}</strong>
            <span class="resource-homepage__stat-hint">{{ item.hint }}</span>
          </article>
        </section>

        <section class="resource-homepage__detail-grid">
          <article class="resource-homepage__content-card">
            <header class="resource-homepage__section-head">
              <h2>页面内容</h2>
              <span>Content</span>
            </header>
            <div v-if="pageContentHtml" class="resource-homepage__content-flow resource-homepage__rich-text"
              v-html="pageContentHtml" />
            <p v-else class="resource-homepage__paragraph">
              当前还没有额外补充说明。后续更新、兼容性说明或使用建议会展示在这里。
            </p>
          </article>

          <article class="resource-homepage__content-card">
            <header class="resource-homepage__section-head">
              <h2>历史版本</h2>
              <span>Versions</span>
            </header>
            <div v-if="versions.length" class="resource-homepage__version-list">
              <article v-for="version in versions" :key="version.id" class="resource-homepage__version-card">
                <div class="resource-homepage__version-headline">
                  <div class="resource-homepage__version-meta">
                    <strong>{{ version.version }}</strong>
                    <span>{{ formatVersionTime(version.created_at) }}</span>
                  </div>
                  <button class="resource-homepage__version-download" type="button" @click="downloadVersion(version)">
                    下载
                  </button>
                </div>
                <p class="resource-homepage__paragraph">
                  {{ version.note || '当前版本暂无补充说明。' }}
                </p>
              </article>
            </div>
            <p v-else class="resource-homepage__paragraph">
              当前还没有可展示的历史版本。
            </p>
          </article>
        </section>
      </template>
    </section>

    <AuthModal :visible="authVisible" :authMode="authMode" :authTitle="authTitle" v-model:authUsername="authUsername"
      v-model:authPassword="authPassword" v-model:authEmail="authEmail" v-model:authEmailCode="authEmailCode"
      v-model:acceptTerms="acceptTerms" :authLoading="auth.loading" :githubLoginLoading="githubLoginLoading"
      :sendCodeLoading="sendCodeLoading" :sendCodeCountdown="sendCodeCountdown" @close="closeAuth"
      @submit="handleSubmitAuth" @loginWithGithub="handleLoginWithGithub" @sendAuthCode="sendAuthCode"
      @change-mode="changeAuthMode" />

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>

<style scoped>
.resource-homepage {
  gap: 28px;
}

.resource-homepage__hero-meta {
  align-items: stretch;
}

.resource-homepage__eyebrow {
  margin: 0 0 10px;
  color: #95d5b2;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.resource-homepage__hero-actions {
  min-width: 220px;
}

.resource-homepage__panel {
  border-radius: 28px;
  border: 1px solid var(--card-border);
  background: rgba(5, 18, 30, 0.5);
  backdrop-filter: blur(14px);
  padding: 24px;
}

.resource-homepage__lead {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.25fr);
  gap: 22px;
}

.resource-homepage__cover-card,
.resource-homepage__summary-card,
.resource-homepage__stat-card,
.resource-homepage__content-card {
  border-radius: 24px;
  border: 1px solid var(--card-border);
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(10px);
}

.resource-homepage__cover-card {
  min-height: 360px;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(255, 209, 102, 0.25), transparent 30%),
    linear-gradient(160deg, rgba(14, 165, 233, 0.24), rgba(5, 18, 30, 0.8));
}

.resource-homepage__cover-image,
.resource-homepage__cover-placeholder {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resource-homepage__cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(72px, 10vw, 120px);
}

.resource-homepage__summary-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-homepage__headline-row,
.resource-homepage__cta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-homepage__status-pill,
.resource-homepage__author-pill,
.resource-homepage__tag,
.resource-homepage__group-tags span {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 700;
}

.resource-homepage__status-pill {
  color: #ddffef;
  background: rgba(149, 213, 178, 0.18);
  border: 1px solid rgba(149, 213, 178, 0.34);
}

.resource-homepage__author-pill {
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.16);
  border: 1px solid rgba(96, 165, 250, 0.32);
}

.resource-homepage__meta,
.resource-homepage__summary,
.resource-homepage__paragraph,
.resource-homepage__link-card span {
  margin: 0;
  color: var(--text-sub);
  line-height: 1.8;
}

.resource-homepage__tags,
.resource-homepage__group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.resource-homepage__tag,
.resource-homepage__group-tags span {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.resource-homepage__primary-btn,
.resource-homepage__secondary-btn,
.resource-homepage__link-card {
  border-radius: 18px;
  min-height: 48px;
  padding: 0 18px;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease;
}

.resource-homepage__primary-btn:hover,
.resource-homepage__secondary-btn:hover,
.resource-homepage__link-card:hover {
  transform: translateY(-1px);
}

.resource-homepage__primary-btn {
  border: 0;
  color: #052238;
  background: #95d5b2;
  font-weight: 700;
}

.resource-homepage__primary-btn--full,
.resource-homepage__secondary-btn--full {
  width: 100%;
  justify-content: center;
}

.resource-homepage__secondary-btn {
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
  font-weight: 700;
}

.resource-homepage__stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.resource-homepage__stat-card {
  position: relative;
  overflow: hidden;
  flex: 1 1 220px;
  min-width: 0;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-radius: 18px;
}

.resource-homepage__stat-card--platform {
  background:
    linear-gradient(180deg, rgba(14, 165, 233, 0.13), rgba(255, 255, 255, 0.05)),
    rgba(255, 255, 255, 0.06);
}

.resource-homepage__stat-card--visibility {
  background:
    linear-gradient(180deg, rgba(149, 213, 178, 0.13), rgba(255, 255, 255, 0.05)),
    rgba(255, 255, 255, 0.06);
}

.resource-homepage__stat-card--versions {
  background:
    linear-gradient(180deg, rgba(255, 209, 102, 0.14), rgba(255, 255, 255, 0.05)),
    rgba(255, 255, 255, 0.06);
}

.resource-homepage__stat-card--updated {
  background:
    linear-gradient(180deg, rgba(96, 165, 250, 0.14), rgba(255, 255, 255, 0.05)),
    rgba(255, 255, 255, 0.06);
}

.resource-homepage__stat-label,
.resource-homepage__stat-hint,
.resource-homepage__section-head span {
  color: var(--text-sub);
  font-size: 12px;
}

.resource-homepage__stat-value {
  font-size: clamp(15px, 1.35vw, 18px);
  line-height: 1.2;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resource-homepage__stat-hint {
  max-width: 14ch;
  line-height: 1.2;
  opacity: 0.88;
  text-align: right;
}

.resource-homepage__detail-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.resource-homepage__content-card {
  padding: 22px;
}

.resource-homepage__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.resource-homepage__section-head h2,
.resource-homepage__group-item h3 {
  margin: 0;
  color: var(--text-main);
}

.resource-homepage__paragraph--muted {
  margin-top: 12px;
  opacity: 0.78;
}

.resource-homepage__content-flow {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-homepage__rich-text :deep(h2) {
  margin: 0 0 12px;
  color: var(--text-main);
  font-size: 22px;
  line-height: 1.35;
}

.resource-homepage__rich-text :deep(h1) {
  margin: 0 0 14px;
  color: var(--text-main);
  font-size: 28px;
  line-height: 1.2;
}

.resource-homepage__rich-text :deep(h3) {
  margin: 0 0 12px;
  color: var(--text-main);
  font-size: 18px;
  line-height: 1.4;
}

.resource-homepage__rich-text :deep(p) {
  margin: 0 0 12px;
  color: var(--text-sub);
  line-height: 1.8;
}

.resource-homepage__rich-text :deep(blockquote) {
  margin: 0 0 12px;
  padding-left: 14px;
  border-left: 3px solid rgba(149, 213, 178, 0.34);
  color: var(--text-sub);
}

.resource-homepage__rich-text :deep(ul),
.resource-homepage__rich-text :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
  color: var(--text-sub);
}

.resource-homepage__rich-text :deep(a) {
  color: #95d5b2;
}

.resource-homepage__rich-text :deep(pre) {
  margin: 0 0 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(5, 18, 30, 0.86);
  overflow-x: auto;
}

.resource-homepage__rich-text :deep(code) {
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
}

.resource-homepage__rich-text :deep(pre code) {
  color: #e2e8f0;
}

.resource-homepage__rich-text :deep(hr) {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.resource-homepage__rich-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 14px;
}

.resource-homepage__rich-text :deep(th),
.resource-homepage__rich-text :deep(td) {
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  text-align: left;
  color: var(--text-sub);
}

.resource-homepage__rich-text :deep(th) {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
}

.resource-homepage__group-list,
.resource-homepage__link-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.resource-homepage__version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-homepage__version-card {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  padding: 18px;
}

.resource-homepage__version-headline,
.resource-homepage__version-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-homepage__version-meta strong {
  color: var(--text-main);
}

.resource-homepage__version-meta span {
  color: var(--text-sub);
  font-size: 13px;
}

.resource-homepage__version-download {
  border: 0;
  border-radius: 14px;
  min-height: 42px;
  padding: 0 16px;
  color: #052238;
  background: #95d5b2;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}

.resource-homepage__version-download:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(149, 213, 178, 0.22);
}

.resource-homepage__group-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

@media (max-width: 980px) {

  .resource-homepage__lead,
  .resource-homepage__detail-grid {
    grid-template-columns: 1fr;
  }

  .resource-homepage__stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .resource-homepage__stat-card {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .resource-homepage__stat-hint {
    max-width: none;
    text-align: left;
  }
}

@media (max-width: 640px) {
  .resource-homepage__panel {
    padding: 18px;
  }

  .resource-homepage__cover-card {
    min-height: 280px;
  }

  .resource-homepage__stats-grid {
    display: grid;
    grid-template-columns: 1fr;
  }

  .resource-homepage__version-headline {
    align-items: flex-start;
  }
}
</style>
