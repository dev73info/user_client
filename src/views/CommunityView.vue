<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  ChatDotRound,
  Close,
  EditPen,
  Plus,
  Refresh,
  Search,
} from '@element-plus/icons-vue'

import { HttpError, apiUrl } from '@/api/http'
import {
  createCommunityComment,
  createCommunityPost,
  getCommunityPost,
  likeCommunityPost,
  listCommunityComments,
  listCommunityPosts,
  listCommunityTags,
  unlikeCommunityPost,
  updateCommunityPost,
  type CommunityComment,
  type CommunityPost,
  type CommunityTag,
} from '@/api/community'
import { getMyRealnameVerification } from '@/api/realname'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()
const POSTS_PER_PAGE = 8
const initialSearchKeyword =
  typeof route.query.keyword === 'string' ? route.query.keyword.trim() : ''

const posts = ref<CommunityPost[]>([])
const tags = ref<CommunityTag[]>([])
const selectedPost = ref<CommunityPost | null>(null)
const comments = ref<CommunityComment[]>([])
const selectedTag = ref('')
const searchDraft = ref(initialSearchKeyword)
const searchKeyword = ref(initialSearchKeyword)
const currentPage = ref(1)
const hasNextPage = ref(false)
const loading = ref(false)
const selectedPostLoading = ref(false)
const commentsLoading = ref(false)
const savingPost = ref(false)
const sendingComment = ref(false)
const composerVisible = ref(false)
const editingPost = ref<CommunityPost | null>(null)
const commentDraft = ref('')
const composerPanelRef = ref<HTMLElement | null>(null)
const composerActionsShellRef = ref<HTMLElement | null>(null)
const composerActionsRef = ref<HTMLElement | null>(null)
const selectedPostContentRef = ref<HTMLElement | null>(null)
const composerActionsFloating = ref(false)
const composerActionsPlaceholderHeight = ref(0)
const composerActionsFloatingStyle = ref<Record<string, string>>({})
let composerActionsResizeObserver: ResizeObserver | null = null
let selectedPostRequestId = 0

const postForm = reactive({
  title: '',
  tag_names: [] as string[],
  content_html: '',
})

const currentPostContent = computed(() =>
  selectedPost.value?.content_html ? sanitizeRichHtml(selectedPost.value.content_html) : '',
)

const tagOptions = computed(() => tags.value.map((tag) => tag.name))
const searchActive = computed(() => searchKeyword.value.length > 0)
const hasActiveFilters = computed(() => Boolean(selectedTag.value || searchActive.value))
const pageStatus = computed(() => {
  if (posts.value.length === 0) {
    return `第 ${currentPage.value} 页`
  }

  const start = (currentPage.value - 1) * POSTS_PER_PAGE + 1
  const end = start + posts.value.length - 1
  return `第 ${currentPage.value} 页 · ${start}-${end} 条`
})
const emptyTitle = computed(() => (hasActiveFilters.value ? '没有匹配的帖子' : '暂无帖子'))
const emptyDescription = computed(() =>
  hasActiveFilters.value ? '换个关键词或标签再试试。' : '成为第一位发布内容的人。',
)
const canEditSelectedPost = computed(() =>
  Boolean(auth.isAuthed && selectedPost.value && selectedPost.value.author === auth.username),
)
const selectedPostPublished = computed(() => selectedPost.value?.status === 'published')
const composerActionsShellStyle = computed<Record<string, string> | undefined>(() => {
  if (!composerActionsFloating.value || composerActionsPlaceholderHeight.value <= 0) {
    return undefined
  }

  return {
    height: `${composerActionsPlaceholderHeight.value}px`,
  }
})

useCodeBlockCopy({
  rootRef: selectedPostContentRef,
  notify: showToast,
})

function resetFloatingComposerActions() {
  composerActionsFloating.value = false
  composerActionsPlaceholderHeight.value = 0
  composerActionsFloatingStyle.value = {}
}

function updateFloatingComposerActions() {
  const panel = composerPanelRef.value
  const shell = composerActionsShellRef.value
  const actions = composerActionsRef.value
  if (!composerVisible.value || !panel || !shell || !actions) {
    resetFloatingComposerActions()
    return
  }

  const panelRect = panel.getBoundingClientRect()
  const shellRect = shell.getBoundingClientRect()
  const actionsHeight = actions.offsetHeight
  const viewportGap = 12
  const bottom = 16
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const floatingTop = viewportHeight - bottom - actionsHeight
  const canFloat =
    panelRect.top < floatingTop &&
    panelRect.bottom > viewportHeight - bottom + actionsHeight + viewportGap

  composerActionsPlaceholderHeight.value = actionsHeight
  composerActionsFloating.value = canFloat

  if (!canFloat) {
    composerActionsFloatingStyle.value = {}
    return
  }

  const left = Math.max(viewportGap, Math.round(shellRect.left))
  const width = Math.max(
    180,
    Math.min(Math.round(shellRect.width), window.innerWidth - left - viewportGap),
  )
  composerActionsFloatingStyle.value = {
    bottom: `${bottom}px`,
    left: `${left}px`,
    width: `${width}px`,
  }
}

function observeComposerActions() {
  composerActionsResizeObserver?.disconnect()
  composerActionsResizeObserver = null

  if (typeof ResizeObserver !== 'undefined' && composerVisible.value) {
    composerActionsResizeObserver = new ResizeObserver(updateFloatingComposerActions)
    if (composerPanelRef.value) {
      composerActionsResizeObserver.observe(composerPanelRef.value)
    }
    if (composerActionsShellRef.value) {
      composerActionsResizeObserver.observe(composerActionsShellRef.value)
    }
    if (composerActionsRef.value) {
      composerActionsResizeObserver.observe(composerActionsRef.value)
    }
  }

  updateFloatingComposerActions()
}

function avatarInitial(name?: string | null): string {
  return Array.from(name?.trim() || '用')[0] ?? '用'
}

function commentAvatarSrc(comment: CommunityComment): string {
  const avatarUrl = comment.commenter_avatar_url?.trim()
  return avatarUrl ? apiUrl(avatarUrl) : ''
}

function handleCommentAvatarError(comment: CommunityComment) {
  comment.commenter_avatar_url = null
}

function postStatusText(status: CommunityPost['status']): string {
  const map: Record<CommunityPost['status'], string> = {
    pending_review: '审核中',
    published: '公开中',
    rejected: '已驳回',
  }
  return map[status]
}

function routePostId(): number | null {
  const rawValue = route.params.postId ?? route.query.post ?? route.query.postId
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
  if (typeof value !== 'string') {
    return null
  }

  const postId = Number(value)
  return Number.isInteger(postId) && postId > 0 ? postId : null
}

onMounted(() => {
  auth.hydrate()
  void loadCommunityData()
  window.addEventListener('scroll', updateFloatingComposerActions, true)
  window.addEventListener('resize', updateFloatingComposerActions)
})

onBeforeUnmount(() => {
  composerActionsResizeObserver?.disconnect()
  window.removeEventListener('scroll', updateFloatingComposerActions, true)
  window.removeEventListener('resize', updateFloatingComposerActions)
  resetSeoMeta()
})

watch(composerVisible, () => {
  void nextTick(observeComposerActions)
})

watch(
  () => route.query.keyword,
  (value) => {
    const nextKeyword = typeof value === 'string' ? value.trim() : ''
    if (nextKeyword === searchKeyword.value && nextKeyword === searchDraft.value.trim()) {
      return
    }

    searchDraft.value = nextKeyword
    searchKeyword.value = nextKeyword
    void loadPostsPage(1, routePostId() ?? undefined)
  },
)

watch(
  () => [route.params.postId, route.query.post, route.query.postId] as const,
  () => {
    const postId = routePostId()
    if (postId) {
      selectPostById(postId)
    }
  },
)

watch(
  selectedPost,
  (post) => {
    if (!post) {
      setSeoMeta({
        title: '社区帖子 - 73Info 柒叁信息',
        description: '73Info 社区内容，查看开发者与用户发布的经验、反馈和讨论。',
        path: '/community',
      })
      return
    }

    const tags = post.tags.map((tag) => tag.name).join('、')
    setSeoMeta({
      title: `${post.title} - 73Info 社区帖子`,
      description: post.content_html || tags || '73Info 平台社区帖子详情。',
      path: `/community/posts/${post.id}`,
    })
  },
)

async function fetchPostPage(pageNumber: number) {
  const safePage = Math.max(1, pageNumber)
  const nextPosts = await listCommunityPosts({
    token: auth.token,
    tag: selectedTag.value,
    keyword: searchKeyword.value,
    limit: POSTS_PER_PAGE + 1,
    offset: (safePage - 1) * POSTS_PER_PAGE,
  })

  return {
    page: safePage,
    posts: nextPosts.slice(0, POSTS_PER_PAGE),
    hasNext: nextPosts.length > POSTS_PER_PAGE,
  }
}

function pickRandomPost(nextPosts: CommunityPost[]): CommunityPost | null {
  if (nextPosts.length === 0) {
    return null
  }
  return nextPosts[Math.floor(Math.random() * nextPosts.length)] ?? null
}

function applyPostPage(
  page: number,
  nextPosts: CommunityPost[],
  nextHasPage: boolean,
  preferredPostId?: number,
) {
  currentPage.value = page
  hasNextPage.value = nextHasPage
  posts.value = nextPosts

  const preferredPost = preferredPostId ? nextPosts.find((post) => post.id === preferredPostId) : null
  if (preferredPost) {
    selectPost(preferredPost)
    return
  }

  if (preferredPostId) {
    selectPost(null)
    void loadStandalonePost(preferredPostId)
    return
  }

  selectPost(pickRandomPost(nextPosts))
}

async function loadCommunityData() {
  loading.value = true
  try {
    const selectedPostId = routePostId() ?? selectedPost.value?.id
    const [nextTags, postPage] = await Promise.all([
      listCommunityTags(),
      fetchPostPage(currentPage.value),
    ])
    tags.value = nextTags
    applyPostPage(postPage.page, postPage.posts, postPage.hasNext, selectedPostId)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载社区内容失败', 'error')
  } finally {
    loading.value = false
  }
}

async function loadPostsPage(pageNumber = currentPage.value, preferredPostId?: number) {
  loading.value = true
  try {
    const postPage = await fetchPostPage(pageNumber)
    applyPostPage(postPage.page, postPage.posts, postPage.hasNext, preferredPostId)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载社区帖子失败', 'error')
  } finally {
    loading.value = false
  }
}

function selectTag(tagName: string) {
  selectedTag.value = selectedTag.value === tagName ? '' : tagName
  void loadPostsPage(1)
}

function applySearch() {
  searchKeyword.value = searchDraft.value.trim()
  void loadPostsPage(1)
}

function clearSearch() {
  if (!searchDraft.value && !searchKeyword.value) {
    return
  }

  searchDraft.value = ''
  searchKeyword.value = ''
  void loadPostsPage(1)
}

function goToPreviousPage() {
  if (currentPage.value <= 1 || loading.value) {
    return
  }

  void loadPostsPage(currentPage.value - 1)
}

function goToNextPage() {
  if (!hasNextPage.value || loading.value) {
    return
  }

  void loadPostsPage(currentPage.value + 1)
}

function selectPost(post: CommunityPost | null) {
  const requestId = ++selectedPostRequestId
  selectedPost.value = post
  commentDraft.value = ''
  if (post) {
    comments.value = []
    if (post.content_html) {
      selectedPostLoading.value = false
    } else {
      void loadSelectedPostDetail(post.id, requestId)
    }
    void loadComments(post.id, requestId)
  } else {
    selectedPostLoading.value = false
    commentsLoading.value = false
    comments.value = []
  }
}

function selectPostById(postId: number) {
  const post = posts.value.find((item) => item.id === postId)
  if (post) {
    selectPost(post)
    return
  }

  void loadStandalonePost(postId)
}

async function loadStandalonePost(postId: number) {
  const requestId = ++selectedPostRequestId
  selectedPost.value = null
  selectedPostLoading.value = true
  commentsLoading.value = false
  comments.value = []
  commentDraft.value = ''

  try {
    const detail = await getCommunityPost(postId, auth.token)
    if (requestId !== selectedPostRequestId) {
      return
    }

    selectedPost.value = detail
    selectedPostLoading.value = false
    void loadComments(detail.id, requestId)
  } catch (error) {
    if (requestId === selectedPostRequestId) {
      selectedPostLoading.value = false
      showToast(error instanceof Error ? error.message : '加载帖子详情失败', 'error')
    }
  }
}

async function loadSelectedPostDetail(postId: number, requestId: number) {
  selectedPostLoading.value = true
  try {
    const detail = await getCommunityPost(postId, auth.token)
    if (requestId !== selectedPostRequestId) {
      return
    }
    posts.value = posts.value.map((post) => (post.id === postId ? { ...post, ...detail } : post))
    selectedPost.value = detail
  } catch (error) {
    if (requestId === selectedPostRequestId) {
      showToast(error instanceof Error ? error.message : '加载帖子详情失败', 'error')
    }
  } finally {
    if (requestId === selectedPostRequestId) {
      selectedPostLoading.value = false
    }
  }
}

async function loadComments(postId: number, requestId = selectedPostRequestId) {
  commentsLoading.value = true
  try {
    const nextComments = await listCommunityComments(postId, auth.token)
    if (requestId === selectedPostRequestId) {
      comments.value = nextComments
    }
  } catch (error) {
    if (requestId === selectedPostRequestId) {
      showToast(error instanceof Error ? error.message : '加载评论失败', 'error')
    }
  } finally {
    if (requestId === selectedPostRequestId) {
      commentsLoading.value = false
    }
  }
}

function ensureAuthed(): boolean {
  auth.hydrate()
  if (auth.isAuthed) {
    return true
  }
  showToast('请先登录后再操作社区内容', 'warning')
  void router.push({ name: 'home', query: { modal: 'auth', redirect_to: '/community' } })
  return false
}

async function ensurePostRealnameApproved(): Promise<boolean> {
  auth.hydrate()
  if (!auth.isAuthed) {
    showToast('发布帖子前请先登录', 'warning')
    void router.push({ name: 'home', query: { modal: 'auth', redirect_to: '/community' } })
    return false
  }

  try {
    const record = await getMyRealnameVerification(auth.token)
    if (record.status === 'approved') {
      return true
    }

    if (record.status === 'pending') {
      showToast('实名认证审核中，通过后可发布帖子', 'warning')
      return false
    }

    showToast('实名认证未通过，请重新提交后再发布帖子', 'warning')
    void router.push({ name: 'workbench-realname', query: { redirect_to: route.fullPath || '/community' } })
    return false
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      showToast('发布帖子前请先完成实名认证', 'warning')
      void router.push({ name: 'workbench-realname', query: { redirect_to: route.fullPath || '/community' } })
      return false
    }

    showToast(error instanceof Error ? error.message : '实名认证状态校验失败', 'error')
    return false
  }
}

function resetComposer() {
  editingPost.value = null
  postForm.title = ''
  postForm.tag_names = selectedTag.value ? [selectedTag.value] : []
  postForm.content_html = ''
}

async function openCreateComposer() {
  if (!ensureAuthed()) {
    return
  }
  const approved = await ensurePostRealnameApproved()
  if (!approved) {
    return
  }
  resetComposer()
  composerVisible.value = true
}

async function openEditComposer(post: CommunityPost) {
  if (!ensureAuthed()) {
    return
  }
  try {
    const detail = post.content_html ? post : await getCommunityPost(post.id, auth.token)
    editingPost.value = detail
    postForm.title = detail.title
    postForm.tag_names = detail.tags.map((tag) => tag.name)
    postForm.content_html = sanitizeRichHtml(detail.content_html)
    composerVisible.value = true
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载帖子详情失败', 'error')
  }
}

function closeComposer() {
  composerVisible.value = false
  resetComposer()
}

async function submitPost() {
  if (!ensureAuthed() || savingPost.value) {
    return
  }

  const isEditing = Boolean(editingPost.value)
  if (!isEditing) {
    const approved = await ensurePostRealnameApproved()
    if (!approved) {
      return
    }
  }

  savingPost.value = true
  try {
    const editingId = editingPost.value?.id
    const payload = {
      title: postForm.title.trim(),
      tag_names: postForm.tag_names.map((tag) => tag.trim()).filter(Boolean),
      content_html: sanitizeRichHtml(postForm.content_html),
    }
    const saved =
      isEditing && editingId
        ? await updateCommunityPost(auth.token, editingId, payload)
        : await createCommunityPost(auth.token, payload)

    if (!isEditing) {
      currentPage.value = 1
    }

    await loadCommunityData()
    selectPost(saved)
    closeComposer()
    showToast(isEditing ? '帖子已更新，等待审核' : '帖子已提交审核', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存帖子失败', 'error')
  } finally {
    savingPost.value = false
  }
}

function updateSelectedPost(patch: Partial<CommunityPost>) {
  if (!selectedPost.value) {
    return
  }
  const postId = selectedPost.value.id
  posts.value = posts.value.map((post) => (post.id === postId ? { ...post, ...patch } : post))
  selectedPost.value = { ...selectedPost.value, ...patch }
}

async function toggleLike(post: CommunityPost) {
  if (!ensureAuthed()) {
    return
  }

  if (post.status !== 'published') {
    showToast('帖子公开后才能点赞', 'warning')
    return
  }

  try {
    const state = post.liked_by_me
      ? await unlikeCommunityPost(auth.token, post.id)
      : await likeCommunityPost(auth.token, post.id)
    posts.value = posts.value.map((item) =>
      item.id === post.id
        ? { ...item, liked_by_me: state.liked_by_me, like_count: state.like_count }
        : item,
    )
    if (selectedPost.value?.id === post.id) {
      updateSelectedPost({ liked_by_me: state.liked_by_me, like_count: state.like_count })
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '点赞失败', 'error')
  }
}

async function submitComment() {
  if (!selectedPost.value || !ensureAuthed() || sendingComment.value) {
    return
  }

  if (selectedPost.value.status !== 'published') {
    showToast('帖子公开后才能评论', 'warning')
    return
  }

  sendingComment.value = true
  try {
    const created = await createCommunityComment(
      auth.token,
      selectedPost.value.id,
      commentDraft.value,
    )
    comments.value = [...comments.value, created]
    updateSelectedPost({ comment_count: (selectedPost.value.comment_count ?? 0) + 1 })
    commentDraft.value = ''
    showToast('评论已发布', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发表评论失败', 'error')
  } finally {
    sendingComment.value = false
  }
}
</script>

<template>
  <main class="portal-page portal-page--nav community-page">
    <section class="community-board">
      <section class="community-stream">
        <div class="community-hero">
          <div>
            <p class="portal-page__eyebrow">社区内容</p>
            <h2>开发者与用户帖子</h2>
          </div>
          <div class="community-hero__actions">
            <button class="community-hero__button community-hero__button--ghost" type="button" :disabled="loading"
              @click="loadCommunityData">
              <el-icon :class="{ 'is-spinning': loading }">
                <Refresh />
              </el-icon>
              <span>{{ loading ? '刷新中' : '刷新' }}</span>
            </button>
            <button class="community-hero__button community-hero__button--primary" type="button"
              @click="openCreateComposer">
              <el-icon>
                <Plus />
              </el-icon>
              <span>发布帖子</span>
            </button>
          </div>
        </div>

        <form class="community-search-bar" @submit.prevent="applySearch">
          <div class="community-search-field">
            <el-icon>
              <Search />
            </el-icon>
            <input v-model="searchDraft" type="text" inputmode="search" enterkeyhint="search" aria-label="搜索社区帖子"
              placeholder="搜索标题、作者、正文或标签" />
            <button v-if="searchDraft || searchKeyword" class="community-search-clear" type="button" aria-label="清空搜索"
              @click="clearSearch">
              <el-icon>
                <Close />
              </el-icon>
            </button>
          </div>
          <button class="community-search-submit" type="submit" :disabled="loading">
            <el-icon>
              <Search />
            </el-icon>
            <span>搜索</span>
          </button>
        </form>

        <div class="community-tag-row">
          <button class="community-tag" :class="{ 'is-active': !selectedTag }" type="button" @click="selectTag('')">
            全部
          </button>
          <button v-for="tag in tags" :key="tag.id" class="community-tag"
            :class="{ 'is-active': selectedTag === tag.name }" type="button" @click="selectTag(tag.name)">
            {{ tag.name }}
          </button>
        </div>

        <div v-if="loading" class="community-empty">社区内容加载中</div>
        <div v-else-if="posts.length === 0" class="community-empty">
          <strong>{{ emptyTitle }}</strong>
          <span>{{ emptyDescription }}</span>
        </div>
        <div v-else class="community-post-list">
          <article v-for="post in posts" :key="post.id" class="community-post-card"
            :class="{ 'is-active': selectedPost?.id === post.id }" @click="selectPost(post)">
            <div class="community-post-card__head">
              <div>
                <h3>{{ post.title }}</h3>
                <p>{{ post.author }} · {{ post.published_at }}</p>
              </div>
              <div class="community-post-card__badges">
                <span class="community-status-badge" :class="`is-${post.status}`">{{ postStatusText(post.status)
                  }}</span>
                <span>{{ post.like_count }} 赞</span>
              </div>
            </div>
            <div class="community-post-card__tags">
              <span v-for="tag in post.tags" :key="tag.id">{{ tag.name }}</span>
            </div>
            <div class="community-post-card__meta">
              <span>{{ post.comment_count }} 条评论</span>
              <span>更新 {{ post.updated_at }}</span>
            </div>
          </article>
        </div>

        <div v-if="!loading && (posts.length > 0 || currentPage > 1)" class="community-pagination">
          <button class="community-page-button" type="button" :disabled="currentPage <= 1" @click="goToPreviousPage">
            <el-icon>
              <ArrowLeft />
            </el-icon>
            <span>上一页</span>
          </button>
          <span class="community-page-status">{{ pageStatus }}</span>
          <button class="community-page-button" type="button" :disabled="!hasNextPage" @click="goToNextPage">
            <span>下一页</span>
            <el-icon>
              <ArrowRight />
            </el-icon>
          </button>
        </div>
      </section>

      <aside class="community-detail">
        <section v-if="composerVisible" ref="composerPanelRef" class="community-panel community-composer">
          <div class="community-panel__head">
            <div>
              <p class="portal-page__eyebrow">{{ editingPost ? '编辑帖子' : '发布帖子' }}</p>
              <h3>{{ editingPost ? '更新社区内容' : '写一篇新帖子' }}</h3>
            </div>
            <el-button class="community-panel-action" plain @click="closeComposer">
              <el-icon>
                <Close />
              </el-icon>
              <span>取消</span>
            </el-button>
          </div>

          <el-form label-position="top" class="community-form">
            <el-form-item label="标题">
              <el-input v-model="postForm.title" maxlength="80" show-word-limit placeholder="写一个清楚的标题" />
            </el-form-item>
            <el-form-item label="标签">
              <el-select v-model="postForm.tag_names" multiple filterable allow-create default-first-option
                placeholder="选择或输入标签">
                <el-option v-for="tag in tagOptions" :key="tag" :label="tag" :value="tag" />
              </el-select>
            </el-form-item>
          </el-form>

          <RichTextEditor v-model="postForm.content_html" :floating-toolbar-top="86" @notify="showToast" />

          <div ref="composerActionsShellRef" class="community-composer__actions-shell"
            :style="composerActionsShellStyle">
            <div ref="composerActionsRef" class="community-composer__actions"
              :class="{ 'is-floating': composerActionsFloating }" :style="composerActionsFloatingStyle">
              <el-button class="community-submit-button community-composer__actions" type="primary"
                :loading="savingPost" @click="submitPost">
                {{ editingPost ? '保存修改' : '发布帖子' }}
              </el-button>
            </div>
          </div>
        </section>

        <section v-else-if="selectedPost" class="community-panel community-post-detail">
          <div class="community-detail__header">
            <div>
              <div class="community-post-card__tags">
                <span v-for="tag in selectedPost.tags" :key="tag.id">{{ tag.name }}</span>
              </div>
              <h2>{{ selectedPost.title }}</h2>
              <p>
                {{ selectedPost.author }} 发布于 {{ selectedPost.published_at }} · 更新
                {{ selectedPost.updated_at }}
              </p>
            </div>
            <el-button v-if="canEditSelectedPost" class="community-panel-action" plain
              @click="openEditComposer(selectedPost)">
              <el-icon>
                <EditPen />
              </el-icon>
              <span>编辑</span>
            </el-button>
          </div>

          <div v-if="selectedPostLoading" class="community-detail-loading" role="status">
            正文加载中...
          </div>
          <article v-else ref="selectedPostContentRef" class="community-rich-text" v-html="currentPostContent">
          </article>

          <div class="community-actions">
            <el-button class="community-like-button" :class="{ 'is-liked': selectedPost.liked_by_me }"
              :type="selectedPost.liked_by_me ? 'primary' : 'default'" :disabled="!selectedPostPublished"
              @click="toggleLike(selectedPost)">
              <el-icon>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m0 11V10l4-8a3 3 0 0 1 3 3v4h5.4a2 2 0 0 1 2 2.3l-1.2 8A2 2 0 0 1 18.2 21H7Z" />
                </svg>
              </el-icon>
              <span>{{ selectedPost.liked_by_me ? '已点赞' : '点赞' }}</span>
              <strong>{{ selectedPost.like_count }}</strong>
            </el-button>
            <span class="community-action-stat">
              <el-icon>
                <ChatDotRound />
              </el-icon>
              {{ selectedPost.comment_count }} 条评论
            </span>
          </div>

          <section class="community-comments">
            <div class="community-comments__head">
              <h3>评论</h3>
              <span v-if="commentsLoading" class="community-comments__loading" role="status" aria-live="polite">
                <span class="community-comments__spinner" aria-hidden="true"></span>
                评论同步中
              </span>
            </div>

            <div v-if="!selectedPostPublished" class="community-status-note">
              帖子公开后可点赞和评论。
            </div>
            <div v-else class="community-comment-box">
              <el-input v-model="commentDraft" type="textarea" :rows="3" maxlength="800" show-word-limit
                placeholder="说点具体的想法或补充" />
              <el-button class="community-submit-button community-comment-submit" type="primary"
                :loading="sendingComment" @click="submitComment">
                发表评论
              </el-button>
            </div>

            <div v-if="!commentsLoading && comments.length === 0" class="community-empty community-empty--compact">
              暂无评论
            </div>
            <ul v-else class="community-comment-list">
              <li v-for="comment in comments" :key="comment.id" class="community-comment-item">
                <div class="community-comment-item__avatar">
                  <img v-if="commentAvatarSrc(comment)" :src="commentAvatarSrc(comment)"
                    :alt="`${comment.commenter} 的头像`" @error="handleCommentAvatarError(comment)" />
                  <span v-else>{{ avatarInitial(comment.commenter) }}</span>
                </div>
                <div>
                  <strong>{{ comment.commenter }}</strong>
                  <p>{{ comment.comment_text }}</p>
                  <time>{{ comment.created_at }}</time>
                </div>
              </li>
            </ul>
          </section>
        </section>

        <section v-else class="community-panel community-empty">
          <strong>选择一篇帖子查看详情</strong>
          <span>也可以直接发布新的社区内容。</span>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.community-board {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.community-stream,
.community-panel {
  min-width: 0;
  border: 1px solid rgba(198, 210, 236, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 24px rgba(90, 120, 180, 0.08);
}

.community-stream,
.community-panel {
  padding: 14px;
}

.community-detail {
  position: sticky;
  top: 76px;
  min-width: 0;
}

@media (max-width: 1180px) and (min-width: 921px) {
  .community-detail {
    top: 136px;
  }
}

.community-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 0 0 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
}

.community-hero h2,
.community-panel h2,
.community-panel h3,
.community-post-card h3 {
  margin: 0;
  color: #0f172a;
}

.community-hero h2 {
  margin-top: 4px;
  font-size: 22px;
  line-height: 1.25;
}

.community-hero p,
.community-detail__header p,
.community-post-card p,
.community-post-card__meta,
.community-actions,
.community-empty,
.community-comment-item time {
  color: #64748b;
  line-height: 1.7;
}

.community-hero p {
  max-width: 320px;
  margin: 6px 0 0;
  font-size: 14px;
}

.community-hero__actions,
.community-panel__head,
.community-detail__header,
.community-comments__head,
.community-actions,
.community-composer__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.community-hero__actions {
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.community-hero__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 9px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.community-hero__button--ghost {
  border-color: rgba(191, 219, 254, 0.96);
  background: rgba(239, 246, 255, 0.82);
  color: #2563eb;
}

.community-hero__button--ghost:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(219, 234, 254, 0.92);
}

.community-hero__button--primary {
  background: #2563eb;
  color: #fff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
}

.community-hero__button--primary:hover:not(:disabled) {
  background: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
  transform: translateY(-1px);
}

.community-hero__button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.community-hero__button .el-icon {
  font-size: 15px;
}

.community-hero__button .el-icon.is-spinning {
  animation: community-spin 900ms linear infinite;
}

@keyframes community-spin {
  to {
    transform: rotate(360deg);
  }
}

.community-search-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-bottom: 12px;
}

.community-search-field {
  display: flex;
  min-width: 0;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.92);
  color: #64748b;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.community-search-field:focus-within {
  border-color: rgba(37, 99, 235, 0.44);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.community-search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
}

.community-search-field input::placeholder {
  color: #94a3b8;
}

.community-search-clear,
.community-search-submit,
.community-page-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.community-search-clear {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.74);
  color: #2563eb;
}

.community-search-clear:hover {
  background: rgba(191, 219, 254, 0.96);
}

.community-search-submit {
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border-color: rgba(37, 99, 235, 0.78);
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.14);
}

.community-search-submit:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
}

.community-search-submit:disabled,
.community-page-button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  transform: none;
}

.community-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.78);
}

.community-tag {
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid rgba(219, 234, 254, 0.92);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.76);
  color: #1d4ed8;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}

.community-tag.is-active {
  background: #2563eb;
  color: #fff;
}

.community-post-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.community-post-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}

.community-post-card:hover,
.community-post-card.is-active {
  border-color: rgba(37, 99, 235, 0.48);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.09);
  transform: translateY(-1px);
}

.community-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.78);
}

.community-page-button {
  gap: 5px;
  min-height: 34px;
  padding: 0 12px;
  border-color: rgba(191, 219, 254, 0.96);
  border-radius: 9px;
  background: rgba(239, 246, 255, 0.82);
  color: #2563eb;
}

.community-page-button:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(219, 234, 254, 0.92);
}

.community-page-status {
  min-width: 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

.community-post-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.community-post-card__head h3 {
  margin-bottom: 6px;
  font-size: 16px;
  line-height: 1.35;
}

.community-post-card__head span {
  flex-shrink: 0;
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
}

.community-post-card__badges {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.community-status-badge {
  display: inline-flex;
  width: fit-content;
  min-height: 24px;
  align-items: center;
  padding: 0 9px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.9);
  color: #475569;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.community-status-badge.is-pending_review {
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(255, 251, 235, 0.95);
  color: #b45309;
}

.community-status-badge.is-published {
  border-color: rgba(34, 197, 94, 0.24);
  background: rgba(240, 253, 244, 0.95);
  color: #15803d;
}

.community-status-badge.is-rejected {
  border-color: rgba(248, 113, 113, 0.28);
  background: rgba(254, 242, 242, 0.95);
  color: #b91c1c;
}

.community-post-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.community-post-card__tags span {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.9);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.community-post-card__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 12px;
  font-size: 13px;
}

.community-panel__head,
.community-detail__header {
  margin-bottom: 14px;
}

.community-detail__header {
  align-items: flex-start;
}

.community-panel-action.el-button,
.community-submit-button.el-button {
  min-height: 34px;
  height: 34px;
  padding: 0 13px;
  border-radius: 9px;
  font-weight: 800;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.community-panel-action.el-button {
  border-color: rgba(191, 219, 254, 0.96);
  background: rgba(248, 250, 252, 0.96);
  color: #2563eb;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.06);
}

.community-panel-action.el-button:hover,
.community-panel-action.el-button:focus-visible {
  border-color: rgba(37, 99, 235, 0.4);
  background: rgba(239, 246, 255, 0.98);
  color: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.1);
  transform: translateY(-1px);
}

.community-submit-button.el-button {
  min-height: 36px;
  height: 36px;
  padding: 0 16px;
  border-color: rgba(37, 99, 235, 0.88);
  background: #2563eb;
  color: #fff;
  box-shadow: 0 9px 20px rgba(37, 99, 235, 0.18);
}

.community-submit-button.el-button:hover,
.community-submit-button.el-button:focus-visible {
  border-color: #1d4ed8;
  background: #1d4ed8;
  color: #fff;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22);
  transform: translateY(-1px);
}

.community-submit-button.el-button.is-loading {
  transform: none;
}

.community-panel-action.el-button :deep(span),
.community-submit-button.el-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.community-panel-action.el-button :deep(.el-icon) {
  font-size: 14px;
}

.community-detail__header h2 {
  margin: 12px 0 8px;
  font-size: clamp(22px, 2vw, 28px);
  line-height: 1.2;
}

.community-form {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
  gap: 0 14px;
}

.community-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.community-form :deep(.el-select) {
  width: 100%;
}

.community-composer__actions-shell {
  position: relative;
  z-index: 7;
  margin-top: 14px;
}

.community-composer__actions {
  justify-content: flex-end;
}

.community-composer__actions.is-floating {
  position: fixed;
  z-index: 46;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(191, 219, 254, 0.92);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.94);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(14px);
}

.community-rich-text {
  padding: 6px 0 18px;
  color: #1e293b;
  line-height: 1.75;
}

.community-detail-loading {
  padding: 18px 0 28px;
  color: #64748b;
  font-weight: 700;
}

.community-rich-text :deep(h1),
.community-rich-text :deep(h2),
.community-rich-text :deep(h3),
.community-rich-text :deep(h4),
.community-rich-text :deep(h5) {
  margin: 18px 0 10px;
  color: #0f172a;
  line-height: 1.28;
}

.community-rich-text :deep(h1) {
  font-size: 28px;
}

.community-rich-text :deep(h2) {
  font-size: 24px;
}

.community-rich-text :deep(h3) {
  font-size: 21px;
}

.community-rich-text :deep(h4) {
  font-size: 18px;
}

.community-rich-text :deep(h5) {
  font-size: 16px;
}

.community-rich-text :deep(p),
.community-rich-text :deep(ul),
.community-rich-text :deep(ol),
.community-rich-text :deep(blockquote) {
  margin: 0 0 12px;
  color: #334155;
}

.community-rich-text :deep(a) {
  color: #2563eb;
}

.community-rich-text :deep(pre) {
  overflow: auto;
  padding: 14px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
}

.community-rich-text :deep(blockquote) {
  padding-left: 14px;
  border-left: 3px solid #bfdbfe;
  color: #475569;
}

.community-actions {
  justify-content: flex-start;
  padding: 12px;
  border: 1px solid rgba(219, 234, 254, 0.86);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.72);
}

.community-like-button.el-button {
  min-width: 108px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 999px;
  background: #fff;
  color: #1d4ed8;
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
}

.community-like-button.el-button:hover,
.community-like-button.el-button:focus-visible {
  border-color: rgba(37, 99, 235, 0.5);
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.14);
}

.community-like-button.el-button.is-liked {
  border-color: transparent;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22);
}

.community-like-button.el-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.community-like-button :deep(.el-icon) {
  font-size: 15px;
}

.community-like-button strong {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 12px;
  line-height: 1;
}

.community-like-button.is-liked strong {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.community-action-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 13px;
  font-weight: 800;
}

.community-action-stat .el-icon {
  color: #2563eb;
  font-size: 15px;
}

.community-comments {
  padding-top: 16px;
}

.community-comments__head {
  margin-bottom: 12px;
}

.community-comments__loading {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(191, 219, 254, 0.86);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.92);
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
}

.community-comments__spinner {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  border: 2px solid rgba(37, 99, 235, 0.18);
  border-top-color: #2563eb;
  border-radius: 999px;
  animation: community-comments-spin 720ms linear infinite;
}

@keyframes community-comments-spin {
  to {
    transform: rotate(360deg);
  }
}

.community-status-note {
  margin-bottom: 18px;
  padding: 12px 14px;
  border: 1px solid rgba(245, 158, 11, 0.22);
  border-radius: 12px;
  background: rgba(255, 251, 235, 0.82);
  color: #92400e;
  font-size: 13px;
  font-weight: 700;
}

.community-comment-box {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.community-comment-box .el-button {
  justify-self: flex-end;
}

.community-comment-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.community-comment-item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
}

.community-comment-item__avatar {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-weight: 900;
}

.community-comment-item__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.community-comment-item strong {
  color: #0f172a;
}

.community-comment-item p {
  margin: 6px 0;
  color: #334155;
  line-height: 1.65;
}

.community-empty {
  display: flex;
  min-height: 112px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  padding: 18px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
}

.community-empty--compact {
  min-height: 72px;
}

.community-empty strong {
  color: #0f172a;
}

@media (max-width: 920px) {
  .community-board {
    grid-template-columns: 1fr;
  }

  .community-detail {
    position: static;
  }

  .community-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {

  .community-hero,
  .community-post-card__head,
  .community-detail__header,
  .community-panel__head,
  .community-post-card__meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .community-hero__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .community-hero__button {
    flex: 1 1 132px;
  }

  .community-search-bar {
    grid-template-columns: 1fr;
  }

  .community-search-submit {
    width: 100%;
  }

  .community-pagination {
    flex-wrap: wrap;
  }

  .community-page-status {
    order: -1;
    width: 100%;
  }

  .community-page-button {
    flex: 1 1 126px;
  }

  .community-hero p {
    max-width: none;
  }
}
</style>
