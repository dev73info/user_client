import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { listSellerResourcePurchases, type ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { useClientPagination } from '@/composables/useClientPagination'
import { canSellerRefundPurchase } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/** 一次取回本页全部售出订单（后端单页上限 100 条），再按资源与筛选在前端收窄。 */
const SELLER_ORDER_FETCH_LIMIT = 100

/**
 * 「售出订单」页的取数与筛选：订单拉取、资源筛选（`?resourceId=` 预选）、状态 / 关键词筛选、
 * 读数四格、客户端分页与空态文案。
 *
 * 与买家侧「我的已购资源」是一件事的两面：那边的筛选走服务端，这边一次取回后在前端收窄。
 * 没有 `resourceId` 时展示全部售出订单，不再把用户踢回资源列表。
 */
export function useDevSoldResourcePurchases() {
  const route = useRoute()
  const auth = useAuthStore()

  const isLoading = ref(false)
  const orders = ref<ResourcePurchaseOrder[]>([])

  const filters = reactive({
    resourceId: '',
    status: '',
    keyword: '',
  })

  /** 从资源「更多 → 售出订单」带入；无 resourceId 时不筛资源。 */
  const resourceIdFilter = computed(() => {
    const raw = route.query.resourceId ?? route.query.resource_id
    const value = Array.isArray(raw) ? raw[0] : raw
    const id = Number(value)
    return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null
  })

  /** 订单里出现过的资源（按首次出现顺序），标题为空时用编号兜底。 */
  const resourceOptions = computed(() => {
    const titles = new Map<number, string>()
    for (const order of orders.value) {
      const id = order.resource_id
      if (!Number.isFinite(id) || id <= 0) {
        continue
      }
      const title = (order.resource_title ?? '').trim()
      if (!titles.has(id) || (!titles.get(id) && title)) {
        titles.set(id, title)
      }
    }
    return [...titles.entries()].map(([value, title]) => ({
      value,
      label: title || `资源 #${value}`,
    }))
  })

  const selectedResourceId = computed(() => {
    const id = Number(filters.resourceId)
    return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null
  })

  const scopedOrders = computed(() => {
    const resourceId = selectedResourceId.value
    if (resourceId == null) {
      return orders.value
    }
    return orders.value.filter((order) => order.resource_id === resourceId)
  })

  const paidCount = computed(
    () => scopedOrders.value.filter((item) => item.status === 'paid').length,
  )
  const refundableCount = computed(
    () => scopedOrders.value.filter((item) => canSellerRefundPurchase(item)).length,
  )
  const refundedCount = computed(
    () => scopedOrders.value.filter((item) => item.status === 'refunded').length,
  )

  const filteredOrders = computed(() => {
    const keyword = filters.keyword.trim().toLowerCase()
    return scopedOrders.value.filter((order) => {
      if (filters.status && order.status !== filters.status) {
        return false
      }
      if (!keyword) {
        return true
      }
      const haystack = [
        order.order_no,
        order.buyer,
        order.resource_title ?? '',
        order.refund_reason ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  })

  const hasActiveFilters = computed(() => Boolean(filters.status || filters.keyword.trim()))

  const {
    page,
    pageSize,
    total: filteredTotal,
    paged,
    resetPage,
  } = useClientPagination(filteredOrders)

  const emptyText = computed(() => {
    if (!orders.value.length) {
      return '还没有售出订单'
    }
    if (selectedResourceId.value != null && !scopedOrders.value.length) {
      return '该资源还没有售出订单'
    }
    return '没有符合筛选条件的售出订单'
  })

  async function loadOrders() {
    auth.hydrate()
    if (!auth.token.trim()) {
      return
    }
    isLoading.value = true
    try {
      orders.value = await listSellerResourcePurchases(auth.token, {
        limit: SELLER_ORDER_FETCH_LIMIT,
      })
      // 刷新时保留用户当前选择；只有选中的资源已经不在订单里才回落全部。
      const selected = selectedResourceId.value
      if (selected != null && !orders.value.some((order) => order.resource_id === selected)) {
        filters.resourceId = ''
      }
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载售出订单失败')
    } finally {
      isLoading.value = false
    }
  }

  /** 路由带 `?resourceId=` 时预选该资源；订单里没有这个资源时回落「全部资源」。 */
  function applyRouteResourceFilter() {
    const id = resourceIdFilter.value
    if (id != null && orders.value.some((order) => order.resource_id === id)) {
      filters.resourceId = String(id)
      return
    }
    filters.resourceId = ''
  }

  /** 退款成功后把这一单换成本地最新值：列表不重拉，退款留痕与状态就地更新。 */
  function applyUpdated(updated: ResourcePurchaseOrder) {
    orders.value = orders.value.map((item) => (item.order_no === updated.order_no ? updated : item))
  }

  onMounted(() => {
    void loadOrders().then(() => applyRouteResourceFilter())
  })

  watch(resourceIdFilter, () => {
    applyRouteResourceFilter()
    filters.status = ''
    filters.keyword = ''
    resetPage()
    if (!orders.value.length) {
      void loadOrders()
    }
  })

  return {
    isLoading,
    orders,
    filters,
    resourceOptions,
    selectedResourceId,
    scopedOrders,
    paidCount,
    refundableCount,
    refundedCount,
    filteredOrders,
    hasActiveFilters,
    page,
    pageSize,
    filteredTotal,
    paged,
    emptyText,
    resetPage,
    loadOrders,
    applyUpdated,
  }
}
