import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { listSellerResourcePurchases, type ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { useClientPagination } from '@/composables/useClientPagination'
import { canSellerRefundPurchase } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/** 一次取回本页全部售出订单（后端单页上限 100 条），再按资源与筛选在前端收窄。 */
const SELLER_ORDER_FETCH_LIMIT = 100

/**
 * 「售出订单」页的取数与筛选：订单拉取、资源范围（`?resourceId=`）、状态 / 关键词筛选、
 * 读数四格、客户端分页与空态文案。
 *
 * 与买家侧「我的已购资源」是一件事的两面：那边的筛选走服务端，这边一次取回后在前端收窄。
 */
export function useDevSoldResourcePurchases() {
  const router = useRouter()
  const route = useRoute()
  const auth = useAuthStore()

  const isLoading = ref(false)
  const orders = ref<ResourcePurchaseOrder[]>([])

  const filters = reactive({
    status: '',
    keyword: '',
  })

  /** 从资源「更多 → 售出订单」带入；无 resourceId 时回资源列表。 */
  const resourceIdFilter = computed(() => {
    const raw = route.query.resourceId ?? route.query.resource_id
    const value = Array.isArray(raw) ? raw[0] : raw
    const id = Number(value)
    return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null
  })

  const scopedOrders = computed(() => {
    const resourceId = resourceIdFilter.value
    if (resourceId == null) {
      return []
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

  const emptyText = computed(() =>
    scopedOrders.value.length ? '没有符合筛选条件的售出订单' : '该资源还没有售出订单',
  )

  function ensureResourceScoped() {
    if (resourceIdFilter.value != null) {
      return true
    }
    void router.replace({ name: 'dev-resource-list' })
    return false
  }

  async function loadOrders() {
    if (!ensureResourceScoped()) {
      return
    }
    auth.hydrate()
    if (!auth.token.trim()) {
      return
    }
    isLoading.value = true
    try {
      orders.value = await listSellerResourcePurchases(auth.token, {
        limit: SELLER_ORDER_FETCH_LIMIT,
      })
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载售出订单失败')
    } finally {
      isLoading.value = false
    }
  }

  /** 退款成功后把这一单换成本地最新值：列表不重拉，退款留痕与状态就地更新。 */
  function applyUpdated(updated: ResourcePurchaseOrder) {
    orders.value = orders.value.map((item) => (item.order_no === updated.order_no ? updated : item))
  }

  onMounted(() => {
    void loadOrders()
  })

  watch(resourceIdFilter, (next, prev) => {
    if (next === prev) {
      return
    }
    filters.status = ''
    filters.keyword = ''
    resetPage()
    void loadOrders()
  })

  return {
    isLoading,
    orders,
    filters,
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
