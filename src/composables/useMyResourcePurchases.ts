import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  countMyResourcePurchases,
  listMyResourcePurchasesPage,
  type ResourcePurchaseOrder,
} from '@/api/resourcePurchase'
import { DEFAULT_LIST_PAGE_SIZE } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/** 搜索输入防抖时长：够短不至于觉得迟钝，够长不至于每敲一个字打一次接口。 */
const SEARCH_DEBOUNCE_MS = 300

/**
 * 「我的已购资源」的取数域：服务端筛选（`status` / `keyword` / `limit` / `offset`，总数在
 * 响应头 `X-Total-Count`）、页头分状态统计、分页与关键词防抖。
 *
 * 前端只负责控件与展示——订单多起来之后不再一次性把全部订单平铺出来；筛选 / 页大小 / 页码
 * 任一变化都会合并成一次请求（`nextTick` 合并 + 请求序号丢弃过期响应）。
 * 视图只消费这些读数与动作。
 */
export function useMyResourcePurchases() {
  const auth = useAuthStore()

  const loading = ref(false)
  const statsLoading = ref(false)
  const orders = ref<ResourcePurchaseOrder[]>([])
  /** 当前筛选条件下的订单总数（来自响应头 X-Total-Count），分页器据此渲染页码 */
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(DEFAULT_LIST_PAGE_SIZE)
  const statusFilter = ref('all')
  const keyword = ref('')

  /** 页头读数条：分状态总数（同样取服务端 X-Total-Count，不受当前筛选影响） */
  const stats = ref({ all: 0, paid: 0, refunding: 0, refunded: 0 })

  const hasActiveFilters = computed(
    () => keyword.value.trim() !== '' || statusFilter.value !== 'all',
  )

  function stripValue(count: number) {
    return statsLoading.value ? '—' : String(count)
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null
  /** 同一次交互里可能同时触发多个 watcher；用 nextTick 合并成一次请求。 */
  let loadQueued = false
  /** 请求序号：响应回来时若已不是最新一次，就丢弃，避免慢响应覆盖新结果。 */
  let loadSeq = 0

  async function loadOrders() {
    auth.hydrate()
    if (!auth.token.trim()) {
      return
    }
    const seq = ++loadSeq
    loading.value = true
    try {
      const result = await listMyResourcePurchasesPage(auth.token, {
        status: statusFilter.value === 'all' ? undefined : statusFilter.value,
        keyword: keyword.value.trim() || undefined,
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
      })
      if (seq !== loadSeq) {
        // 期间又发了新请求，这次的结果已经过期
        return
      }
      orders.value = result.items
      total.value = result.total
    } catch (error) {
      if (seq !== loadSeq) {
        return
      }
      TMessage.error(error instanceof Error ? error.message : '加载已购资源失败')
    } finally {
      if (seq === loadSeq) {
        loading.value = false
      }
    }
  }

  /** 读数条的分状态统计：每个状态取一次总数（`limit=1`，只要响应头里的 total）。 */
  async function loadStats() {
    auth.hydrate()
    if (!auth.token.trim()) {
      return
    }
    statsLoading.value = true
    try {
      const [all, paid, refunding, refunded] = await Promise.all([
        countMyResourcePurchases(auth.token),
        countMyResourcePurchases(auth.token, { status: 'paid' }),
        countMyResourcePurchases(auth.token, { status: 'refunding' }),
        countMyResourcePurchases(auth.token, { status: 'refunded' }),
      ])
      stats.value = { all, paid, refunding, refunded }
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载已购资源统计失败')
    } finally {
      statsLoading.value = false
    }
  }

  function reload() {
    void Promise.all([loadOrders(), loadStats()])
  }

  function queueLoad() {
    if (loadQueued) {
      return
    }
    loadQueued = true
    void nextTick(() => {
      loadQueued = false
      void loadOrders()
    })
  }

  /* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
  watch(statusFilter, () => {
    page.value = 1
    queueLoad()
  })

  watch(pageSize, () => {
    page.value = 1
    queueLoad()
  })

  watch(page, queueLoad)

  /* 关键词防抖：输入停止后再请求，避免逐字打接口。 */
  watch(keyword, () => {
    if (searchTimer) {
      clearTimeout(searchTimer)
    }
    searchTimer = setTimeout(() => {
      searchTimer = null
      page.value = 1
      queueLoad()
    }, SEARCH_DEBOUNCE_MS)
  })

  function resetFilters() {
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
    keyword.value = ''
    statusFilter.value = 'all'
    page.value = 1
    queueLoad()
  }

  onMounted(() => {
    reload()
  })

  onBeforeUnmount(() => {
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
  })

  return {
    loading,
    statsLoading,
    orders,
    total,
    page,
    pageSize,
    statusFilter,
    keyword,
    stats,
    hasActiveFilters,
    stripValue,
    reload,
    resetFilters,
  }
}
