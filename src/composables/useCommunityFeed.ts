import { computed, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  favoriteCommunityPost,
  likeCommunityPost,
  listCommunityPosts,
  listCommunityTags,
  unfavoriteCommunityPost,
  unlikeCommunityPost,
  type CommunityPost,
  type CommunityTag,
} from '@/api/community'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/** 每页 8 条。接口按「多取一条」判断有没有下一页，所以请求的 limit 是 8+1、只铺前 8 条。 */
const POSTS_PER_PAGE = 8

type UseCommunityFeedOptions = {
  /** 详情区正在看的那篇。只收引用、不持有：根状态归视图，这里只在保住选中与回写时读它。 */
  selectedPost: Ref<CommunityPost | null>
  /** 选中一篇（或清空）：推进计数器、清草稿、拉详情与评论这串顺序归 `useCommunityPostDetail`。 */
  selectPost: (post: CommunityPost | null) => void
  /** 地址栏点名的那篇不在本页时按 id 单取（`useCommunityPostDetail.loadStandalonePost`）。 */
  onStandalonePost: (postId: number) => void
  /** 登录守卫：未登录时提示并跳登录弹窗，属于视图的路由动作，注入。 */
  ensureAuthed: () => boolean
}

/**
 * 社区页左栏的「帖子流」：标签 / 搜索 / 分页 / 列表，以及点赞与收藏这两下回写
 * （它们只改两处状态：本域持有的 `posts` 与回写口 `updateSelectedPost`）。
 *
 * 三件东西刻意没搬：`selectedPost`（视图持有并按引用传入）、竞态计数器
 * （归 `useCommunityPostDetail`）、`watch(selectedPost) → setSeoMeta`（留页面层防抖）。
 */
export function useCommunityFeed(options: UseCommunityFeedOptions) {
  const route = useRoute()
  const auth = useAuthStore()

  const posts = ref<CommunityPost[]>([])
  const tags = ref<CommunityTag[]>([])
  const loading = ref(false)
  const favoriteLoading = ref(false)
  const selectedTag = ref('')
  /** 首屏关键词直接取地址栏的 `?keyword=`（搜索结果页跳进来的入口）。 */
  const initialSearchKeyword =
    typeof route.query.keyword === 'string' ? route.query.keyword.trim() : ''
  const searchDraft = ref(initialSearchKeyword)
  const searchKeyword = ref(initialSearchKeyword)
  const currentPage = ref(1)
  const hasNextPage = ref(false)

  const tagOptions = computed(() => tags.value.map((tag) => tag.name))
  const pageStatus = computed(() => {
    if (posts.value.length === 0) {
      return `第 ${currentPage.value} 页`
    }

    const start = (currentPage.value - 1) * POSTS_PER_PAGE + 1
    const end = start + posts.value.length - 1
    return `第 ${currentPage.value} 页 · ${start}-${end} 条`
  })

  /** 地址栏里指定的帖子：`/community/posts/:postId`、`?post=`、`?postId=` 三种入口都认。 */
  function routePostId(): number | null {
    const rawValue = route.params.postId ?? route.query.post ?? route.query.postId
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
    if (typeof value !== 'string') {
      return null
    }

    const postId = Number(value)
    return Number.isInteger(postId) && postId > 0 ? postId : null
  }

  /** 只改列表里的那一条（详情那一份由 `updateSelectedPost` 管）。 */
  function patchPost(postId: number, patch: Partial<CommunityPost>) {
    posts.value = posts.value.map((post) => (post.id === postId ? { ...post, ...patch } : post))
  }

  /** 点赞 / 收藏 / 悬赏 / 推广共用的那一个回写点：列表与详情两份状态一起改（改造前的原样）。 */
  function updateSelectedPost(patch: Partial<CommunityPost>) {
    if (!options.selectedPost.value) {
      return
    }
    const postId = options.selectedPost.value.id
    patchPost(postId, patch)
    options.selectedPost.value = { ...options.selectedPost.value, ...patch }
  }

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

  /** 铺一页列表并决定详情区选谁：点名的那篇在本页就选它，不在就单取，没点名就随机挑（改造前口径）。 */
  function applyPostPage(
    page: number,
    nextPosts: CommunityPost[],
    nextHasPage: boolean,
    preferredPostId?: number,
  ) {
    currentPage.value = page
    hasNextPage.value = nextHasPage
    posts.value = nextPosts

    const preferredPost = preferredPostId
      ? nextPosts.find((item) => item.id === preferredPostId)
      : null
    if (preferredPost) {
      options.selectPost(preferredPost)
      return
    }

    if (preferredPostId) {
      options.selectPost(null)
      options.onStandalonePost(preferredPostId)
      return
    }

    options.selectPost(pickRandomPost(nextPosts))
  }

  /** 首屏：标签与第一页一起取（两条请求并发，与改造前一致）。 */
  async function loadCommunityData() {
    loading.value = true
    try {
      const selectedPostId = routePostId() ?? options.selectedPost.value?.id
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

  /** 标签是开关：再点一次同一个就回到「全部」。 */
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

  async function toggleLike(post: CommunityPost) {
    if (!options.ensureAuthed()) {
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
      patchPost(post.id, { liked_by_me: state.liked_by_me, like_count: state.like_count })
      if (options.selectedPost.value?.id === post.id) {
        updateSelectedPost({ liked_by_me: state.liked_by_me, like_count: state.like_count })
      }
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '点赞失败')
    }
  }

  async function toggleFavorite(post: CommunityPost) {
    if (!options.ensureAuthed()) {
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
      patchPost(post.id, { favorited_by_me: state.favorited_by_me })
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '收藏帖子失败')
    } finally {
      favoriteLoading.value = false
    }
  }

  // 地址栏关键词变了（搜索结果页再次跳转）就回第 1 页重取；同值时不打断当前浏览。
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

  return {
    posts,
    tags,
    loading,
    favoriteLoading,
    selectedTag,
    searchDraft,
    searchKeyword,
    currentPage,
    hasNextPage,
    tagOptions,
    pageStatus,
    routePostId,
    loadCommunityData,
    selectTag,
    applySearch,
    clearSearch,
    goToPreviousPage,
    goToNextPage,
    toggleLike,
    toggleFavorite,
    updateSelectedPost,
  }
}
