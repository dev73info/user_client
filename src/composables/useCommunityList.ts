import { computed, onMounted, ref, watch } from 'vue'
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
import { describeCommunityError } from '@/shared/community'

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
  const pageSize = 10
  const loading = ref(false)
  const error = ref('')
  const tagError = ref('')
  let listRequest = 0

  const hasPrevious = computed(() => page.value > 1)
  const hasNext = computed(() => posts.value.length === pageSize)
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

  async function load() {
    const requestId = ++listRequest
    if (mode.value !== 'all' && !auth.token.trim()) {
      posts.value = []
      loading.value = false
      return
    }
    loading.value = true
    error.value = ''
    const query: CommunityPostListQuery = {
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
    }
    if (mode.value !== 'favorites') {
      query.keyword = keyword.value.trim() || undefined
      query.tag = tag.value || undefined
    }
    if (mode.value === 'mine') {
      query.author = auth.username
      query.status = status.value || undefined
    }
    try {
      const result =
        mode.value === 'favorites'
          ? await listFavoriteCommunityPosts(auth.token, query)
          : await listCommunityPosts(auth.token, query)
      if (requestId !== listRequest) return
      posts.value = result
    } catch (cause) {
      if (requestId !== listRequest) return
      posts.value = []
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

  function resetFilters() {
    keyword.value = ''
    tag.value = ''
    status.value = ''
    applyFilters()
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
    loadTags,
    setMode,
    applyFilters,
    resetFilters,
    previousPage,
    nextPage,
  }
}
