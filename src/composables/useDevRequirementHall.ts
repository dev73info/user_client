import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { TMessage } from 'ui_73info'

import { listRequirementHall, type RequirementItem } from '@/api/devRequirements'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  REQUIREMENT_HALL_SORT_OPTIONS,
  countRequirementPaymentModes,
  type RequirementHallSortBy,
} from '@/shared/devRequirementHall'
import { useAuthStore } from '@/stores/auth'

/**
 * 开发者需求大厅的列表、服务端分页、排序与关键词筛选。
 *
 * 从 `views/DevRequirementHallView.vue` 抽出，逻辑与请求实参逐段照搬：
 * 分页与排序走服务端（关键词也随请求带过去，由服务端查），页内不再二次过滤。
 * 「接单 / 缴纳保证金 / 签协议」那几个跳转不在这里，在 `useDevOrderGate`。
 */
export function useDevRequirementHall() {
  const auth = useAuthStore()
  const route = useRoute()

  const loading = ref(false)
  const rows = ref<RequirementItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)

  const filters = reactive({
    keyword: '',
    sortBy: 'updated_at' as RequirementHallSortBy,
    sortOrder: 'desc' as 'asc' | 'desc',
  })

  /** 下拉的选项（口径见 `@/shared/devRequirementHall`）。 */
  const sortOptions = REQUIREMENT_HALL_SORT_OPTIONS

  const emptyText = computed(() => {
    if (loading.value) {
      return '资源关联加载中'
    }

    return '当前没有可接的待关联需求'
  })

  /* 本页走服务端分页，条数口径只有 total 一处；
     原先还留着一个「当前页行数」的 computed，改服务端分页后没人再用，已删。 */
  const paymentModeCounts = computed(() => countRequirementPaymentModes(rows.value))

  async function loadRequirements() {
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    loading.value = true
    try {
      const payload = await listRequirementHall(auth.token, {
        page: page.value,
        pageSize: pageSize.value,
        keyword: filters.keyword,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      })
      rows.value = payload.items
      total.value = payload.total
    } catch (error) {
      const message = describeBackendError(error, '加载资源关联列表失败')
      TMessage.error(message)
      rows.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  async function applyFilters() {
    page.value = 1
    await loadRequirements()
  }

  function handlePageSizeChange() {
    page.value = 1
    void loadRequirements()
  }

  /* 关键字搜索与其余菜单页一致：输入即生效，不再挂「查询」按钮。
     这一页走服务端分页查询，逐次按键都发请求会打满接口，所以关键字加 300ms 防抖；
     两个下拉改一次发一次，本来就不会连发。
     `appliedKeyword` 记最后一次真正发起请求的关键字，用来吃掉「重置」清空关键字时的重复请求。 */
  let appliedKeyword = filters.keyword
  let keywordTimer: ReturnType<typeof setTimeout> | null = null

  function cancelPendingKeywordSearch() {
    if (keywordTimer) {
      clearTimeout(keywordTimer)
      keywordTimer = null
    }
  }

  function searchNow() {
    cancelPendingKeywordSearch()
    appliedKeyword = filters.keyword
    void applyFilters()
  }

  watch(
    () => filters.keyword,
    (value) => {
      if (value === appliedKeyword) {
        return
      }
      cancelPendingKeywordSearch()
      keywordTimer = setTimeout(() => {
        keywordTimer = null
        appliedKeyword = filters.keyword
        void applyFilters()
      }, 300)
    },
  )

  onBeforeUnmount(cancelPendingKeywordSearch)

  function routeKeyword(value = route.query.keyword): string {
    return typeof value === 'string' ? value.trim() : ''
  }

  function syncKeywordFromRoute() {
    const nextKeyword = routeKeyword()
    if (nextKeyword) {
      filters.keyword = nextKeyword
      page.value = 1
    }
  }

  watch(
    () => route.query.keyword,
    (value) => {
      const nextKeyword = routeKeyword(value)
      if (nextKeyword === filters.keyword) {
        return
      }

      filters.keyword = nextKeyword
      page.value = 1

      if (auth.token) {
        void loadRequirements()
      }
    },
  )

  return {
    loading,
    rows,
    total,
    page,
    pageSize,
    filters,
    sortOptions,
    emptyText,
    paymentModeCounts,
    loadRequirements,
    applyFilters,
    searchNow,
    handlePageSizeChange,
    syncKeywordFromRoute,
  }
}
