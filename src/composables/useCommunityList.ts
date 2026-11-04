import { computed, onMounted, ref, watch, type UnwrapNestedRefs } from 'vue'
import { useRoute } from 'vue-router'

import {
  listCommunityPosts,
  listCommunityTags,
  listFavoriteCommunityPosts,
  type CommunityPost,
  type CommunityPostListQuery,
  type CommunityTag,
} from '@/api/community'
import { useCommunityAccess } from '@/composables/useCommunityAccess'
import { describeCommunityError, prioritizePendingCommunityPosts } from '@/shared/community'

export type CommunityListMode = 'all' | 'mine' | 'favorites'

export function useCommunityList() {
  const route = useRoute()
  const { auth, requireLogin } = useCommunityAccess()
  const posts = ref<CommunityPost[]>([])
  const tags = ref<CommunityTag[]>([])
  const mode = ref<CommunityListMode>(route.name === 'workbench-favorites' ? 'favorites' : 'all')
  const keyword = ref('')
  const tag = ref('')
  const status = ref('')
  const page = ref(1)
  const pageSize = ref(10)
  const loading = ref(false)
  const error = ref('')
  const tagError = ref('')
  /** 裸数组接口不返回总数：取满一页后再探一条，才知道「下一页」是不是真的存在。 */
  const nextPageExists = ref(false)
  let listRequest = 0

  const hasPrevious = computed(() => page.value > 1)
  const hasNext = computed(() => nextPageExists.value)
  const emptyText = computed(() => {
    if (mode.value === 'favorites') return '还没有收藏帖子'
    if (mode.value === 'mine') return '还没有发布帖子'
    return keyword.value || tag.value ? '没有符合条件的帖子' : '暂时没有社区帖子'
  })

  async function loadTags() {
    tagError.value = ''
    try {
      tags.value = await listCommunityTags()
    } catch (cause) {
      tagError.value = describeCommunityError(cause, '加载社区标签失败')
    }
  }

  /** 按当前模式 / 筛选条件取某一页；列表页与左栏「补空档」共用同一套查询口径。 */
  async function fetchPage(targetPage: number, limit = pageSize.value): Promise<CommunityPost[]> {
    if (mode.value !== 'all' && !auth.token.trim()) return []
    const query: CommunityPostListQuery = {
      limit,
      offset: (targetPage - 1) * pageSize.value,
    }
    if (mode.value !== 'favorites') {
      query.keyword = keyword.value.trim() || undefined
      query.tag = tag.value || undefined
    }
    if (mode.value === 'mine') {
      query.author = auth.username
      query.status = status.value || undefined
    }
    const result =
      mode.value === 'favorites'
        ? await listFavoriteCommunityPosts(auth.token, query)
        : await listCommunityPosts(auth.token, query)
    return prioritizePendingCommunityPosts(result)
  }

  async function load() {
    const requestId = ++listRequest
    if (mode.value !== 'all' && !auth.token.trim()) {
      posts.value = []
      loading.value = false
      nextPageExists.value = false
      return
    }
    loading.value = true
    error.value = ''
    try {
      const result = await fetchPage(page.value)
      if (requestId !== listRequest) return
      posts.value = result
      if (result.length < pageSize.value) {
        nextPageExists.value = false
      } else {
        const probe = await fetchPage(page.value + 1, 1)
        if (requestId !== listRequest) return
        nextPageExists.value = probe.length > 0
      }
    } catch (cause) {
      if (requestId !== listRequest) return
      posts.value = []
      nextPageExists.value = false
      error.value = describeCommunityError(cause, '加载社区帖子失败')
    } finally {
      if (requestId === listRequest) loading.value = false
    }
  }

  function setMode(next: CommunityListMode) {
    if (next !== 'all' && !requireLogin()) return
    if (mode.value === next) return
    mode.value = next
    page.value = 1
    void load()
  }

  function applyFilters() {
    page.value = 1
    void load()
  }

  function previousPage() {
    if (!hasPrevious.value || loading.value) return
    page.value -= 1
    void load()
  }

  function nextPage() {
    if (!hasNext.value || loading.value) return
    page.value += 1
    void load()
  }

  /** 只翻到已知存在的相邻页（裸数组接口不返回总数，不能凭空造出页码）。 */
  function goToPage(next: number) {
    if (loading.value || next === page.value || next < 1) return
    if (next > page.value && !hasNext.value) return
    page.value = next
    void load()
  }

  watch(
    () => auth.token,
    (token) => {
      if (!token.trim() && mode.value !== 'all') mode.value = 'all'
      page.value = 1
      void load()
    },
  )

  onMounted(() => {
    void loadTags()
    void load()
  })

  return {
    posts,
    tags,
    mode,
    keyword,
    tag,
    status,
    page,
    pageSize,
    loading,
    error,
    tagError,
    hasPrevious,
    hasNext,
    emptyText,
    load,
    fetchPage,
    loadTags,
    setMode,
    applyFilters,
    previousPage,
    nextPage,
    goToPage,
  }
}

/** 列表状态：分栏页把工具栏提到页面顶部后，列表状态由视图持有、面板与工具栏共用这一份。
 *  形状是 `reactive(useCommunityList())` 解包后的那份（ref 已展开）。 */
export type CommunityListState = UnwrapNestedRefs<ReturnType<typeof useCommunityList>>
