<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { useRoute, useRouter } from 'vue-router'

import { HttpError, apiUrl } from '@/api/http'
import {
  createPublicMcResourceComment,
  getPublicMcResource,
  invalidateResourceListCache,
  likePublicMcResource,
  listPublicMcResourceComments,
  listPublicMcResourceVersions,
  downloadPublicMcResourceFile,
  unlikePublicMcResource,
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
const { showToast } = useToast()

const loading = ref(false)
const resource = ref<PublicMcResourceItem | null>(null)
const versions = ref<PublicMcResourceVersionItem[]>([])
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
const authorPillLabel = computed(() => {
  const current = resource.value
  if (!current) {
    return ''
  }

  const author = current.author.trim()
  const creator = current.creator.trim()

  // 团队资源：显示"团队名称-作者"
  if (current.ownership_type === 'team' && current.team_name) {
    if (author) {
      return `${current.team_name} - ${author}`
    }
    return current.team_name
  }

  // 个人资源：保持原有逻辑
  if (author && creator && author === creator) {
    return `作者 / 创建者 ${author}`
  }

  return author ? `作者 ${author}` : '作者未知'
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

async function triggerDownload(url: string, fileName: string) {
  const token = auth.token?.trim() ? auth.token : null
  try {
    const { blob, fileName: resolvedFileName } = await downloadPublicMcResourceFile(
      url,
      fileName,
      token,
    )

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

  const fileName =
    resource.value?.file_name || latestVersion.value.resource.split('/').pop() || 'download'
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
      ...comments.value.filter(
        (item) => item.id !== saved.id && item.commenter !== saved.commenter,
      ),
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
          <div class="resource-detail-page__cover-card">
            <img v-if="resource.cover_url" :src="resourceCoverUrl" :alt="resource.title"
              class="resource-detail-page__cover-image" />
            <div v-else class="resource-detail-page__cover-placeholder">📁</div>
          </div>

          <div class="resource-detail-page__summary-card">
            <div class="resource-detail-page__headline-row">
              <span class="resource-detail-page__status-pill">{{ visibilityLabel }}</span>
              <router-link
                v-if="resource.creator"
                :to="{ name: 'dev-profile', params: { username: resource.creator } }"
                class="resource-detail-page__author-pill resource-detail-page__author-pill--link"
              >
                {{ authorPillLabel }}
              </router-link>
              <span v-else class="resource-detail-page__author-pill">{{ authorPillLabel }}</span>
            </div>
            <div class="resource-detail-page__identity-block">
              <h1 class="resource-detail-page__title">{{ resource.title }}</h1>
              <p v-if="showCreatorMeta" class="resource-detail-page__meta">
                创建者：{{ resource.creator }}
              </p>
              <p class="resource-detail-page__summary">
                {{ resourceSummaryText || '当前资源暂无简介。' }}
              </p>
            </div>

            <div v-if="tagNames.length > 0" class="resource-detail-page__tags">
              <span v-for="item in tagNames" :key="item" class="resource-detail-page__tag">{{
                item
              }}</span>
            </div>

            <div v-if="infoCards.length" class="resource-detail-page__summary-stats">
              <article v-for="item in infoCards" :key="item.label" class="resource-detail-page__summary-stat">
                <strong>{{ item.value }}</strong>
                <span>{{ item.label }}</span>
              </article>
            </div>

            <div class="resource-detail-page__cta-row">
              <div class="resource-detail-page__primary-actions">
                <button class="resource-detail-page__primary-btn" type="button" @click="openResourceFile">
                  下载最新版本
                </button>
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
            <p v-else class="resource-detail-page__paragraph">当前还没有可展示的历史版本。</p>
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
                    <strong>{{ comment.commenter }}</strong>
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
  gap: 18px;
  min-height: 360px;
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

.resource-detail-page__author-pill--link {
  text-decoration: none;
  cursor: pointer;
  transition: background 0.18s ease;
}

.resource-detail-page__author-pill--link:hover {
  background: rgba(191, 219, 254, 0.95);
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

.resource-detail-page__secondary-btn,
.resource-detail-page__version-download {
  color: #1d4ed8;
  background: rgba(239, 246, 255, 0.9);
  font-weight: 700;
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

.resource-detail-page__rich-text :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  margin: 12px 0;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 14px;
  background: #f8fafc;
}

.resource-detail-page__rich-text :deep(.rich-editor-image) {
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

  .resource-detail-page__summary-card {
    min-height: auto;
  }

  .resource-detail-page__title {
    font-size: 28px;
  }

  .resource-detail-page__cover-card {
    min-height: 280px;
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
