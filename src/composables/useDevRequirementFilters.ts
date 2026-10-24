import { computed, reactive, watch } from 'vue'

import { useClientPagination } from '@/composables/useClientPagination'
import { rowCustomer, type DevMyOrderRow } from '@/shared/devDelivery'

/**
 * 「我的接单」的筛选域：关键词 + 状态档位 + 客户端分页，外加「路由带来的需求号灌进搜索框」。
 *
 * 这一页的数据源本来就是「把当前开发者的需求单与交付、到账一次取回」，所以筛选全在客户端做，
 * 分页也只是切片（与资源项目、团队资源、收益钱包、需求大厅同构，都带表尾分页器）。
 *
 * 两处口径由页面注入，不在这里再判一遍：
 * - `statusKeyOf`：「待签合同」是签约状态推出来的中间态（不是需求状态码），要读页面那份
 *   `signingStatusMap`；补充行（`item` 为空）另有 `unlinked` 一档。
 * - `requirementIdQuery`：路由上的 `requirement_id`（`useRoute()` 留在页面，composable 不碰路由）。
 *
 * 行的来源（`rows` / `mergedRows`）仍是页面的单实例：这里只吃一个 getter，不持有行。
 */
export function useDevRequirementFilters(options: {
  /** 归并好的行（页面的单实例，这里只读）。 */
  rows: () => DevMyOrderRow[]
  /** 一行的状态档位（与状态筛选下拉的取值同一套字符串）。 */
  statusKeyOf: (row: DevMyOrderRow) => string
  /** 路由上的需求号：总览页带 `requirement_id` 跳进来时用它灌搜索框。 */
  requirementIdQuery: () => string
}) {
  // 搜索与状态筛选都在前端做。
  const filters = reactive({
    keyword: '',
    status: '',
  })

  const hasActiveFilters = computed(
    () => Boolean(filters.keyword.trim()) || Boolean(filters.status),
  )

  /* 搜索覆盖需求与交付／回款两侧的标识：开发者核对一笔到账时，
     手里多数只有其中任意一个标识，全给上才不用先猜是哪个字段。 */
  function keywordValuesOf(row: DevMyOrderRow): string[] {
    return [
      row.requirementId ?? '',
      row.item?.title ?? row.title ?? '',
      row.item?.description ?? '',
      row.delivery?.resourceTitle ?? '',
      row.delivery?.latestVersion ?? '',
      rowCustomer(row) ?? '',
      row.receipts.map((receipt) => receipt.paymentId).join(' '),
    ]
  }

  const filteredRows = computed(() => {
    const keyword = filters.keyword.trim().toLowerCase()

    return options.rows().filter((row) => {
      if (filters.status && options.statusKeyOf(row) !== filters.status) {
        return false
      }

      if (!keyword) {
        return true
      }

      return keywordValuesOf(row).some((value) => value.toLowerCase().includes(keyword))
    })
  })

  const {
    page,
    pageSize,
    total: filteredTotal,
    paged: pagedRows,
  } = useClientPagination(filteredRows)

  /* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
  watch([() => filters.keyword, () => filters.status], () => {
    page.value = 1
  })

  /**
   * 总览页的进行中项目与最近交付带 `requirement_id` 跳进来（见 DevHomeView 的 openMyOrder）：
   * 这一页的需求单一次全取回、筛选在前端做，所以把编号灌进搜索框就是「定位到这一单」，
   * 顺带在搜索框里留下「列表为什么只剩一条」的说明；清空搜索框即可回全量。
   *
   * `seededKeyword` 记住上一次由跳转灌进来的编号：路由参数被去掉时（例如点侧边栏回这一页）
   * 只回收它，用户在搜索框里自己敲的词不动。
   */
  let seededKeyword = ''

  function applyRouteRequirementFilter() {
    const requirementId = options.requirementIdQuery()

    if (seededKeyword && filters.keyword === seededKeyword) {
      filters.keyword = requirementId
    } else if (requirementId) {
      filters.keyword = requirementId
    }

    seededKeyword = requirementId
  }

  applyRouteRequirementFilter()
  watch(options.requirementIdQuery, applyRouteRequirementFilter)

  return { filters, hasActiveFilters, filteredRows, page, pageSize, filteredTotal, pagedRows }
}
