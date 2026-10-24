import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { useAuthStore } from '@/stores/auth'

import { usePortalMenuDismiss } from './usePortalSubscription'
import type { AuthMode } from './usePortalTopNavNav'

export type SearchScope = 'auto' | 'resources' | 'requirements'

const searchScopeOptions: Array<{ value: SearchScope; label: string }> = [
  { value: 'auto', label: '全部' },
  { value: 'resources', label: '资源' },
  { value: 'requirements', label: '需求' },
]

/** 哪些路由算「搜索态」：进来时把地址栏里的关键词与范围回填到搜索框 */
const searchableRouteScope: Partial<Record<string, SearchScope>> = {
  search: 'auto',
  resources: 'resources',
  'resource-catalog': 'resources',
  'resource-detail-direct': 'resources',
  'requirement-hall': 'requirements',
}

/**
 * 顶栏搜索子系统：范围下拉、输入态、IME 组词，以及 route ↔ 搜索状态的同步。
 *
 * 路由相关的判断（关键词回填、提交后跳哪个页面）都留在这一层，所以搜索框组件本身
 * 只负责渲染与发事件；`openAuth` / `openDevWorkbench` 由调用方注入，这里不碰这两个出口。
 */
export function usePortalTopNavSearch(options: {
  openAuth: (mode: AuthMode) => void
  openDevWorkbench: () => void
}) {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const searchQuery = ref('')
  const searchScope = ref<SearchScope>('auto')
  const searchScopeMenuOpen = ref(false)
  const searchInputFocused = ref(false)
  const searchInputHovered = ref(false)
  const searchDraftFilled = ref(false)

  const searchHasInputValue = computed(
    () => Boolean(searchQuery.value.trim()) || searchDraftFilled.value,
  )
  const searchPlaceholder = computed(() => {
    if (searchScope.value === 'requirements') return '搜索需求标题、编号...'
    return '搜索资源、开发者...'
  })
  const activeSearchScopeLabel = computed(
    () => searchScopeOptions.find((option) => option.value === searchScope.value)?.label ?? '全部',
  )

  usePortalMenuDismiss({ rootSelector: '.portal-search-scope', close: closeScopeMenu })

  watch(
    () => route.fullPath,
    () => {
      closeScopeMenu()
      syncSearchFromRoute()
    },
    { immediate: true },
  )

  function closeScopeMenu() {
    searchScopeMenuOpen.value = false
  }

  function toggleSearchScopeMenu() {
    searchScopeMenuOpen.value = !searchScopeMenuOpen.value
  }

  function selectSearchScope(scope: SearchScope) {
    searchScope.value = scope
    searchScopeMenuOpen.value = false
  }

  function syncSearchFromRoute() {
    const currentName = String(route.name ?? '')
    const nextScope = searchableRouteScope[currentName]

    if (!nextScope) {
      searchScope.value = 'auto'
      searchQuery.value = ''
      searchDraftFilled.value = false
      return
    }

    if (currentName === 'search') {
      const routeScope = typeof route.query.scope === 'string' ? route.query.scope : ''
      searchScope.value =
        routeScope === 'resources' || routeScope === 'requirements' ? routeScope : 'auto'
      searchQuery.value = typeof route.query.keyword === 'string' ? route.query.keyword.trim() : ''
      searchDraftFilled.value = Boolean(searchQuery.value)
      return
    }

    const routeKeyword =
      currentName === 'resource-catalog'
        ? typeof route.query.search === 'string'
          ? route.query.search.trim()
          : ''
        : typeof route.query.keyword === 'string'
          ? route.query.keyword.trim()
          : ''

    searchScope.value = nextScope
    searchQuery.value = routeKeyword
    searchDraftFilled.value = Boolean(routeKeyword)
  }

  function pushResourceSearch(keyword: string) {
    void router.push({ name: 'search', query: { keyword, scope: 'resources' } })
  }

  function pushRequirementSearch(keyword: string) {
    void router.push({ name: 'search', query: { keyword, scope: 'requirements' } })
  }

  function pushScopedSearch(keyword: string) {
    if (searchScope.value === 'resources') {
      pushResourceSearch(keyword)
      return true
    }

    if (searchScope.value === 'requirements') {
      pushRequirementSearch(keyword)
      return true
    }

    return false
  }

  function submitSearch() {
    const normalized = searchQuery.value.trim()
    if (!normalized) {
      TMessage.info('请输入搜索关键词')
      return
    }

    searchQuery.value = normalized
    searchDraftFilled.value = true

    if (pushScopedSearch(normalized)) {
      return
    }

    const keyword = normalized.toLowerCase()

    if (/(开发者|接单|发布资源|dev)/.test(keyword)) {
      options.openDevWorkbench()
      return
    }

    if (/(个人中心|用户工作台|工作台|账户|我的)/.test(keyword)) {
      if (auth.isAuthed) {
        void router.push({ name: 'workbench' })
      } else {
        options.openAuth('login')
      }
      return
    }

    if (/(需求|定制|项目|招募|外包|预算|验收)/.test(keyword)) {
      pushRequirementSearch(normalized)
      return
    }

    void router.push({ name: 'search', query: { keyword: normalized } })
  }

  function clearSearch() {
    searchQuery.value = ''
    searchDraftFilled.value = false

    const currentName = String(route.name ?? '')
    if (currentName === 'search' && route.query.keyword) {
      const nextQuery = { ...route.query }
      delete nextQuery.keyword
      void router.replace({ query: nextQuery })
      return
    }

    if (currentName === 'resource-catalog' && route.query.search) {
      const nextQuery = { ...route.query }
      delete nextQuery.search
      void router.replace({ query: nextQuery })
      return
    }

    if (['resources', 'requirement-hall'].includes(currentName) && route.query.keyword) {
      const nextQuery = { ...route.query }
      delete nextQuery.keyword
      void router.replace({ query: nextQuery })
    }
  }

  function updateSearchDraftState(event: Event) {
    const input = event.target as HTMLInputElement | null
    searchDraftFilled.value = Boolean(input?.value.trim())
  }

  function startSearchComposition() {
    searchDraftFilled.value = true
  }

  function finishSearchComposition(event: CompositionEvent) {
    updateSearchDraftState(event)
  }

  return {
    searchQuery,
    searchScope,
    searchScopeOptions,
    searchScopeMenuOpen,
    searchInputFocused,
    searchInputHovered,
    searchHasInputValue,
    searchPlaceholder,
    activeSearchScopeLabel,
    toggleSearchScopeMenu,
    selectSearchScope,
    submitSearch,
    clearSearch,
    updateSearchDraftState,
    startSearchComposition,
    finishSearchComposition,
  }
}
