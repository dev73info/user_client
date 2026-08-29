<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { common, createLowlight } from 'lowlight'
import { useRoute, useRouter } from 'vue-router'

import { HttpError, apiUrl } from '@/api/http'
import {
  createPublicMcResourceComment,
  downloadPublicMcResourceVersionFile,
  extractResourceFileNameFromUrl,
  getPublicMcResource,
  invalidateResourceListCache,
  likePublicMcResource,
  listPublicMcResourceComments,
  listPublicMcResourceVersions,
  unlikePublicMcResource,
  with73Extension,
  type DownloadProgress,
  type PublicMcResourceCommentItem,
  type PublicMcResourceItem,
  type PublicMcResourceVersionItem,
} from '@/api/resources'
import {
  getResourceDetailSlug,
  getTagRouteSlug,
  normalizeTagName,
  parseResourceIdFromSlug,
} from '@/api/resourceTags'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'
import { useToast } from '@/composables/useToast'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'

type CommentGate = {
  title: string
  description: string
  actionLabel: string
  action: 'login' | 'realname' | ''
}

const COMMENT_MAX_LENGTH = 300

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const downloadStore = useDownloadStore()
const { showToast } = useToast()

const loading = ref(false)
const resource = ref<PublicMcResourceItem | null>(null)
const versions = ref<PublicMcResourceVersionItem[]>([])
const expandedVersionIds = ref<number[]>([])
function isVersionNoteExpanded(versionId: number): boolean {
  return expandedVersionIds.value.includes(versionId)
}
function toggleVersionNote(versionId: number) {
  const index = expandedVersionIds.value.indexOf(versionId)
  if (index >= 0) {
    expandedVersionIds.value.splice(index, 1)
  } else {
    expandedVersionIds.value.push(versionId)
  }
}
const comments = ref<PublicMcResourceCommentItem[]>([])
const commentsLoading = ref(false)
const commentSubmitting = ref(false)
const commentText = ref('')
const likeSubmitting = ref(false)
const pageContentRef = ref<HTMLElement | null>(null)

const tagNames = computed(
  () => resource.value?.tag_selections.flatMap((item) => item.tag_names) ?? [],
)
useCodeBlockCopy({
  rootRef: pageContentRef,
  notify: showToast,
})
const authorPillParts = computed(() => {
  const current = resource.value
  if (!current) {
    return { prefix: '', name: '' }
  }

  const author = current.author.trim()
  const creator = current.creator.trim()

  // 团队资源：显示"团队名称-作者"，团队名（前缀）不带炫彩
  if (current.ownership_type === 'team' && current.team_name) {
    if (author) {
      return { prefix: `${current.team_name} -`, name: author }
    }
    return { prefix: current.team_name, name: '' }
  }

  // 个人资源：保持原有逻辑，只有用户名带炫彩
  if (author && creator && author === creator) {
    return { prefix: '作者 / 开发者', name: author }
  }

  if (author) {
    return { prefix: '作者', name: author }
  }
  return { prefix: '作者未知', name: '' }
})
const showCreatorMeta = computed(() => {
  const current = resource.value
  if (!current) {
    return false
  }

  return current.creator.trim().length > 0 && current.creator.trim() !== current.author.trim()
})
const resourceSummaryText = computed(() => {
  const current = resource.value
  if (!current) {
    return ''
  }

  const description = current.description.trim()
  const platform = current.platform.trim()
  if (!description || !platform) {
    return description
  }

  const prefixPattern = new RegExp(`^${escapeRegExp(platform)}\\s*[·・-]\\s*`, 'i')
  return description.replace(prefixPattern, '').trim() || description
})
const visibilityLabel = computed(() =>
  resource.value?.visibility === 'published' ? '公开展示中' : '待正式发布',
)
const isRepost = computed(() => resource.value?.origin_type === 'repost')
const originTypeLabel = computed(() =>
  resource.value?.origin_type === 'repost' ? '转载' : '原创',
)
const repostOriginLabel = computed(() => {
  const current = resource.value
  if (!current || current.origin_type !== 'repost') {
    return ''
  }
  const parts: string[] = []
  if (current.origin_org) {
    parts.push(`转载自 ${current.origin_org}`)
  }
  if (current.origin_author) {
    parts.push(`原作者 ${current.origin_author}`)
  }
  return parts.join(' · ')
})
const currentRootSlug = computed(() => {
  const raw = route.params.rootSlug
  return typeof raw === 'string' ? raw.trim() : ''
})
const currentEntrySlug = computed(() => {
  const raw = route.params.entrySlug
  return typeof raw === 'string' ? raw.trim() : ''
})
const resourceRootName = computed(() => {
  const rootName = resource.value?.tag_selections.find((item) => item.group_path.length > 0)
    ?.group_path[0]
  return normalizeTagName(rootName || '')
})
const resourceRootAlias = computed(() => {
  return (
    resource.value?.tag_selections.find((item) => (item.group_path_aliases?.length ?? 0) > 0)
      ?.group_path_aliases?.[0] ?? ''
  )
})
const resourceEntryAlias = computed(() => {
  return (
    resource.value?.tag_selections.find((item) => (item.group_path_aliases?.length ?? 0) > 1)
      ?.group_path_aliases?.[1] ?? ''
  )
})
const infoCards = computed(() => {
  if (!resource.value) {
    return []
  }

  return [
    {
      label: '当前版本',
      value: latestVersion.value?.version ?? '暂无',
      tone: 'current-version',
    },
    {
      label: '历史版本',
      value: `${versions.value.length}`,
      tone: 'versions',
    },
    {
      label: '最近更新',
      value: formatUpdatedDate(resource.value.updated_at),
      tone: 'updated',
    },
  ]
})
const resourceCoverUrl = computed(() =>
  resource.value?.cover_url ? apiUrl(resource.value.cover_url) : '',
)
const latestVersion = computed(() => versions.value[0] ?? null)
const pageContentHtml = computed(() => formatHomepageContent(resource.value?.release_note || ''))
const isPublishedResource = computed(() => resource.value?.visibility === 'published')
const commentTextLength = computed(() => Array.from(commentText.value.trim()).length)
const commentCountLabel = computed(() =>
  comments.value.length > 0 ? `${comments.value.length} 条评论` : '暂无评论',
)
const canSubmitComment = computed(
  () =>
    auth.isAuthed &&
    isPublishedResource.value &&
    commentText.value.trim().length > 0 &&
    commentTextLength.value <= COMMENT_MAX_LENGTH &&
    !commentSubmitting.value,
)
const commentGate = computed<CommentGate | null>(() => {
  if (resource.value && !isPublishedResource.value) {
    return {
      title: '资源发布后可评论',
      description: '当前资源还未公开发布，评论区会在发布后开放。',
      actionLabel: '',
      action: '',
    }
  }

  if (!auth.isAuthed) {
    return {
      title: '登录后可评论',
      description: '登录并通过实名认证后，可以在这里留下资源使用反馈。',
      actionLabel: '登录',
      action: 'login',
    }
  }

  return null
})

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
markdownRenderer.enable(['table'])

const codeHighlighter = createLowlight(common)

type HastNode =
  | { type: 'text'; value: string }
  | { type: 'element'; tagName: string; properties?: { className?: string[] }; children: HastNode[] }
  | { type: 'root'; children: HastNode[] }

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function hastToHtml(node: HastNode): string {
  if (node.type === 'text') {
    return escapeHtmlText(node.value)
  }
  if (node.type === 'root') {
    return node.children.map(hastToHtml).join('')
  }
  const classAttr = node.properties?.className?.length
    ? ` class="${node.properties.className.join(' ')}"`
    : ''
  const children = node.children.map(hastToHtml).join('')
  return `<${node.tagName}${classAttr}>${children}</${node.tagName}>`
}

// 让只读富文本中的代码块与编辑器保持一致：按语言重新高亮并补充 code-block 类。
function highlightRichCodeBlocks(html: string): string {
  if (!html) {
    return html
  }
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll<HTMLElement>('pre > code').forEach((codeElement) => {
    const preElement = codeElement.parentElement
    if (!preElement) {
      return
    }
    preElement.classList.add('code-block')
    const codeText = codeElement.textContent ?? ''
    if (!codeText.trim()) {
      return
    }
    const languageClass = Array.from(codeElement.classList).find((item) =>
      /^language-[a-z0-9_-]+$/i.test(item),
    )
    const language = languageClass ? languageClass.slice('language-'.length) : undefined
    try {
      const registered =
        language && codeHighlighter.listLanguages().includes(language.toLowerCase())
      const root = registered
        ? codeHighlighter.highlight(language!.toLowerCase(), codeText)
        : codeHighlighter.highlightAuto(codeText)
      const children = (root as { children?: HastNode[] }).children ?? []
      const detectedLanguage = registered
        ? language!.toLowerCase()
        : ((root as { data?: { language?: string } }).data?.language ?? undefined)
      // 未识别出语言时（例如纯中文文本），保留原始内容，仅应用代码块外观，避免内容被清空
      if (children.length === 0 || !detectedLanguage) {
        return
      }
      codeElement.innerHTML = hastToHtml(root as HastNode)
      codeElement.classList.add('hljs')
      codeElement.classList.add(`language-${detectedLanguage}`)
    } catch {
      // 单个代码块高亮失败时保留原始内容
    }
  })
  return template.innerHTML
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 把富文本表格包进可横向滚动的容器，避免移动端列被压得很窄导致文字竖排。
function wrapRichTables(html: string): string {
  if (!html) {
    return html
  }
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('table').forEach((table) => {
    const wrap = document.createElement('div')
    wrap.className = 'rich-table-scroll'
    table.parentNode?.insertBefore(wrap, table)
    wrap.appendChild(table)
  })
  return template.innerHTML
}

function formatHomepageContent(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const rendered = /<\/?[a-z][\s\S]*>/i.test(trimmed)
    ? sanitizeRichHtml(trimmed)
    : sanitizeRichHtml(markdownRenderer.render(trimmed))

  return wrapRichTables(highlightRichCodeBlocks(rendered))
}

function backToPlatform() {
  const fallbackRootSlug = resourceRootAlias.value || getTagRouteSlug(resourceRootName.value)
  const fallbackEntrySlug =
    resourceEntryAlias.value || getTagRouteSlug(resource.value?.platform ?? '')
  router.push({
    name: 'resource-catalog',
    params: {
      rootSlug: currentRootSlug.value || fallbackRootSlug,
      entrySlug: currentEntrySlug.value || fallbackEntrySlug,
    },
  })
}

function getCurrentResourceId(): number | null {
  const resourceSlug = String(route.params.resourceSlug ?? '')
  return parseResourceIdFromSlug(resourceSlug) || null
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

async function triggerDownload(
  run: (onProgress: (progress: DownloadProgress) => void) => Promise<{ blob: Blob; fileName: string }>,
  fileName: string,
) {
  const downloadFileName = with73Extension(fileName)
  downloadStore.start(downloadFileName)
  try {
    const { blob, fileName: resolvedFileName } = await run((progress) => {
      // 注意：这里不能用 resolvedFileName（它在 await 完成前处于 TDZ），
      // 必须使用外层已初始化的 fileName。
      downloadStore.progress(progress.percent, progress.loaded, progress.total)
    })

    const objectUrl = URL.createObjectURL(blob)
    try {
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = with73Extension(resolvedFileName)
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
  } finally {
    downloadStore.finish()
  }
}

async function openResourceFile() {
  if (!latestVersion.value?.resource) {
    showToast('当前还没有可下载的历史版本', 'info')
    return
  }

  const fileName = extractResourceFileNameFromUrl(
    latestVersion.value.resource,
    resource.value?.file_name || 'download',
  )
  const resourceId = resource.value?.id
  if (resourceId == null) {
    showToast('资源编号无效', 'warning')
    return
  }
  try {
    await triggerDownload(
      (onProgress) =>
        downloadPublicMcResourceVersionFile(
          resourceId,
          latestVersion.value!.id,
          auth.token?.trim() || null,
          onProgress,
        ),
      fileName,
    )
  } catch (error) {
    showToast(error instanceof Error ? error.message : '下载资源失败', 'warning')
  }
}

async function downloadVersion(version: PublicMcResourceVersionItem) {
  const fileName = extractResourceFileNameFromUrl(
    version.resource,
    resource.value?.file_name || 'download',
  )
  const resourceId = resource.value?.id
  if (resourceId == null) {
    showToast('资源编号无效', 'warning')
    return
  }
  try {
    await triggerDownload(
      (onProgress) =>
        downloadPublicMcResourceVersionFile(
          resourceId,
          version.id,
          auth.token?.trim() || null,
          onProgress,
        ),
      fileName,
    )
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

function getCommenterInitial(value: string): string {
  return Array.from(value.trim())[0]?.toUpperCase() || '用'
}

async function loadComments(resourceId: number) {
  commentsLoading.value = true
  try {
    const token = auth.token?.trim() ? auth.token : null
    comments.value = await listPublicMcResourceComments(resourceId, token)
  } catch (error) {
    comments.value = []
    showToast(error instanceof Error ? error.message : '加载资源评论失败', 'warning')
  } finally {
    commentsLoading.value = false
  }
}

function openCommentLogin() {
  showToast('请先登录后再发表评论', 'info')
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
}

function openLikeLogin() {
  showToast('请先登录后再点赞', 'info')
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
}

async function refreshResourceLikeState(resourceId: number) {
  try {
    const token = auth.token?.trim() ? auth.token : null
    resource.value = await getPublicMcResource(resourceId, token)
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
    }
  }
}

async function toggleResourceLike() {
  if (likeSubmitting.value) {
    return
  }

  const current = resource.value
  if (!current) {
    showToast('资源编号无效', 'warning')
    return
  }

  if (!isPublishedResource.value) {
    showToast('资源公开发布后才可点赞', 'warning')
    return
  }

  if (!auth.isAuthed || !auth.token.trim()) {
    openLikeLogin()
    return
  }

  likeSubmitting.value = true
  try {
    const state = current.liked_by_me
      ? await unlikePublicMcResource(auth.token, current.id)
      : await likePublicMcResource(auth.token, current.id)
    resource.value = {
      ...current,
      liked_by_me: state.liked_by_me,
      like_count: state.like_count,
    }
    invalidateResourceListCache()
    showToast(state.liked_by_me ? '已点赞' : '已取消点赞', 'success')
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
      openLikeLogin()
    } else {
      showToast(error instanceof Error ? error.message : '点赞操作失败', 'error')
    }
  } finally {
    likeSubmitting.value = false
  }
}

function openRealnamePage() {
  void router.push({ name: 'workbench-realname', query: { redirect_to: route.fullPath } })
}

function handleCommentGateAction() {
  if (!commentGate.value || !commentGate.value.action) {
    return
  }

  if (commentGate.value.action === 'login') {
    openCommentLogin()
    return
  }

  openRealnamePage()
}

async function submitResourceComment() {
  if (commentSubmitting.value) {
    return
  }

  const resourceId = resource.value?.id ?? getCurrentResourceId()
  if (!resourceId) {
    showToast('资源编号无效', 'warning')
    return
  }

  if (!isPublishedResource.value) {
    showToast('资源公开发布后才可评论', 'warning')
    return
  }

  if (!auth.isAuthed || !auth.token.trim()) {
    openCommentLogin()
    return
  }

  const comment = commentText.value.trim()
  const commentLength = Array.from(comment).length
  if (!comment) {
    showToast('请输入评论内容', 'warning')
    return
  }
  if (commentLength > COMMENT_MAX_LENGTH) {
    showToast(`评论不能超过 ${COMMENT_MAX_LENGTH} 字`, 'warning')
    return
  }

  commentSubmitting.value = true
  try {
    const saved = await createPublicMcResourceComment(auth.token, resourceId, { comment })
    comments.value = [
      saved,
      ...comments.value.filter((item) => item.id !== saved.id),
    ]
    commentText.value = ''
    showToast('评论已发布', 'success')
    void loadComments(resourceId)
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      showToast('请先完成实名认证后再发表评论', 'warning')
      openRealnamePage()
    } else {
      showToast(error instanceof Error ? error.message : '评论提交失败', 'error')
    }
  } finally {
    commentSubmitting.value = false
  }
}

async function loadResource() {
  const resourceId = getCurrentResourceId()
  if (!resourceId) {
    showToast('资源编号无效', 'warning')
    router.replace({ name: 'home' })
    return
  }

  loading.value = true
  comments.value = []
  commentText.value = ''
  try {
    const token = auth.token?.trim() ? auth.token : null
    const [resourceDetail, resourceVersions] = await Promise.all([
      getPublicMcResource(resourceId, token),
      listPublicMcResourceVersions(resourceId, token),
    ])
    resource.value = resourceDetail
    versions.value = resourceVersions
    void loadComments(resourceId)
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

onBeforeUnmount(() => {
  resetSeoMeta()
})

watch(
  () => route.params.resourceSlug,
  () => {
    void loadResource()
  },
)

watch(
  () => auth.token,
  () => {
    if (resource.value?.id) {
      void loadComments(resource.value.id)
      void refreshResourceLikeState(resource.value.id)
    }
  },
)

watch(
  resource,
  (current) => {
    if (!current) {
      return
    }

    setSeoMeta({
      title: `${current.title} - 73Info 资源`,
      description: current.description || current.release_note || '73Info 平台公开资源详情。',
      path: `/resources/${getResourceDetailSlug(current.id, current.creator || current.author)}`,
    })
  },
)
</script>

<template>
  <main class="portal-page resource-detail-page">
    <section class="resource-detail-page__panel" v-loading="loading">
      <template v-if="resource">
        <section class="resource-detail-page__lead">
          <div class="resource-detail-page__left-stack">
            <div class="resource-detail-page__cover-card">
              <img v-if="resource.cover_url" :src="resourceCoverUrl" :alt="resource.title"
                class="resource-detail-page__cover-image" />
              <div v-else class="resource-detail-page__cover-placeholder">📁</div>
            </div>

            <div class="resource-detail-page__summary-card">
              <div class="resource-detail-page__headline-row">
                <div class="resource-detail-page__headline-left">
                  <span class="resource-detail-page__status-pill">{{ visibilityLabel }}</span>
                  <span class="resource-detail-page__repost-badge"
                    :class="{ 'is-repost': isRepost }">{{ originTypeLabel }}</span>
                </div>
                <span class="resource-detail-page__headline-right">
                  <router-link
                    v-if="resource.author"
                    :to="{ name: 'dev-profile', params: { username: resource.author } }"
                    class="resource-detail-page__author-pill resource-detail-page__author-pill--link"
                  >
                    <span class="resource-detail-page__author-pill-label">{{ authorPillParts.prefix }}</span><span v-if="authorPillParts.name" :class="{ 'username-gradient': resource.author_username_gradient && !resource.author_username_color }" :style="resource.author_username_color ? { color: resource.author_username_color } : {}">{{ authorPillParts.name }}</span>
                  </router-link>
                  <span v-else class="resource-detail-page__author-pill">
                    <span class="resource-detail-page__author-pill-label">{{ authorPillParts.prefix }}</span><span v-if="authorPillParts.name" :class="{ 'username-gradient': resource.author_username_gradient && !resource.author_username_color }" :style="resource.author_username_color ? { color: resource.author_username_color } : {}">{{ authorPillParts.name }}</span>
                  </span>
                  <p v-if="showCreatorMeta" class="resource-detail-page__meta resource-detail-page__meta--aside">
                    <span class="resource-detail-page__meta-label--green">开发者：</span><router-link
                      v-if="resource.creator"
                      :to="{ name: 'dev-profile', params: { username: resource.creator } }"
                      :class="{ 'username-gradient': resource.creator_username_gradient && !resource.creator_username_color }"
                      :style="resource.creator_username_color ? { color: resource.creator_username_color } : {}"
                    >{{ resource.creator }}</router-link>
                    <span v-else :class="{ 'username-gradient': resource.creator_username_gradient && !resource.creator_username_color }" :style="resource.creator_username_color ? { color: resource.creator_username_color } : {}">{{ resource.creator }}</span>
                  </p>
                </span>
              </div>
            <div class="resource-detail-page__identity-block">
              <h1 class="resource-detail-page__title">{{ resource.title }}</h1>
              <div v-if="isRepost" class="resource-detail-page__repost-meta">
                <a v-if="resource.origin_url" :href="resource.origin_url" target="_blank"
                  rel="nofollow noopener" class="resource-detail-page__repost-origin">
                  {{ repostOriginLabel || '查看原始出处' }}
                </a>
                <span v-else class="resource-detail-page__repost-origin">{{ repostOriginLabel }}</span>
              </div>
              <p class="resource-detail-page__summary">
                {{ resourceSummaryText || '当前资源暂无简介。' }}
              </p>
            </div>

            <div v-if="tagNames.length > 0" class="resource-detail-page__tags">
              <span v-for="item in tagNames" :key="item" class="resource-detail-page__tag">{{
                item
              }}</span>
            </div>

            <div class="resource-detail-page__cta-row">
              <div class="resource-detail-page__primary-actions">
                <button class="resource-detail-page__primary-btn" type="button"
                  :disabled="downloadStore.state.active" @click="openResourceFile">
                  {{ downloadStore.state.active ? '下载中...' : '下载最新版本' }}
                </button>
                <div v-if="downloadStore.state.active" class="resource-detail-page__download-progress"
                  role="progressbar" :aria-valuenow="downloadStore.state.percent" aria-valuemin="0"
                  aria-valuemax="100">
                  <div class="resource-detail-page__download-progress__track">
                    <div class="resource-detail-page__download-progress__bar"
                      :style="{ width: `${downloadStore.state.percent}%` }"></div>
                  </div>
                  <span class="resource-detail-page__download-progress__label">
                    {{ downloadStore.state.percent }}%
                  </span>
                </div>
                <button class="resource-detail-page__like-btn" type="button"
                  :class="{ 'resource-detail-page__like-btn--active': resource.liked_by_me }" :disabled="likeSubmitting"
                  :aria-pressed="resource.liked_by_me" @click="toggleResourceLike">
                  <span aria-hidden="true">{{ resource.liked_by_me ? '♥' : '♡' }}</span>
                  <span>{{ resource.liked_by_me ? '已点赞' : '点赞' }}</span>
                  <strong>{{ resource.like_count ?? 0 }}</strong>
                </button>
                <ShareCardGenerator v-if="auth.isAuthed" share-type="resource" :target-id="String(resource.id)" />
              </div>
              <button class="resource-detail-page__secondary-btn" type="button" @click="backToPlatform">
                继续浏览
              </button>
            </div>
            </div>
          </div>

          <article class="resource-detail-page__content-card resource-detail-page__versions-side-card">
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
                </div>
                <button v-if="version.note" class="resource-detail-page__version-note-toggle" type="button"
                  @click="toggleVersionNote(version.id)">
                  {{ isVersionNoteExpanded(version.id) ? '收起' : '展开' }}
                </button>
                <div class="resource-detail-page__version-note-wrap">
                  <p v-if="version.note" class="resource-detail-page__version-note"
                    :class="{ 'is-collapsed': !isVersionNoteExpanded(version.id) }"
                    v-html="formatHomepageContent(version.note)"></p>
                  <p v-else class="resource-detail-page__paragraph">当前版本暂无补充说明。</p>
                </div>
                <div class="resource-detail-page__version-actions">
                  <button class="resource-detail-page__version-download" type="button"
                    :disabled="downloadStore.state.active" @click="downloadVersion(version)">
                    {{ downloadStore.state.active && downloadStore.state.fileName === with73Extension(extractResourceFileNameFromUrl(version.resource, resource.file_name || 'download')) ? `下载中 ${downloadStore.state.percent}%` : '下载' }}
                  </button>
                </div>
              </article>
            </div>
            <p v-else class="resource-detail-page__paragraph">当前还没有可展示的历史版本。</p>
          </article>
        </section>

        <section class="resource-detail-page__detail-grid">
          <article class="resource-detail-page__content-card">
            <header class="resource-detail-page__section-head">
              <h2>页面内容</h2>
              <span>Content</span>
            </header>
            <div v-if="pageContentHtml" ref="pageContentRef"
              class="resource-detail-page__content-flow resource-detail-page__rich-text" v-html="pageContentHtml" />
            <p v-else class="resource-detail-page__paragraph">
              当前还没有额外补充说明。后续更新、兼容性说明或使用建议会展示在这里。
            </p>
          </article>

          <article class="resource-detail-page__content-card resource-detail-page__comments-card">
            <header class="resource-detail-page__section-head">
              <h2>资源评论</h2>
              <span>{{ commentCountLabel }}</span>
            </header>

            <section class="resource-detail-page__comment-composer">
              <div v-if="commentGate" class="resource-detail-page__comment-gate">
                <div>
                  <strong>{{ commentGate.title }}</strong>
                  <p>{{ commentGate.description }}</p>
                </div>
                <button v-if="commentGate.actionLabel" class="resource-detail-page__comment-action" type="button"
                  @click="handleCommentGateAction">
                  {{ commentGate.actionLabel }}
                </button>
              </div>
              <form v-else class="resource-detail-page__comment-form" @submit.prevent="submitResourceComment">
                <textarea v-model="commentText" class="resource-detail-page__comment-input" rows="4" maxlength="300"
                  placeholder="写下你对这个资源的使用体验、兼容性补充或改进建议"></textarea>
                <div class="resource-detail-page__comment-toolbar">
                  <span class="resource-detail-page__comment-count"
                    :class="{ danger: commentTextLength > COMMENT_MAX_LENGTH }">
                    {{ commentTextLength }} / {{ COMMENT_MAX_LENGTH }}
                  </span>
                  <button class="resource-detail-page__comment-submit" type="submit" :disabled="!canSubmitComment">
                    {{ commentSubmitting ? '发布中...' : '发布评论' }}
                  </button>
                </div>
              </form>
            </section>

            <div class="resource-detail-page__comment-list" v-loading="commentsLoading">
              <article v-for="comment in comments" :key="comment.id" class="resource-detail-page__comment-item"
                :class="{ mine: auth.username && comment.commenter === auth.username }">
                <div class="resource-detail-page__comment-avatar">
                  {{ getCommenterInitial(comment.commenter) }}
                </div>
                <div class="resource-detail-page__comment-body">
                  <div class="resource-detail-page__comment-meta">
                    <strong :class="{ 'username-gradient': comment.commenter_username_gradient && !comment.commenter_username_color }" :style="comment.commenter_username_color ? { color: comment.commenter_username_color } : {}">{{ comment.commenter }}</strong>
                    <span>{{ formatVersionTime(comment.updated_at) }}</span>
                  </div>
                  <p>{{ comment.comment_text }}</p>
                </div>
              </article>
              <p v-if="!commentsLoading && comments.length === 0" class="resource-detail-page__paragraph">
                暂时还没有评论。
              </p>
            </div>
          </article>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.resource-detail-page {
  width: min(1280px, calc(100% - 24px));
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

.resource-detail-page__left-stack {
  grid-column: 1;
  grid-row: 1 / span 2;
  min-width: 0;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(248, 250, 252, 0.92);
}

.resource-detail-page__cover-card {
  aspect-ratio: 1.618;
  min-height: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
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
  gap: 18px;
  border: 0;
  border-radius: 0;
  border-top: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.98);
}

.resource-detail-page__versions-side-card {
  grid-column: 2;
  grid-row: 1 / span 2;
  min-width: 0;
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
  gap: 6px;
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

.resource-detail-page__author-pill--link {
  text-decoration: none;
  cursor: pointer;
  transition: background 0.18s ease;
}

.resource-detail-page__author-pill--link:hover {
  background: rgba(191, 219, 254, 0.95);
}

.resource-detail-page__headline-right {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__meta--aside {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  background: rgba(241, 245, 249, 0.92);
}

.resource-detail-page__meta-label--green {
  color: #16a34a;
}

.resource-detail-page__meta--aside a {
  color: #64748b;
  text-decoration: none;
  transition: color 0.18s ease;
}

.resource-detail-page__meta--aside a:hover {
  color: #1d4ed8;
}

.resource-detail-page__identity-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.resource-detail-page__title {
  margin: 0;
  color: #0f172a;
  font-size: clamp(28px, 3.2vw, 42px);
  line-height: 1.12;
  font-weight: 900;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.resource-detail-page__repost-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.resource-detail-page__headline-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.resource-detail-page__repost-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
}

.resource-detail-page__repost-badge.is-repost {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.resource-detail-page__repost-origin {
  color: #6366f1;
  font-size: 13px;
  overflow-wrap: anywhere;
  text-decoration: none;
}

a.resource-detail-page__repost-origin:hover {
  text-decoration: underline;
}

.resource-detail-page__meta,
.resource-detail-page__summary,
.resource-detail-page__paragraph,
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

.resource-detail-page__summary {
  max-width: 62ch;
  font-size: 15px;
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

.resource-detail-page__summary-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 2px;
}

.resource-detail-page__summary-stat {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(219, 229, 247, 0.78);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.86));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.resource-detail-page__summary-stat strong {
  color: #0f172a;
  font-size: 24px;
  line-height: 1.2;
}

.resource-detail-page__summary-stat span {
  color: #475569;
  font-size: 13px;
  font-weight: 800;
}

.resource-detail-page__primary-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.resource-detail-page__cta-row {
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid rgba(219, 229, 247, 0.82);
}

.resource-detail-page__primary-btn,
.resource-detail-page__like-btn,
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
.resource-detail-page__like-btn:hover,
.resource-detail-page__secondary-btn:hover,
.resource-detail-page__version-download:hover {
  transform: translateY(-1px);
}

.resource-detail-page__primary-btn {
  border: 0;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  font-weight: 700;
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.2);
}

.resource-detail-page__primary-btn:disabled {
  cursor: wait;
  opacity: 0.78;
}

.resource-detail-page__download-progress {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(219, 229, 247, 0.82);
}

.resource-detail-page__download-progress__track {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: rgba(219, 229, 247, 0.9);
  overflow: hidden;
}

.resource-detail-page__download-progress__bar {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #2563eb, #4f8cff);
  transition: width 120ms linear;
}

.resource-detail-page__download-progress__label {
  flex: 0 0 auto;
  min-width: 42px;
  text-align: right;
  font-size: 13px;
  font-weight: 800;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
}

.resource-detail-page__secondary-btn,
.resource-detail-page__version-download {
  color: #1d4ed8;
  background: rgba(239, 246, 255, 0.9);
  font-weight: 700;
}

.resource-detail-page__version-download {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 13px;
}

.resource-detail-page__like-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #64748b;
  background: rgba(248, 250, 252, 0.96);
  font-weight: 800;
  border: 1px solid rgba(219, 229, 247, 0.82);
}

.resource-detail-page__like-btn strong {
  color: inherit;
  font-size: 13px;
}

.resource-detail-page__like-btn--active {
  color: #dc2626;
  background: rgba(254, 226, 226, 0.94);
  border-color: rgba(248, 113, 113, 0.38);
}

.resource-detail-page__like-btn:disabled {
  cursor: wait;
  opacity: 0.72;
}

.resource-detail-page__primary-actions :deep(.share-card-generator__start) {
  min-height: 44px;
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.9);
  box-shadow: none;
}

.resource-detail-page__primary-actions :deep(.share-card-generator__start:hover:not(:disabled)) {
  background: #fff;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.12);
}

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
  flex-wrap: wrap;
  gap: 16px;
}

/* 文本块级元素占满整行；行内媒体（如 badge 图片）可并排同行 */
.resource-detail-page__rich-text :deep(p),
.resource-detail-page__rich-text :deep(h2),
.resource-detail-page__rich-text :deep(h3),
.resource-detail-page__rich-text :deep(h4),
.resource-detail-page__rich-text :deep(ul),
.resource-detail-page__rich-text :deep(ol),
.resource-detail-page__rich-text :deep(blockquote),
.resource-detail-page__rich-text :deep(pre),
.resource-detail-page__rich-text :deep(hr),
.resource-detail-page__rich-text :deep(table) {
  flex: 0 0 100%;
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

.resource-detail-page__rich-text :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  margin: 12px 0;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 14px;
  background: #f8fafc;
}

.resource-detail-page__rich-text :deep(.rich-editor-image) {
  display: inline-block;
  vertical-align: middle;
  height: auto;
}

.resource-detail-page__rich-text :deep(img) {
  display: inline-block;
  vertical-align: middle;
  max-width: 100%;
  height: auto;
}

.resource-detail-page__rich-text :deep(.rich-editor-video) {
  width: 100%;
  min-height: 220px;
}

.resource-detail-page__rich-text :deep(.rich-editor-attachment) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin: 10px 0;
  padding: 9px 12px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 800;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.resource-detail-page__rich-text :deep(pre) {
  --rich-code-accent: #64748b;
  --rich-code-label: 'CODE';
  position: relative;
  overflow: auto;
  margin: 0 0 12px;
  padding: 38px 16px 14px;
  border: 1px solid rgba(30, 41, 59, 0.88);
  border-left: 4px solid var(--rich-code-accent);
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 42%),
    #0f172a;
  color: #e2e8f0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.resource-detail-page__rich-text :deep(pre)::before {
  position: absolute;
  top: 10px;
  left: 14px;
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--rich-code-accent) 54%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--rich-code-accent) 18%, rgba(15, 23, 42, 0.86));
  color: #f8fafc;
  content: var(--rich-code-label);
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: 0;
  pointer-events: none;
}

.resource-detail-page__rich-text :deep(pre:has(code.language-json)) {
  --rich-code-accent: #f97316;
  --rich-code-label: 'JSON';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-rust)),
.resource-detail-page__rich-text :deep(pre:has(code.language-rs)) {
  --rich-code-accent: #d97706;
  --rich-code-label: 'RUST';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-cpp)),
.resource-detail-page__rich-text :deep(pre:has(code.language-cxx)),
.resource-detail-page__rich-text :deep(pre:has(code.language-cc)) {
  --rich-code-accent: #38bdf8;
  --rich-code-label: 'C++';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-c)) {
  --rich-code-accent: #94a3b8;
  --rich-code-label: 'C';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-csharp)),
.resource-detail-page__rich-text :deep(pre:has(code.language-cs)) {
  --rich-code-accent: #8b5cf6;
  --rich-code-label: 'C#';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-java)) {
  --rich-code-accent: #ef4444;
  --rich-code-label: 'JAVA';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-javascript)),
.resource-detail-page__rich-text :deep(pre:has(code.language-js)) {
  --rich-code-accent: #facc15;
  --rich-code-label: 'JS';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-typescript)),
.resource-detail-page__rich-text :deep(pre:has(code.language-ts)) {
  --rich-code-accent: #3b82f6;
  --rich-code-label: 'TS';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-python)),
.resource-detail-page__rich-text :deep(pre:has(code.language-py)) {
  --rich-code-accent: #22c55e;
  --rich-code-label: 'PYTHON';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-go)),
.resource-detail-page__rich-text :deep(pre:has(code.language-golang)) {
  --rich-code-accent: #06b6d4;
  --rich-code-label: 'GO';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-sql)) {
  --rich-code-accent: #a78bfa;
  --rich-code-label: 'SQL';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-shell)),
.resource-detail-page__rich-text :deep(pre:has(code.language-bash)),
.resource-detail-page__rich-text :deep(pre:has(code.language-sh)),
.resource-detail-page__rich-text :deep(pre:has(code.language-zsh)) {
  --rich-code-accent: #10b981;
  --rich-code-label: 'SHELL';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-html)) {
  --rich-code-accent: #fb7185;
  --rich-code-label: 'HTML';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-css)) {
  --rich-code-accent: #60a5fa;
  --rich-code-label: 'CSS';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-xml)) {
  --rich-code-accent: #f472b6;
  --rich-code-label: 'XML';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-yaml)),
.resource-detail-page__rich-text :deep(pre:has(code.language-yml)) {
  --rich-code-accent: #f59e0b;
  --rich-code-label: 'YAML';
}

.resource-detail-page__rich-text :deep(pre:has(code.language-md)),
.resource-detail-page__rich-text :deep(pre:has(code.language-markdown)) {
  --rich-code-accent: #2563eb;
  --rich-code-label: 'MD';
}

.resource-detail-page__rich-text :deep(code) {
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
}

.resource-detail-page__rich-text :deep(pre code) {
  display: block;
  min-width: max-content;
  color: inherit;
  line-height: 1.75;
  tab-size: 4;
}

.resource-detail-page__rich-text :deep(pre .hljs-comment),
.resource-detail-page__rich-text :deep(pre .hljs-quote) {
  color: #94a3b8;
  font-style: italic;
}

.resource-detail-page__rich-text :deep(pre .hljs-doctag),
.resource-detail-page__rich-text :deep(pre .hljs-keyword),
.resource-detail-page__rich-text :deep(pre .hljs-meta .hljs-keyword),
.resource-detail-page__rich-text :deep(pre .hljs-template-tag),
.resource-detail-page__rich-text :deep(pre .hljs-template-variable) {
  color: #f472b6;
  font-weight: 800;
}

.resource-detail-page__rich-text :deep(pre .hljs-attr),
.resource-detail-page__rich-text :deep(pre .hljs-attribute),
.resource-detail-page__rich-text :deep(pre .hljs-property),
.resource-detail-page__rich-text :deep(pre .hljs-variable) {
  color: #7dd3fc;
}

.resource-detail-page__rich-text :deep(pre .hljs-string),
.resource-detail-page__rich-text :deep(pre .hljs-regexp) {
  color: #86efac;
}

.resource-detail-page__rich-text :deep(pre .hljs-number),
.resource-detail-page__rich-text :deep(pre .hljs-literal),
.resource-detail-page__rich-text :deep(pre .hljs-symbol),
.resource-detail-page__rich-text :deep(pre .hljs-bullet) {
  color: #fbbf24;
}

.resource-detail-page__rich-text :deep(pre .hljs-built_in),
.resource-detail-page__rich-text :deep(pre .hljs-class .hljs-title),
.resource-detail-page__rich-text :deep(pre .hljs-title.class_),
.resource-detail-page__rich-text :deep(pre .hljs-type) {
  color: #67e8f9;
  font-weight: 700;
}

.resource-detail-page__rich-text :deep(pre .hljs-function .hljs-title),
.resource-detail-page__rich-text :deep(pre .hljs-title.function_),
.resource-detail-page__rich-text :deep(pre .hljs-title) {
  color: #93c5fd;
  font-weight: 700;
}

.resource-detail-page__rich-text :deep(pre .hljs-meta),
.resource-detail-page__rich-text :deep(pre .hljs-section),
.resource-detail-page__rich-text :deep(pre .hljs-selector-tag),
.resource-detail-page__rich-text :deep(pre .hljs-tag),
.resource-detail-page__rich-text :deep(pre .hljs-name) {
  color: #fb7185;
}

.resource-detail-page__rich-text :deep(pre .hljs-link),
.resource-detail-page__rich-text :deep(pre .hljs-operator),
.resource-detail-page__rich-text :deep(pre .hljs-params),
.resource-detail-page__rich-text :deep(pre .hljs-subst) {
  color: #cbd5e1;
}

.resource-detail-page__rich-text :deep(pre .hljs-addition) {
  color: #86efac;
  background: rgba(34, 197, 94, 0.12);
}

.resource-detail-page__rich-text :deep(pre .hljs-deletion) {
  color: #fda4af;
  background: rgba(244, 63, 94, 0.12);
}

.resource-detail-page__rich-text :deep(hr) {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.resource-detail-page__rich-text :deep(.rich-table-scroll) {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0 0 14px;
  max-width: 100%;
}

.resource-detail-page__rich-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 14px;
}

.resource-detail-page__rich-text :deep(.rich-table-scroll > table) {
  width: max-content;
  min-width: 100%;
  margin: 0;
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
  max-height: min(680px, calc(100vh - 220px));
  overflow-y: auto;
  padding-right: 8px;
  scrollbar-gutter: stable;
}

.resource-detail-page__version-card {
  border-radius: 18px;
  padding: 18px 18px 5px;
}

.resource-detail-page__version-note-wrap {
  margin-top: 4px;
}

.resource-detail-page__version-note {
  margin: 0;
  color: #334155;
  line-height: 1.8;
}

.resource-detail-page__version-note :deep(p),
.resource-detail-page__version-note :deep(ul),
.resource-detail-page__version-note :deep(ol),
.resource-detail-page__version-note :deep(blockquote) {
  color: #334155;
  line-height: 1.8;
  margin: 8px 0;
}

.resource-detail-page__version-note :deep(p:first-child),
.resource-detail-page__version-note :deep(ul:first-child),
.resource-detail-page__version-note :deep(ol:first-child),
.resource-detail-page__version-note :deep(blockquote:first-child) {
  margin-top: 0;
}

.resource-detail-page__version-note :deep(p:last-child),
.resource-detail-page__version-note :deep(ul:last-child),
.resource-detail-page__version-note :deep(ol:last-child),
.resource-detail-page__version-note :deep(blockquote:last-child) {
  margin-bottom: 0;
}

.resource-detail-page__version-note :deep(code) {
  color: #0f172a;
}

.resource-detail-page__version-note.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.resource-detail-page__version-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid rgba(219, 229, 247, 0.78);
}

.resource-detail-page__version-note-toggle {
  position: sticky;
  top: 8px;
  float: right;
  margin: -25px 0 8px 12px;
  padding: 4px 14px;
  border: none;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.09);
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
  z-index: 2;
}

.resource-detail-page__version-note-toggle:hover {
  background: rgba(100, 116, 139, 0.18);
}

.resource-detail-page__version-meta strong {
  color: #0f172a;
}

.resource-detail-page__comments-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-detail-page__comment-composer,
.resource-detail-page__comment-item {
  border-radius: 18px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.78);
}

.resource-detail-page__comment-composer {
  padding: 16px;
}

.resource-detail-page__comment-gate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.resource-detail-page__comment-gate strong,
.resource-detail-page__comment-meta strong {
  color: #0f172a;
}

.resource-detail-page__comment-gate p,
.resource-detail-page__comment-body p,
.resource-detail-page__comment-meta span,
.resource-detail-page__comment-count {
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.resource-detail-page__comment-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-detail-page__comment-input {
  width: 100%;
  min-height: 108px;
  resize: vertical;
  border: 1px solid rgba(198, 210, 236, 0.86);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  padding: 12px 14px;
  font: inherit;
  line-height: 1.7;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.resource-detail-page__comment-input:focus {
  border-color: rgba(37, 99, 235, 0.58);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}

.resource-detail-page__comment-toolbar,
.resource-detail-page__comment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__comment-count {
  font-size: 13px;
  font-weight: 700;
}

.resource-detail-page__comment-count.danger {
  color: #dc2626;
}

.resource-detail-page__comment-action,
.resource-detail-page__comment-submit {
  border: 0;
  border-radius: 12px;
  min-height: 40px;
  padding: 0 16px;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}

.resource-detail-page__comment-action:hover,
.resource-detail-page__comment-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.18);
}

.resource-detail-page__comment-submit:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.resource-detail-page__comment-list {
  min-height: 72px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-detail-page__comment-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
}

.resource-detail-page__comment-item.mine {
  border-color: rgba(37, 99, 235, 0.26);
  background: rgba(239, 246, 255, 0.82);
}

.resource-detail-page__comment-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #1d4ed8;
  background: rgba(219, 234, 254, 0.95);
  font-weight: 800;
}

.resource-detail-page__comment-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resource-detail-page__comment-body p {
  white-space: pre-wrap;
  word-break: break-word;
}

.resource-detail-page__comment-meta span {
  font-size: 12px;
}

@media (max-width: 980px) {
  .resource-detail-page__lead {
    grid-template-columns: 1fr;
  }

  .resource-detail-page__left-stack,
  .resource-detail-page__versions-side-card {
    grid-column: auto;
    grid-row: auto;
  }
}

@media (max-width: 900px) {
  .resource-detail-page {
    width: calc(100% - 16px);
  }
}

@media (max-width: 640px) {
  .resource-detail-page__panel {
    padding: 18px;
  }

  .resource-detail-page__version-list {
    max-height: min(520px, calc(100vh - 260px));
  }

  .resource-detail-page__summary-card {
    min-height: auto;
  }

  .resource-detail-page__title {
    font-size: 28px;
  }

  .resource-detail-page__cover-card {
    aspect-ratio: 1.618;
    min-height: 0;
  }

  .resource-detail-page__version-headline {
    align-items: flex-start;
  }

  .resource-detail-page__summary-stats {
    grid-template-columns: 1fr;
  }

  .resource-detail-page__cta-row,
  .resource-detail-page__primary-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .resource-detail-page__primary-btn,
  .resource-detail-page__like-btn,
  .resource-detail-page__primary-actions :deep(.share-card-generator),
  .resource-detail-page__primary-actions :deep(.share-card-generator__start),
  .resource-detail-page__secondary-btn {
    width: 100%;
  }

  .resource-detail-page__comment-gate,
  .resource-detail-page__comment-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .resource-detail-page__comment-action,
  .resource-detail-page__comment-submit {
    width: 100%;
  }

  .resource-detail-page__comment-item {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .resource-detail-page__comment-avatar {
    width: 36px;
    height: 36px;
  }
}
</style>
