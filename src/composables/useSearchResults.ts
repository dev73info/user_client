import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { TMessage } from 'ui_73info'

import { listCommunityPosts, type CommunityPost } from '@/api/community'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import {
  listPublicRequirementSpotlights,
  type PublicRequirementSpotlightItem,
} from '@/api/requirements'
import type { McProcessedTagTree } from '@/api/resourceTags'
import {
  buildCommunitySearchText,
  buildRequirementSearchText,
  buildResourceSearchText,
} from '@/shared/searchResults'
import { useAuthStore } from '@/stores/auth'
import { useTagTreeStore } from '@/stores/tagTree'

/** 搜索范围的四个取值：`all` 是「三类一起搜」，其余三个各只要一类。 */
export type SearchScope = 'all' | 'resources' | 'requirements' | 'community'

/**
 * 搜索结果页的取数与筛选域。
 *
 * 关键词与范围都来自**路由 query**（`?keyword=` / `?scope=`），页面自己没有搜索框：
 * 顶栏搜索提交时改 query，本域 `watch` 到就重取一次——所以这条 watch 是这页唯一的
 * 「再搜一次」入口，拆页时不能挪进任何子组件（子组件卸载就不再触发）。
 *
 * 取数口径（拆分前如此，逐字保留）：
 * - 资源：取全量公开资源，关键词在前端过滤（见 `shared/searchResults` 的 `buildResourceSearchText`）；
 * - 需求：公开精选单页上限 100 条，同样前端过滤；
 * - 帖子：把关键词交给接口（服务端已按关键词筛过），因此回来的一批不再二次过滤——
 *   `loadedCommunityKeyword` 记的就是「这批帖子是按哪个关键词取的」，query 一变它就对不上，
 *   于是退回前端过滤那一支，避免旧关键词的帖子继续挂在结果里。
 */
export function useSearchResults() {
  const route = useRoute()
  const auth = useAuthStore()
  const tagTreeStore = useTagTreeStore()

  const loading = ref(false)
  const resources = ref<PublicMcResourceItem[]>([])
  const requirements = ref<PublicRequirementSpotlightItem[]>([])
  const communityPosts = ref<CommunityPost[]>([])
  const tagTree = ref<McProcessedTagTree | null>(null)
  const loadError = ref('')
  const loadedCommunityKeyword = ref('')

  const keyword = computed(() =>
    typeof route.query.keyword === 'string' ? route.query.keyword.trim() : '',
  )
  const normalizedKeyword = computed(() => keyword.value.toLowerCase())
  const scope = computed<SearchScope>(() => {
    const rawScope = typeof route.query.scope === 'string' ? route.query.scope : ''
    return rawScope === 'resources' || rawScope === 'requirements' || rawScope === 'community'
      ? rawScope
      : 'all'
  })
  const showResources = computed(() => scope.value === 'all' || scope.value === 'resources')
  const showRequirements = computed(() => scope.value === 'all' || scope.value === 'requirements')
  const showCommunity = computed(() => scope.value === 'all' || scope.value === 'community')

  const filteredResources = computed(() => {
    if (!showResources.value) {
      return []
    }

    const searchText = normalizedKeyword.value
    if (!searchText) {
      return resources.value.slice(0, 12)
    }

    return resources.value.filter((resource) =>
      buildResourceSearchText(resource).includes(searchText),
    )
  })

  const filteredRequirements = computed(() => {
    if (!showRequirements.value) {
      return []
    }

    const searchText = normalizedKeyword.value
    if (!searchText) {
      return requirements.value.slice(0, 12)
    }

    return requirements.value.filter((requirement) =>
      buildRequirementSearchText(requirement).includes(searchText),
    )
  })

  const filteredCommunityPosts = computed(() => {
    if (!showCommunity.value) {
      return []
    }

    const searchText = normalizedKeyword.value
    if (!searchText) {
      return communityPosts.value.slice(0, 12)
    }

    if (loadedCommunityKeyword.value === keyword.value) {
      return communityPosts.value
    }

    return communityPosts.value.filter((post) =>
      buildCommunitySearchText(post).includes(searchText),
    )
  })

  const resultCount = computed(
    () =>
      filteredResources.value.length +
      filteredRequirements.value.length +
      filteredCommunityPosts.value.length,
  )

  const resultSummary = computed(() => {
    if (!keyword.value) {
      return '输入关键词后展示匹配的资源、需求和帖子。'
    }

    if (resultCount.value === 0) {
      return '暂时没有匹配的资源、需求或帖子。'
    }

    const parts: string[] = []
    if (filteredResources.value.length > 0) {
      parts.push(`${filteredResources.value.length} 个资源`)
    }
    if (filteredRequirements.value.length > 0) {
      parts.push(`${filteredRequirements.value.length} 个需求`)
    }
    if (filteredCommunityPosts.value.length > 0) {
      parts.push(`${filteredCommunityPosts.value.length} 篇帖子`)
    }

    return `找到 ${parts.join('、')}`
  })

  watch(
    () => [route.query.keyword, route.query.scope] as const,
    () => {
      if (!loading.value) {
        void loadSearchData()
      }
    },
  )

  onMounted(() => {
    auth.hydrate()
    void loadSearchData()
  })

  /** 取一次三类结果：四路 `allSettled` 并起，标签树失败不算整页失败（只影响资源跳转的兜底）。 */
  async function loadSearchData() {
    loading.value = true
    loadError.value = ''

    try {
      const token = auth.token?.trim() ? auth.token : null
      const nextKeyword = keyword.value
      const [treeResult, resourceResult, requirementResult, communityResult] =
        await Promise.allSettled([
          showResources.value ? tagTreeStore.ensure() : Promise.resolve(tagTree.value),
          showResources.value ? listAllPublicMcResources(token) : Promise.resolve(resources.value),
          showRequirements.value
            ? // 搜索是前端在结果集里过滤，公开接口单页上限 100 条，取满一页。
              listPublicRequirementSpotlights(1, 100).then((page) => page.items)
            : Promise.resolve(requirements.value),
          showCommunity.value
            ? listCommunityPosts({ token, keyword: nextKeyword, limit: 12 })
            : Promise.resolve([]),
        ])

      if (treeResult.status === 'fulfilled') {
        tagTree.value = treeResult.value
      }

      if (resourceResult.status === 'fulfilled') {
        resources.value = resourceResult.value
      } else {
        throw resourceResult.reason
      }

      if (requirementResult.status === 'fulfilled') {
        requirements.value = requirementResult.value
      } else {
        throw requirementResult.reason
      }

      if (communityResult.status === 'fulfilled') {
        communityPosts.value = communityResult.value
        loadedCommunityKeyword.value = nextKeyword
      } else {
        throw communityResult.reason
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载搜索结果失败'
      loadError.value = message
      TMessage.error(message)
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    loadError,
    keyword,
    tagTree,
    filteredResources,
    filteredRequirements,
    filteredCommunityPosts,
    resultCount,
    resultSummary,
    loadSearchData,
  }
}
