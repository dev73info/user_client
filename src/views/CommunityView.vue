<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HttpError, apiUrl } from '@/api/http'
import {
  acceptBountyAnswer,
  boostCommunityPost,
  cancelPostBounty,
  createCommunityComment,
  createCommunityPost,
  favoriteCommunityPost,
  getCommunityPost,
  likeCommunityComment,
  likeCommunityPost,
  listCommunityComments,
  listCommunityPosts,
  listCommunityTags,
  unlikeCommunityComment,
  unlikeCommunityPost,
  unfavoriteCommunityPost,
  updateCommunityPost,
  type CommunityComment,
  type CommunityPost,
  type CommunityTag,
  type PostBoostKind,
} from '@/api/community'
import { getMyRealnameVerification } from '@/api/realname'
import RichTextEditor from '@/components/RichTextEditor.vue'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRichHtml, sanitizeRichHtmlForEditing } from '@/utils/sanitizeHtml'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'


import {
  TButton,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TInputNumber,
  TOption,
  TSelect,
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
const replyingTo = ref<CommunityComment | null>(null)
const commentLikeLoading = ref<number | null>(null)
const favoriteLoading = ref(false)
const composerVisible = ref(false)
const editingPost = ref<CommunityPost | null>(null)
const commentDraft = ref('')
const boostingKind = ref<PostBoostKind | null>(null)
const composerPanelRef = ref<HTMLElement | null>(null)
const composerActionsShellRef = ref<HTMLElement | null>(null)
const composerActionsRef = ref<HTMLElement | null>(null)
const selectedPostContentRef = ref<HTMLElement | null>(null)
const composerActionsFloating = ref(false)
const composerActionsPlaceholderHeight = ref(0)
const composerActionsFloatingStyle = ref<Record<string, string>>({})
const showScrollTop = ref(false)
const expandedReplyIds = ref(new Set<number>())
let composerActionsResizeObserver: ResizeObserver | null = null
let selectedPostRequestId = 0

const BOOST_OPTIONS: { kind: PostBoostKind; label: string; cost: number; desc: string }[] = [
  { kind: 'bump', label: '上浮', cost: 50, desc: '帖子排到列表顶部持续 24 小时' },
  { kind: 'highlight', label: '高亮', cost: 100, desc: '帖子高亮标识持续 72 小时' },
  { kind: 'homepage', label: '首页推荐', cost: 200, desc: '首页推荐位持续 24 小时' },
  { kind: 'section', label: '板块推荐', cost: 120, desc: '板块推荐位持续 48 小时' },
  { kind: 'hot', label: '热门展示', cost: 150, desc: '进入热门榜单展示 48 小时' },
]

const postForm = reactive({
  title: '',
  tag_names: [] as string[],
  content_html: '',
  origin_type: 'original' as 'original' | 'repost',
  origin_author: '',
  origin_url: '',
  origin_org: '',
  origin_note: '',
  bounty_points: 0,
})

const currentPostContent = computed(() =>
  selectedPost.value?.content_html ? sanitizeRichHtml(selectedPost.value.content_html) : '',
)

const orderedComments = computed(() => {
  const childrenByParent = new Map<number | null, CommunityComment[]>()
  for (const comment of comments.value) {
    const parentId = comment.parent_comment_id ?? null
    const children = childrenByParent.get(parentId) ?? []
    children.push(comment)
    childrenByParent.set(parentId, children)
  }

  const ordered: CommunityComment[] = []
  const appendComments = (parentId: number | null) => {
    for (const comment of childrenByParent.get(parentId) ?? []) {
      ordered.push(comment)
      appendComments(comment.id)
    }
  }
  appendComments(null)
  return ordered
})

const commentFloors = computed(() => {
  const floors = new Map<number, number>()
  orderedComments.value.forEach((comment, index) => {
    floors.set(comment.id, index + 1)
  })
  return floors
})

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
const canBoostSelectedPost = computed(() =>
  Boolean(
    auth.isAuthed &&
      selectedPost.value &&
      selectedPost.value.status === 'published' &&
      selectedPost.value.author === auth.username,
  ),
)
const activeBoostLabels = computed<string[]>(() => {
  const post = selectedPost.value
  if (!post) return []
  const labels: string[] = []
  if (post.highlight_until && new Date(post.highlight_until) > new Date()) labels.push('高亮')
  if (post.homepage_until && new Date(post.homepage_until) > new Date()) labels.push('首页推荐')
  if (post.section_until && new Date(post.section_until) > new Date()) labels.push('板块推荐')
  if (post.hot_until && new Date(post.hot_until) > new Date()) labels.push('热门展示')
  return labels
})
const selectedPostShareTargetId = computed(() =>
  selectedPost.value && selectedPostPublished.value ? String(selectedPost.value.id) : '',
)
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
  const floats = panelRect.top < floatingTop
  const coversBottom =
    panelRect.bottom > viewportHeight - bottom + actionsHeight + viewportGap

  // 滞回（hysteresis）：进入/退出漂浮采用不同的判定阈值，避免在临界处反复切换导致闪烁。
  let canFloat
  if (composerActionsFloating.value) {
    canFloat = floats && panelRect.bottom > viewportHeight - bottom + actionsHeight + 4
  } else {
    canFloat = floats && coversBottom
  }

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

function observeComposerActions() {
  composerActionsResizeObserver?.disconnect()
  composerActionsResizeObserver = null

  // 仅观察内容面板，不观察 shell/操作按钮（它们会随漂浮状态改变，形成反馈循环导致闪烁）。
  if (typeof ResizeObserver !== 'undefined' && composerVisible.value) {
    composerActionsResizeObserver = new ResizeObserver(updateFloatingComposerActions)
    if (composerPanelRef.value) {
      composerActionsResizeObserver.observe(composerPanelRef.value)
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
  window.addEventListener('scroll', updateFloatingComposerActions, true)
  window.addEventListener('scroll', updateScrollTopVisibility, true)
  window.addEventListener('resize', updateFloatingComposerActions)
  updateScrollTopVisibility()
})

onBeforeUnmount(() => {
  composerActionsResizeObserver?.disconnect()
  window.removeEventListener('scroll', updateFloatingComposerActions, true)
  window.removeEventListener('scroll', updateScrollTopVisibility, true)
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
  replyingTo.value = null
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
  postForm.origin_type = 'original'
  postForm.origin_author = ''
  postForm.origin_url = ''
  postForm.origin_org = ''
  postForm.origin_note = ''
  postForm.bounty_points = 0
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
    postForm.content_html = sanitizeRichHtmlForEditing(detail.content_html)
    postForm.origin_type = detail.origin_type
    postForm.origin_author = detail.origin_author ?? ''
    postForm.origin_url = detail.origin_url ?? ''
    postForm.origin_org = detail.origin_org ?? ''
    postForm.origin_note = detail.origin_note ?? ''
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

  if (postForm.origin_type === 'repost' && !postForm.origin_url.trim()) {
    showToast('转载帖子必须填写原始出处链接', 'warning')
    return
  }

  savingPost.value = true
  try {
    const editingId = editingPost.value?.id
    const baseline = {
      title: postForm.title.trim(),
      tag_names: postForm.tag_names.map((tag) => tag.trim()).filter(Boolean),
      content_html: sanitizeRichHtml(postForm.content_html),
      origin_type: postForm.origin_type,
      origin_author: postForm.origin_author.trim() || null,
      origin_url: postForm.origin_url.trim() || null,
      origin_org: postForm.origin_org.trim() || null,
      origin_note: postForm.origin_note.trim() || null,
    }
    // 悬赏积分仅在发帖时提交（编辑不改变悬赏）。
    const payload = isEditing
      ? baseline
      : { ...baseline, bounty_points: Math.max(0, Math.trunc(postForm.bounty_points || 0)) }
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

// ---------- 帖子推广（积分消费） ----------

async function handleBoost(kind: PostBoostKind) {
  if (!ensureAuthed() || !selectedPost.value || boostingKind.value) {
    return
  }
  const option = BOOST_OPTIONS.find((item) => item.kind === kind)
  if (!option) {
    return
  }
  const confirmed = window.confirm(
    `确认花费 ${option.cost} 积分购买「${option.label}」推广？${option.desc}。`,
  )
  if (!confirmed) {
    return
  }

  boostingKind.value = kind
  try {
    const updated = await boostCommunityPost(auth.token, selectedPost.value.id, kind)
    updateSelectedPost({
      bumped_at: updated.bumped_at,
      highlight_until: updated.highlight_until,
      homepage_until: updated.homepage_until,
      section_until: updated.section_until,
      hot_until: updated.hot_until,
    })
    showToast(`已购买「${option.label}」推广`, 'success')
    // 刷新列表以反映排序与推广标识。
    void loadCommunityData()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '购买推广失败', 'error')
  } finally {
    boostingKind.value = null
  }
}

// ---------- 悬赏 ----------

const selectedPostBountyLabel = computed(() => {
  const post = selectedPost.value
  if (!post || post.bounty_points <= 0) return ''
  if (post.bounty_status === 'closed') return '悬赏已采纳'
  if (post.bounty_status === 'cancelled') return '悬赏已取消'
  return `悬赏 ${post.bounty_points} 积分`
})

const canCancelBounty = computed(() => {
  const post = selectedPost.value
  return Boolean(
    auth.isAuthed &&
      post &&
      post.bounty_status === 'active' &&
      post.bounty_points > 0 &&
      post.author === auth.username,
  )
})

const canAcceptBounty = computed(() => {
  const post = selectedPost.value
  return Boolean(
    auth.isAuthed &&
      post &&
      post.bounty_status === 'active' &&
      post.bounty_points > 0 &&
      post.author === auth.username,
  )
})

function isAcceptedComment(comment: CommunityComment): boolean {
  const post = selectedPost.value
  return Boolean(
    post && post.bounty_accepted_comment_id != null && post.bounty_accepted_comment_id === comment.id,
  )
}

async function acceptBountyAnswerHandler(comment: CommunityComment) {
  if (!ensureAuthed() || !selectedPost.value) {
    return
  }
  try {
    const updated = await acceptBountyAnswer(auth.token, selectedPost.value.id, comment.id)
    updateSelectedPost({
      bounty_status: updated.bounty_status,
      bounty_accepted_comment_id: updated.bounty_accepted_comment_id,
    })
    showToast(`已采纳 ${comment.commenter} 的回答，悬赏积分已发放`, 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '采纳回答失败', 'error')
  }
}

async function cancelBountyHandler() {
  if (!ensureAuthed() || !selectedPost.value) {
    return
  }
  try {
    const updated = await cancelPostBounty(auth.token, selectedPost.value.id)
    updateSelectedPost({
      bounty_status: updated.bounty_status,
      bounty_accepted_comment_id: updated.bounty_accepted_comment_id,
    })
    showToast('已取消悬赏，积分已退回', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '取消悬赏失败', 'error')
  }
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

async function toggleFavorite(post: CommunityPost) {
  if (!ensureAuthed()) {
    return
  }
  if (post.status !== 'published' || favoriteLoading.value) {
    showToast('帖子公开后才能收藏', 'warning')
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
    showToast(error instanceof Error ? error.message : '收藏帖子失败', 'error')
  } finally {
    favoriteLoading.value = false
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
      replyingTo.value?.id,
    )
    comments.value = [...comments.value, created]
    updateSelectedPost({ comment_count: (selectedPost.value.comment_count ?? 0) + 1 })
    commentDraft.value = ''
    replyingTo.value = null
    showToast('评论已发布', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发表评论失败', 'error')
  } finally {
    sendingComment.value = false
  }
}

function replyToComment(comment: CommunityComment) {
  if (!ensureAuthed()) {
    return
  }
  replyingTo.value = comment
}

function parentCommenter(comment: CommunityComment): string {
  if (comment.parent_commenter?.trim()) {
    return comment.parent_commenter.trim()
  }
  if (!comment.parent_comment_id) {
    return ''
  }
  return comments.value.find((item) => item.id === comment.parent_comment_id)?.commenter ?? ''
}

function parentCommentText(comment: CommunityComment): string {
  if (!comment.parent_comment_id) {
    return ''
  }
  return comments.value.find((item) => item.id === comment.parent_comment_id)?.comment_text?.trim() ?? ''
}

function truncateCommentText(text: string, maxLength = 56): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function commentDepth(comment: CommunityComment): number {
  let depth = 0
  let parentId = comment.parent_comment_id ?? null
  const visited = new Set<number>()
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    depth += 1
    parentId = comments.value.find((item) => item.id === parentId)?.parent_comment_id ?? null
  }
  return depth
}

function threadRootId(comment: CommunityComment): number {
  let rootId = comment.id
  let parentId = comment.parent_comment_id ?? null
  const visited = new Set<number>()
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    rootId = parentId
    parentId = comments.value.find((item) => item.id === parentId)?.parent_comment_id ?? null
  }
  return rootId
}

function threadReplies(rootId: number): CommunityComment[] {
  return orderedComments.value.filter(
    (comment) => comment.id !== rootId && threadRootId(comment) === rootId,
  )
}

function replyIndex(comment: CommunityComment): number {
  if (!comment.parent_comment_id) {
    return -1
  }
  return threadReplies(threadRootId(comment)).findIndex((item) => item.id === comment.id)
}

function isReplyCollapsed(comment: CommunityComment): boolean {
  const rootId = threadRootId(comment)
  if (!comment.parent_comment_id || expandedReplyIds.value.has(rootId)) {
    return false
  }
  return replyIndex(comment) >= 3
}

function shouldShowReplyToggle(comment: CommunityComment): boolean {
  const rootId = threadRootId(comment)
  return Boolean(
    comment.parent_comment_id &&
      replyIndex(comment) === 3 &&
      threadReplies(rootId).length > 3 &&
      !expandedReplyIds.value.has(rootId),
  )
}

function shouldShowCollapseToggle(comment: CommunityComment): boolean {
  const rootId = threadRootId(comment)
  const replies = threadReplies(rootId)
  return Boolean(
    comment.parent_comment_id &&
      expandedReplyIds.value.has(rootId) &&
      replies.length > 3 &&
      replyIndex(comment) === replies.length - 1,
  )
}

function hiddenReplyCount(rootId: number): number {
  return Math.max(0, threadReplies(rootId).length - 3)
}

function toggleReplies(rootId: number) {
  const nextExpandedReplyIds = new Set(expandedReplyIds.value)
  if (nextExpandedReplyIds.has(rootId)) {
    nextExpandedReplyIds.delete(rootId)
  } else {
    nextExpandedReplyIds.add(rootId)
  }
  expandedReplyIds.value = nextExpandedReplyIds
}

async function toggleCommentLike(comment: CommunityComment) {
  if (!ensureAuthed() || commentLikeLoading.value === comment.id) {
    return
  }

  commentLikeLoading.value = comment.id
  try {
    const state = comment.liked_by_me
      ? await unlikeCommunityComment(auth.token, comment.id)
      : await likeCommunityComment(auth.token, comment.id)
    comments.value = comments.value.map((item) =>
      item.id === comment.id
        ? { ...item, liked_by_me: state.liked_by_me, like_count: state.like_count }
        : item,
    )
  } catch (error) {
    showToast(error instanceof Error ? error.message : '点赞评论失败', 'error')
  } finally {
    commentLikeLoading.value = null
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
        <section v-if="composerVisible" ref="composerPanelRef" class="community-panel community-composer">
          <div class="community-panel__head">
            <div>
              <h3>{{ editingPost ? '更新社区内容' : '写一篇新帖子' }}</h3>
            </div>
            <TButton variant="outline" class="community-panel-action" @click="closeComposer">
              <span>取消</span>
            </TButton>
          </div>

          <TForm label-position="top" class="community-form">
            <TFormItem label="标题" class="community-form-item--full">
              <TInput show-count v-model="postForm.title"  :maxlength="80" placeholder="写一个清楚的标题" />
            </TFormItem>
            <TFormItem label="标签">
              <TSelect v-model="postForm.tag_names" multiple filterable
                placeholder="选择或输入标签">
                <TOption v-for="tag in tagOptions" :key="tag" :label="tag" :value="tag" />
              </TSelect>
            </TFormItem>
            <TFormItem label="类型">
              <TSelect v-model="postForm.origin_type" style="width: 160px">
                <TOption label="原创" value="original" />
                <TOption label="转载" value="repost" />
              </TSelect>
            </TFormItem>
            <TFormItem v-if="!editingPost" label="悬赏积分" class="community-form-item--full">
              <div class="community-bounty-field">
                <TInputNumber v-model="postForm.bounty_points" :min="0" :max="10000" :step="10"
                  :precision="0" />
                <span class="community-bounty-field__unit">积分</span>
              </div>
              <div class="community-form__hint">
                设置悬赏后，被采纳的回答可获得对应积分；发布时扣除，未采纳可取消退回。
              </div>
            </TFormItem>
            <template v-if="postForm.origin_type === 'repost'">
              <TFormItem label="原作者">
                <TInput v-model="postForm.origin_author"  :maxlength="80" placeholder="原始内容的作者" />
              </TFormItem>
              <TFormItem label="原始出处链接" required>
                <TInput v-model="postForm.origin_url"  :maxlength="500" placeholder="转载内容的原始出处 URL" />
              </TFormItem>
              <TFormItem label="来源站点">
                <TInput v-model="postForm.origin_org"  :maxlength="80" placeholder="例如：苦力怕论坛、CurseForge" />
              </TFormItem>
              <TFormItem label="转载说明 / 授权">
                <TInput v-model="postForm.origin_note"  :maxlength="500" placeholder="授权情况、转载说明等（可选）" />
              </TFormItem>
            </template>
          </TForm>

          <RichTextEditor v-model="postForm.content_html" :floating-toolbar-top="86" @notify="showToast" />

          <div ref="composerActionsShellRef" class="community-composer__actions-shell"
            :style="composerActionsShellStyle">
            <div ref="composerActionsRef" class="community-composer__actions"
              :class="{ 'is-floating': composerActionsFloating }" :style="composerActionsFloatingStyle">
              <TButton variant="solid" tone="accent" class="community-submit-button community-composer__actions"
                :loading="savingPost" @click="submitPost">
                {{ editingPost ? '保存修改' : '发布帖子' }}
              </TButton>
            </div>
          </div>
        </section>

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
                    <span v-if="selectedPost.bounty_points > 0" class="community-bounty-badge"
                      :class="`is-${selectedPost.bounty_status}`">
                      {{ selectedPostBountyLabel }}
                    </span>
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
            <TButton variant="outline" tone="warning" v-if="canCancelBounty" class="community-bounty-cancel-button"
              @click="cancelBountyHandler">
              取消悬赏
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
            <div v-else-if="!replyingTo" class="community-comment-box">
              <TInput show-count v-model="commentDraft" type="textarea" :rows="3"  :maxlength="800"
                placeholder="说点具体的想法或补充" />
              <TButton variant="solid" tone="accent" class="community-submit-button community-comment-submit"
                :loading="sendingComment" @click="submitComment">
                发表评论
              </TButton>
            </div>

            <div v-if="!commentsLoading && comments.length === 0" class="community-empty community-empty--compact">
              暂无评论
            </div>
            <ul v-else class="community-comment-list">
              <template v-for="comment in orderedComments" :key="comment.id">
                <button v-if="shouldShowReplyToggle(comment)" class="community-replies-toggle" type="button"
                  @click="toggleReplies(threadRootId(comment))">
                  展开 {{ hiddenReplyCount(threadRootId(comment)) }} 条回复
                </button>
                <li v-if="!isReplyCollapsed(comment)" class="community-comment-item"
                  :class="{ 'is-reply': comment.parent_comment_id, 'is-accepted': isAcceptedComment(comment) }"
                  :style="{ '--comment-depth': String(commentDepth(comment)) }">
                <div class="community-comment-item__avatar">
                  <img v-if="commentAvatarSrc(comment)" :src="commentAvatarSrc(comment)"
                    :alt="`${comment.commenter} 的头像`" @error="handleCommentAvatarError(comment)" />
                  <span v-else>{{ avatarInitial(comment.commenter) }}</span>
                </div>
                <div class="community-comment-item__body">
                  <strong
                    :class="{ 'username-gradient': comment.commenter_username_gradient && !comment.commenter_username_color }"
                    :style="comment.commenter_username_color ? { color: comment.commenter_username_color } : {}"
                  >{{ comment.commenter }}</strong>
                  <span v-if="isAcceptedComment(comment)" class="community-comment-item__accepted">已采纳</span>
                  <span class="community-comment-item__floor">#{{ commentFloors.get(comment.id) }}</span>
                  <div v-if="parentCommenter(comment) || parentCommentText(comment)"
                    class="community-comment-item__reply-context">
                    <span v-if="parentCommenter(comment)" class="community-comment-item__reply-to">
                      回复 @{{ parentCommenter(comment) }}
                    </span>
                    <span v-if="parentCommentText(comment)" class="community-comment-item__reply-quote"
                      :title="parentCommentText(comment)">
                      {{ truncateCommentText(parentCommentText(comment)) }}
                    </span>
                  </div>
                  <p>{{ comment.comment_text }}</p>
                  <div class="community-comment-item__actions">
                    <button v-if="canAcceptBounty && comment.commenter !== selectedPost?.author && !isAcceptedComment(comment)"
                      type="button" class="community-comment-item__accept"
                      @click="acceptBountyAnswerHandler(comment)">
                      采纳
                    </button>
                    <button type="button" @click="replyToComment(comment)">回复</button>
                    <button type="button" :class="{ 'is-liked': comment.liked_by_me }"
                      :disabled="commentLikeLoading === comment.id" @click="toggleCommentLike(comment)">
                      {{ comment.liked_by_me ? '已赞' : '赞' }}
                      <span>{{ comment.like_count || 0 }}</span>
                    </button>
                    <time>{{ comment.created_at }}</time>
                  </div>
                  <div v-if="replyingTo?.id === comment.id" class="community-inline-reply-box">
                    <div class="community-comment-replying">
                      回复 {{ comment.commenter }}
                      <button class="community-reply-cancel" type="button" @click="replyingTo = null">
                        取消回复
                      </button>
                    </div>
                    <TInput show-count v-model="commentDraft" type="textarea" :rows="3"  :maxlength="800" :placeholder="`回复 ${comment.commenter}：`" />
                    <TButton variant="solid" tone="accent" class="community-submit-button community-comment-submit"
                      :loading="sendingComment" @click="submitComment">
                      发表评论
                    </TButton>
                  </div>
                </div>
                </li>
                <button v-if="shouldShowCollapseToggle(comment)" class="community-replies-toggle" type="button"
                  @click="toggleReplies(threadRootId(comment))">
                  收起
                </button>
              </template>
            </ul>
          </section>
        </section>

        <section v-else class="community-panel community-empty">
          <strong>选择一篇帖子查看详情</strong>
        </section>
      </aside>
    </section>

    <button v-if="showScrollTop" class="community-scroll-top" type="button" aria-label="回到顶部"
      title="回到顶部" @click="scrollToTop">
      <TIcon>
        <Top />
      </TIcon>
    </button>
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

.community-bounty-badge {
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
.community-bounty-badge.is-active {
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
}
.community-bounty-badge.is-closed {
  color: #1d4ed8;
  background: #dbeafe;
  border: 1px solid #93c5fd;
}
.community-bounty-badge.is-cancelled {
  color: #64748b;
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
}
.community-bounty-cancel-button {
  margin-left: 8px;
}
.community-bounty-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.community-bounty-field__unit {
  font-size: 13px;
  color: #64748b;
}
.community-form__hint {
  width: 100%;
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.6;
}
.community-comment-item.is-accepted {
  /* 采纳标记的琥珀色：与下面「已采纳」角标（#b45309 / #fef3c7）同一支色相 */
  border-color: #e6a23c !important;
  background: #fdf6ec;
}
.community-comment-item__accepted {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
}
.community-comment-item__actions .community-comment-item__accept {
  color: #b45309;
  border-color: #fcd34d;
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
.community-empty,
.community-comment-item time {
  color: #64748b;
  line-height: 1.7;
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

.community-panel__head,
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

.community-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.community-form-item--full {
  grid-column: 1 / -1;
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

.community-comment-replying {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-left: 3px solid #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.community-comment-replying button,
.community-comment-item__actions button {
  border: 0;
  padding: 0;
  background: transparent;
  color: #64748b;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.community-comment-replying button:hover,
.community-comment-item__actions button:hover,
.community-comment-item__actions button.is-liked {
  color: #2563eb;
}

.community-inline-reply-box {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.community-inline-reply-box .community-comment-replying {
  padding: 0;
  border-left: 0;
  background: transparent;
}

.community-reply-cancel {
  min-height: 28px;
  padding: 0 10px !important;
  border: 1px solid rgba(148, 163, 184, 0.5) !important;
  border-radius: 7px;
  background: #fff !important;
  color: #475569 !important;
  font-size: 12px !important;
  font-weight: 700;
}

.community-reply-cancel:hover {
  border-color: rgba(37, 99, 235, 0.5) !important;
  background: #eff6ff !important;
  color: #2563eb !important;
}

.community-inline-reply-box .community-comment-submit {
  justify-self: end;
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
  align-items: start;
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

.community-comment-item__body {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.72);
}

.community-comment-item__floor {
  margin-left: 6px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
}

.community-comment-item.is-reply {
  margin-left: 28px;
}

.community-replies-toggle {
  display: block;
  margin: -4px 0 -2px 50px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.community-replies-toggle:hover,
.community-replies-toggle:focus-visible {
  color: #1d4ed8;
  text-decoration: underline;
}

.community-comment-item__reply-to {
  flex-shrink: 0;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.community-comment-item__reply-context {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
  margin-top: 3px;
  line-height: 1.5;
}

.community-comment-item__reply-quote {
  min-width: 0;
  overflow: hidden;
  color: #94a3b8;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.community-comment-item strong {
  color: #0f172a;
}

.community-comment-item p {
  margin: 6px 0;
  color: #334155;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.community-comment-item time {
  display: block;
  margin-left: auto;
  color: #94a3b8;
  font-size: 11px;
  text-align: right;
}

.community-comment-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.community-comment-item__actions button {
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
}

.community-comment-item__actions button span {
  margin-left: 3px;
  color: #94a3b8;
  font-size: 11px;
}

.community-comment-item__actions button:hover,
.community-comment-item__actions button.is-liked {
  border-color: rgba(147, 197, 253, 0.9);
  background: #eff6ff;
}

.community-comment-item__actions button:disabled {
  cursor: wait;
  opacity: 0.6;
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

  .community-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {

  .community-hero,
  .community-detail__header,
  .community-detail__title-row,
  .community-panel__head,
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
