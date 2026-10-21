<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  favoriteCommunityPost,
  getCommunityPost,
  likeCommunityPost,
  listCommunityPosts,
  listCommunityTags,
  unlikeCommunityPost,
  unfavoriteCommunityPost,
  type CommunityPost,
  type CommunityTag,
  type PostBoostKind,
} from '@/api/community'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import CommunityBountyBar from '@/components/community/CommunityBountyBar.vue'
import CommunityCommentTree from '@/components/community/CommunityCommentTree.vue'
import CommunityComposerPanel from '@/components/community/CommunityComposerPanel.vue'
import CommunityScrollTopButton from '@/components/community/CommunityScrollTopButton.vue'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
import { useCommunityBounty } from '@/composables/useCommunityBounty'
import { useCommunityBoost } from '@/composables/useCommunityBoost'
import { useCommunityComments } from '@/composables/useCommunityComments'
import { useCommunityComposer } from '@/composables/useCommunityComposer'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'


import {
  TButton,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TIcon,
  TMessage,
  ArrowLeft,
  ArrowRight,
  ChatDotRound,
  Close,
  EditPen,
  Plus,
  Refresh,
  Search,
  Star,
  Top,
} from 'ui_73info'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  TMessage[type](message)
}
const POSTS_PER_PAGE = 8
const initialSearchKeyword =
  typeof route.query.keyword === 'string' ? route.query.keyword.trim() : ''

const posts = ref<CommunityPost[]>([])
const tags = ref<CommunityTag[]>([])
const selectedPost = ref<CommunityPost | null>(null)
const selectedTag = ref('')
const searchDraft = ref(initialSearchKeyword)
const searchKeyword = ref(initialSearchKeyword)
const currentPage = ref(1)
const hasNextPage = ref(false)
const loading = ref(false)
const selectedPostLoading = ref(false)
const favoriteLoading = ref(false)
const selectedPostContentRef = ref<HTMLElement | null>(null)
const showScrollTop = ref(false)
// 换帖竞态计数器：评论与详情两路请求共用（评论域只读它，见 useCommunityComments 的 isCurrentRequest）
let selectedPostRequestId = 0

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
const canEditSelectedPost = computed(() =>
  Boolean(auth.isAuthed && selectedPost.value && selectedPost.value.author === auth.username),
)
const selectedPostPublished = computed(() => selectedPost.value?.status === 'published')
const selectedPostShareTargetId = computed(() =>
  selectedPost.value && selectedPostPublished.value ? String(selectedPost.value.id) : '',
)

// v-html 里的代码块复制按钮靠这条 ref 约定定位内容容器，抽组件时不能跟着走（容器还在本页）
useCodeBlockCopy({
  rootRef: selectedPostContentRef,
  notify,
})

// 回顶按钮本身已抽成 components/community/CommunityScrollTopButton.vue，只剩「出不出」的判定
// 与滚动动作留在这里：`.app-scrollbar .t73-scrollbar__wrap` 是 App 外壳的硬编码 DOM，
// 原样保留（换外壳时要一起改的两处就在这里与 scrollToTop）。
function updateScrollTopVisibility() {
  const scrollWrap = document.querySelector<HTMLElement>('.app-scrollbar .t73-scrollbar__wrap')
  showScrollTop.value = Boolean(scrollWrap && scrollWrap.scrollTop > 240)
}

function scrollToTop() {
  const scrollWrap = document.querySelector<HTMLElement>('.app-scrollbar .t73-scrollbar__wrap')
  if (scrollWrap) {
    scrollWrap.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function postStatusText(status: CommunityPost['status']): string {
  const map: Record<CommunityPost['status'], string> = {
    pending_review: '审核中',
    published: '公开中',
    rejected: '已驳回',
  }
  return map[status]
}

function isRepostPost(post: CommunityPost): boolean {
  return post.origin_type === 'repost'
}

function repostLabel(post: CommunityPost): string {
  const parts: string[] = []
  if (post.origin_org) {
    parts.push(`转载自 ${post.origin_org}`)
  }
  if (post.origin_author) {
    parts.push(`原作者 ${post.origin_author}`)
  }
  return parts.join(' · ')
}

function postBoostLabel(post: CommunityPost): string {
  const now = Date.now()
  const labels: string[] = []
  if (post.bumped_at && new Date(post.bumped_at).getTime() > now - 2 * 24 * 60 * 60 * 1000) {
    labels.push('上浮')
  }
  if (post.highlight_until && new Date(post.highlight_until) > new Date(now)) {
    labels.push('高亮')
  }
  if (post.homepage_until && new Date(post.homepage_until) > new Date(now)) {
    labels.push('首页推荐')
  }
  if (post.section_until && new Date(post.section_until) > new Date(now)) {
    labels.push('板块推荐')
  }
  if (post.hot_until && new Date(post.hot_until) > new Date(now)) {
    labels.push('热门展示')
  }
  return labels.join(' · ')
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
  // 浮动提交条的 scroll/resize 监听与 ResizeObserver 已随 useComposerFloatingActions 搬走
  // （在那边 onMounted 注册、onScopeDispose 释放），这里只剩回顶按钮的可见性。
  window.addEventListener('scroll', updateScrollTopVisibility, true)
  updateScrollTopVisibility()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateScrollTopVisibility, true)
  resetSeoMeta()
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
    TMessage.error(error instanceof Error ? error.message : '加载社区内容失败')
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
    TMessage.error(error instanceof Error ? error.message : '加载社区帖子失败')
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
  // 换帖清场（草稿 / 回复目标 / 列表）与取数都在评论域里，这里只按顺序调用
  resetComments()
  if (post) {
    if (post.content_html) {
      selectedPostLoading.value = false
    } else {
      void loadSelectedPostDetail(post.id, requestId)
    }
    void loadComments(post.id, requestId)
  } else {
    selectedPostLoading.value = false
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
  resetComments()

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
      TMessage.error(error instanceof Error ? error.message : '加载帖子详情失败')
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
      TMessage.error(error instanceof Error ? error.message : '加载帖子详情失败')
    }
  } finally {
    if (requestId === selectedPostRequestId) {
      selectedPostLoading.value = false
    }
  }
}

function ensureAuthed(): boolean {
  auth.hydrate()
  if (auth.isAuthed) {
    return true
  }
  TMessage.warning('请先登录后再操作社区内容')
  void router.push({ name: 'home', query: { modal: 'auth', redirect_to: '/community' } })
  return false
}

function updateSelectedPost(patch: Partial<CommunityPost>) {
  if (!selectedPost.value) {
    return
  }
  const postId = selectedPost.value.id
  posts.value = posts.value.map((post) => (post.id === postId ? { ...post, ...patch } : post))
  selectedPost.value = { ...selectedPost.value, ...patch }
}

// ---------- 推广与悬赏（两域已抽到 composable） ----------
//
// 两域只收「详情区正在看的帖子」这一个引用和「回写帖子」这一个口子，都不持有它们：
// `selectedPost` 是详情区 6+ 块共用的根状态，`updateSelectedPost` 是点赞 / 收藏 / 悬赏 / 推广
// 共用的那一个回写点（同时改 `posts` 列表与 `selectedPost`），仍归视图所有。
const {
  BOOST_OPTIONS,
  boostingKind,
  canBoostSelectedPost,
  activeBoostLabels,
  handleBoost,
} = useCommunityBoost({
  selectedPost,
  updateSelectedPost,
  ensureAuthed,
  refreshList: () => {
    void loadCommunityData()
  },
})

const {
  selectedPostBountyLabel,
  canManageBounty,
  acceptBountyAnswerHandler,
  cancelBountyHandler,
} = useCommunityBounty({ selectedPost, updateSelectedPost, ensureAuthed })

// ---------- 评论与发帖（两域本轮抽到 composable） ----------
//
// 两域同样只收「详情区正在看的帖子」与那几个回写口子，都不持有 `selectedPost`：
// 评论域还给 `CommunityCommentTree.vue` 铺行，发帖域给 `CommunityComposerPanel.vue` 铺表单，
// 组件本身一个 api / TMessage / router 都不碰。
const {
  commentsLoading,
  commentDraft,
  replyingTo,
  sendingComment,
  commentLikeLoading,
  rows: commentRows,
  loadComments,
  resetComments,
  submitComment,
  replyToComment,
  cancelReply,
  toggleReplies,
  toggleCommentLike,
  handleCommentAvatarError,
} = useCommunityComments({
  selectedPost,
  updateSelectedPost,
  ensureAuthed,
  // 竞态判定仍用视图的计数器，评论域只读它（不自己另立一套）
  isCurrentRequest: (requestId) => requestId === selectedPostRequestId,
})

const {
  composerVisible,
  editingPost,
  savingPost,
  postForm,
  composerActionsShellStyle,
  composerActionsFloating,
  composerActionsFloatingStyle,
  setComposerRef,
  openCreateComposer,
  openEditComposer,
  closeComposer,
  submitPost,
} = useCommunityComposer({
  selectedTag,
  ensureAuthed,
  // 保存成功后的收尾：新帖回第 1 页、重取列表、选中刚保存的那篇（顺序与改造前一致）
  onSaved: async (saved, isEditing) => {
    if (!isEditing) {
      currentPage.value = 1
    }
    await loadCommunityData()
    selectPost(saved)
  },
})

async function toggleLike(post: CommunityPost) {
  if (!ensureAuthed()) {
    return
  }

  if (post.status !== 'published') {
    TMessage.warning('帖子公开后才能点赞')
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
    TMessage.error(error instanceof Error ? error.message : '点赞失败')
  }
}

async function toggleFavorite(post: CommunityPost) {
  if (!ensureAuthed()) {
    return
  }
  if (post.status !== 'published' || favoriteLoading.value) {
    TMessage.warning('帖子公开后才能收藏')
    return
  }

  favoriteLoading.value = true
  try {
    const state = post.favorited_by_me
      ? await unfavoriteCommunityPost(auth.token, post.id)
      : await favoriteCommunityPost(auth.token, post.id)
    updateSelectedPost({ favorited_by_me: state.favorited_by_me })
    posts.value = posts.value.map((item) =>
      item.id === post.id ? { ...item, favorited_by_me: state.favorited_by_me } : item,
    )
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '收藏帖子失败')
  } finally {
    favoriteLoading.value = false
  }
}

</script>

<template>
  <main class="portal-page portal-page--nav community-page">
    <section class="community-board">
      <section class="community-stream">
        <div class="community-hero">
          <div class="community-hero__actions">
            <button class="community-hero__button community-hero__button--ghost" type="button" :disabled="loading"
              @click="loadCommunityData">
              <TIcon :class="{ 'is-spinning': loading }">
                <Refresh />
              </TIcon>
              <span>{{ loading ? '刷新中' : '刷新' }}</span>
            </button>
            <button class="community-hero__button community-hero__button--primary" type="button"
              @click="openCreateComposer">
              <TIcon>
                <Plus />
              </TIcon>
              <span>发布帖子</span>
            </button>
          </div>
        </div>

        <form class="community-search-bar" @submit.prevent="applySearch">
          <div class="community-search-field">
            <TIcon>
              <Search />
            </TIcon>
            <input v-model="searchDraft" type="text" inputmode="search" enterkeyhint="search" aria-label="搜索社区帖子"
              placeholder="搜索标题、作者、正文或标签" />
            <button v-if="searchDraft || searchKeyword" class="community-search-clear" type="button" aria-label="清空搜索"
              @click="clearSearch">
              <TIcon>
                <Close />
              </TIcon>
            </button>
          </div>
          <button class="community-search-submit" type="submit" :disabled="loading">
            <TIcon>
              <Search />
            </TIcon>
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
        </div>
        <div v-else class="community-post-list">
          <article v-for="post in posts" :key="post.id" class="community-post-card"
            :class="{ 'is-active': selectedPost?.id === post.id }" @click="selectPost(post)">
            <div class="community-post-card__head">
              <div>
                <h3>{{ post.title }}</h3>
                <p>
                  <strong :class="{ 'username-gradient': post.author_username_gradient && !post.author_username_color }" :style="post.author_username_color ? { color: post.author_username_color } : {}">{{ post.author }}</strong> ·
                  {{ post.published_at }}
                </p>
              </div>
              <div class="community-post-card__badges">
                <span v-if="post.status !== 'published'" class="community-status-badge"
                  :class="`is-${post.status}`">{{ postStatusText(post.status) }}</span>
                <span v-if="post.is_featured" class="community-featured-badge">精华</span>
                <span v-if="postBoostLabel(post)" class="community-boost-badge">{{ postBoostLabel(post) }}</span>
                <span class="community-repost-badge"
                  :class="{ 'is-repost': isRepostPost(post) }">{{ isRepostPost(post) ? '转载' : '原创' }}</span>
                <span>{{ post.like_count }} 赞</span>
              </div>
            </div>
            <div class="community-post-card__meta">
              <div class="community-post-card__tags">
                <span v-for="tag in post.tags" :key="tag.id">{{ tag.name }}</span>
              </div>
              <span>{{ post.comment_count }} 条评论</span>
              <span>更新 {{ post.updated_at }}</span>
            </div>
          </article>
        </div>

        <div v-if="!loading && (posts.length > 0 || currentPage > 1)" class="community-pagination">
          <button class="community-page-button" type="button" :disabled="currentPage <= 1" @click="goToPreviousPage">
            <TIcon>
              <ArrowLeft />
            </TIcon>
            <span>上一页</span>
          </button>
          <span class="community-page-status">{{ pageStatus }}</span>
          <button class="community-page-button" type="button" :disabled="!hasNextPage" @click="goToNextPage">
            <span>下一页</span>
            <TIcon>
              <ArrowRight />
            </TIcon>
          </button>
        </div>
      </section>

      <aside class="community-detail">
        <CommunityComposerPanel
          v-if="composerVisible"
          v-model:title="postForm.title"
          v-model:tag-names="postForm.tag_names"
          v-model:content-html="postForm.content_html"
          v-model:origin-type="postForm.origin_type"
          v-model:origin-author="postForm.origin_author"
          v-model:origin-url="postForm.origin_url"
          v-model:origin-org="postForm.origin_org"
          v-model:origin-note="postForm.origin_note"
          v-model:bounty-points="postForm.bounty_points"
          :editing="Boolean(editingPost)"
          :saving="savingPost"
          :tag-options="tagOptions"
          :floating="composerActionsFloating"
          :shell-style="composerActionsShellStyle"
          :floating-style="composerActionsFloatingStyle"
          :set-ref="setComposerRef"
          @close="closeComposer"
          @submit="submitPost"
          @notify="notify"
        />

        <section v-else-if="selectedPost" class="community-panel community-post-detail">
          <div class="community-detail__header">
            <div class="community-detail__main">
              <div class="community-detail__title-row">
                <div class="community-detail__title">
                  <div class="community-post-card__tags">
                    <span v-for="tag in selectedPost.tags" :key="tag.id">{{ tag.name }}</span>
                  </div>
                  <h2>
                    {{ selectedPost.title }}
                    <span v-if="selectedPost.is_featured" class="community-featured-badge">精华</span>
                    <span v-if="activeBoostLabels.length" class="community-boost-badge">{{ activeBoostLabels.join(' · ') }}</span>
                  </h2>
                </div>
                <TButton variant="outline" v-if="canEditSelectedPost" class="community-panel-action"
                  @click="openEditComposer(selectedPost)">
                  <TIcon>
                    <EditPen />
                  </TIcon>
                  <span>编辑</span>
                </TButton>
              </div>
              <div class="community-detail__meta">
                <div class="community-detail__author">
                  <strong :class="{ 'username-gradient': selectedPost.author_username_gradient && !selectedPost.author_username_color }" :style="selectedPost.author_username_color ? { color: selectedPost.author_username_color } : {}">{{ selectedPost.author }}</strong>
                  <span class="community-repost-badge"
                    :class="{ 'is-repost': isRepostPost(selectedPost) }">{{ isRepostPost(selectedPost) ? '转载' : '原创' }}</span>
                </div>
                <p class="community-detail__post-time">
                  发布于 {{ selectedPost.published_at }} · 更新 {{ selectedPost.updated_at }}
                </p>
                <div v-if="isRepostPost(selectedPost)" class="community-detail__repost">
                  <a v-if="selectedPost.origin_url" :href="selectedPost.origin_url" target="_blank"
                    rel="nofollow noopener">{{ repostLabel(selectedPost) || '查看原始出处' }}</a>
                  <span v-else>{{ repostLabel(selectedPost) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 悬赏条：徽标 + 作者的取消入口，整块在 components/community/CommunityBountyBar.vue -->
          <CommunityBountyBar
            :label="selectedPostBountyLabel"
            :status="selectedPost.bounty_status"
            :can-cancel="canManageBounty"
            @cancel="cancelBountyHandler"
          />

          <div v-if="selectedPostLoading" class="community-detail-loading" role="status">
            正文加载中...
          </div>
          <article v-else ref="selectedPostContentRef" class="community-rich-text" v-html="currentPostContent">
          </article>

          <div class="community-actions">
            <TButton class="community-like-button" :class="{ 'is-liked': selectedPost.liked_by_me }"
              :tone="selectedPost.liked_by_me ? 'accent' : 'neutral'" :disabled="!selectedPostPublished"
              @click="toggleLike(selectedPost)">
              <TIcon>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m0 11V10l4-8a3 3 0 0 1 3 3v4h5.4a2 2 0 0 1 2 2.3l-1.2 8A2 2 0 0 1 18.2 21H7Z" />
                </svg>
              </TIcon>
              <span>{{ selectedPost.liked_by_me ? '已点赞' : '点赞' }}</span>
              <strong>{{ selectedPost.like_count }}</strong>
            </TButton>
            <TButton class="community-favorite-button" :class="{ 'is-favorited': selectedPost.favorited_by_me }"
              :tone="selectedPost.favorited_by_me ? 'warning' : 'neutral'"
              :disabled="!selectedPostPublished || favoriteLoading" @click="toggleFavorite(selectedPost)">
              <TIcon><Star /></TIcon>
              <span>{{ selectedPost.favorited_by_me ? '已收藏' : '收藏' }}</span>
            </TButton>
            <TDropdown v-if="canBoostSelectedPost" trigger="click"
              @command="(cmd) => handleBoost(cmd as PostBoostKind)">
              <TButton variant="outline" tone="accent" class="community-boost-button" :loading="boostingKind !== null">
                <TIcon><Top /></TIcon>
                <span>推广</span>
              </TButton>
              <template #dropdown>
                <TDropdownMenu>
                  <TDropdownItem v-for="option in BOOST_OPTIONS" :key="option.kind"
                    :command="option.kind" :disabled="boostingKind !== null">
                    {{ option.label }} · {{ option.cost }} 积分
                  </TDropdownItem>
                </TDropdownMenu>
              </template>
            </TDropdown>
            <ShareCardGenerator v-if="auth.isAuthed && selectedPostShareTargetId" share-type="community_post"
              :target-id="selectedPostShareTargetId" />
            <span class="community-action-stat">
              <TIcon>
                <ChatDotRound />
              </TIcon>
              {{ selectedPost.comment_count }} 条评论
            </span>
          </div>

          <!-- 评论整块（标题行 + 同步指示 + 输入框 + 评论树）在 components/community/CommunityCommentTree.vue -->
          <CommunityCommentTree
            v-model:draft="commentDraft"
            :rows="commentRows"
            :loading="commentsLoading"
            :published="selectedPostPublished"
            :replying-to-id="replyingTo?.id ?? null"
            :sending="sendingComment"
            :like-loading-id="commentLikeLoading"
            :can-manage-bounty="canManageBounty"
            :author-name="selectedPost.author"
            :accepted-comment-id="selectedPost.bounty_accepted_comment_id ?? null"
            @submit="submitComment"
            @reply="replyToComment"
            @cancel-reply="cancelReply"
            @like="toggleCommentLike"
            @accept="acceptBountyAnswerHandler"
            @toggle-threads="toggleReplies"
            @avatar-error="handleCommentAvatarError"
          />
        </section>

        <section v-else class="community-panel community-empty">
          <strong>选择一篇帖子查看详情</strong>
        </section>
      </aside>
    </section>

    <CommunityScrollTopButton :visible="showScrollTop" @scroll="scrollToTop" />
  </main>
</template>

<style scoped>
.community-board {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.community-scroll-top {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 20;
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.96);
  color: #2563eb;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.16);
  cursor: pointer;
  transition: background-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}

.community-scroll-top:hover,
.community-scroll-top:focus-visible {
  background: #eff6ff;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.22);
  transform: translateY(-2px);
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

.community-stream {
  position: sticky;
  top: 76px;
}

.community-detail {
  position: sticky;
  top: 76px;
  min-width: 0;
}

@media (max-width: 1180px) and (min-width: 921px) {
  .community-stream,
  .community-detail {
    top: 136px;
  }
}

.community-hero {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 10px;
  padding: 0 0 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
}

.community-hero h2,
.community-panel h2,
.community-post-card h3 {
  margin: 0;
  color: #0f172a;
}

.community-hero h2 {
  margin-top: 4px;
  font-size: 22px;
  line-height: 1.25;
}

.community-detail__header .community-detail__main {
  min-width: 0;
  flex: 1 1 auto;
}

.community-detail__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.community-detail__title-row .community-detail__title {
  min-width: 0;
}

.community-featured-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
  vertical-align: middle;
  white-space: nowrap;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
}
.community-post-card__badges .community-featured-badge {
  margin-left: 0;
  padding: 1px 8px;
  font-size: 11px;
}
.community-boost-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
  vertical-align: middle;
  white-space: nowrap;
  color: #6d28d9;
  background: #ede9fe;
  border: 1px solid #c4b5fd;
}
.community-post-card__badges .community-boost-badge {
  margin-left: 0;
  padding: 1px 8px;
  font-size: 11px;
}
.community-boost-button {
  margin-left: 8px;
}
.community-detail__header .community-detail__meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.community-detail__header .community-detail__author {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.community-detail__header .community-detail__author strong {
  font-size: 15px;
  color: #0f172a;
  font-weight: 700;
}

.community-detail__header .community-detail__post-time {
  white-space: nowrap;
  margin: 0 0 0 auto;
}

.community-detail__header p,
.community-post-card p,
.community-post-card__meta,
.community-actions,
.community-empty {
  color: #64748b;
  line-height: 1.7;
}

.community-hero__actions,
.community-detail__header,
.community-actions {
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
  gap: 5px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 10px;
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

/* 刷新全站只留图标与文字，不出底色与描边（口径见 styles/user.css） */
.community-hero__button--ghost {
  border-color: transparent;
  background: transparent;
  color: #2563eb;
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

@keyframes community-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 搜索行收成一个整体控件：外框由 search-bar 承担，输入区去掉自身描边，
   搜索按钮退成框内的浅色小控件，不再比输入框抢眼 */
.community-search-bar {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 0 4px 0 10px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.92);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.community-search-bar:focus-within {
  border-color: rgba(37, 99, 235, 0.44);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.community-search-field {
  display: flex;
  min-width: 0;
  min-height: 36px;
  flex: 1 1 auto;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #64748b;
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
  flex: 0 0 auto;
  gap: 5px;
  min-height: 30px;
  padding: 0 12px;
  border-color: transparent;
  border-radius: 8px;
  background: rgba(219, 234, 254, 0.72);
  color: #2563eb;
}

.community-search-submit:hover:not(:disabled) {
  background: rgba(191, 219, 254, 0.96);
}

.community-search-submit:disabled,
.community-page-button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  transform: none;
}

/* 窄列里标签只占一行：改为横向滚动而不是换行成两行，
   滚动条走项目既有口径 scrollbar-width: thin（见 styles/dev-resource.css 的 chips--scroll） */
.community-tag-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.78);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.community-tag {
  flex: 0 0 auto;
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
  gap: 8px;
}

.community-post-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 10px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 10px;
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
  gap: 8px;
}

.community-post-card__head h3 {
  margin-bottom: 1px;
  font-size: 14px;
  line-height: 1.2;
}

.community-post-card__head p {
  line-height: 1.35;
  font-size: 12px;
}

.community-post-card__head span {
  flex-shrink: 0;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
}

.community-post-card__badges {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.community-repost-badge {
  display: inline-flex;
  width: fit-content;
  min-height: 22px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.community-repost-badge.is-repost {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

/* 卡片内标签覆盖 .community-post-card__head span 的蓝色，保持靛蓝 */
.community-post-card__badges .community-repost-badge {
  color: #4f46e5;
}

.community-post-card__badges .community-repost-badge.is-repost {
  color: #b45309;
}

.community-detail__repost {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 13px;
}

.community-detail__repost a {
  color: #6366f1;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.community-detail__repost a:hover {
  text-decoration: underline;
}

.community-status-badge {
  display: inline-flex;
  width: fit-content;
  min-height: 22px;
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
  align-items: center;
  gap: 6px;
}

.community-post-card__tags span {
  display: inline-flex;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.9);
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 800;
}

.community-post-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.35;
}

.community-detail__header {
  margin-bottom: 14px;
}

.community-detail__header {
  align-items: flex-start;
}

.community-detail__header h2 {
  margin: 12px 0 8px;
  font-size: clamp(22px, 2vw, 28px);
  line-height: 1.2;
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

.community-rich-text :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  align-self: flex-start;
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

/* 根因：共用类 .community-empty 的 min-height: 112px 是为右侧详情面板的占位撑高度用的，
   帖子流左栏里只放一行「暂无帖子」，固定高度就成了那块空洞。
   这里只给左栏做收口，不动共用规则与右侧详情面板。 */
.community-stream .community-empty {
  min-height: 0;
  padding: 14px 16px;
}

.community-empty strong {
  color: #0f172a;
}

@media (max-width: 920px) {
  .community-scroll-top {
    right: 14px;
    bottom: calc(102px + env(safe-area-inset-bottom));
    z-index: 70;
  }

  .community-board {
    grid-template-columns: 1fr;
  }

  .community-stream,
  .community-detail {
    position: static;
  }
  /* `.community-form` 的单列塌版跟着 CommunityComposerPanel.vue 走了（那边保留原断点 920px） */
}

@media (max-width: 760px) {

  /* `.community-panel__head`（编辑器头）随组件搬走，那档在组件里保留原断点 760px */
  .community-hero,
  .community-detail__header,
  .community-detail__title-row,
  .community-post-card__meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .community-post-card__head,
  .community-post-card__meta {
    flex-direction: row;
    align-items: center;
  }

  .community-detail__header .community-detail__post-time {
    white-space: normal;
  }

  .community-hero__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .community-hero__button {
    flex: 1 1 132px;
  }

  /* 搜索行已收成「输入框 + 按钮」一体的胶囊，窄屏不再上下堆叠；
     只把整体高度提到设计规范第六节的 44px 触摸目标档 */
  .community-search-bar {
    min-height: 44px;
    padding: 0 5px 0 12px;
  }

  .community-search-field {
    min-height: 42px;
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
}
</style>
