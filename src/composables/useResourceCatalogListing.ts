import { computed, ref } from 'vue'

// 只借列表实例的类型（暴露出来的 setSort / goToPage 等），运行时不引用这个 SFC
import type ResourceCatalog from '@/components/ResourceCatalog.vue'
import {
  CATALOG_SORT_OPTIONS,
  buildCatalogPageNumbers,
  type CatalogFilterChip,
  type CatalogPageState,
  type CatalogSort,
} from '@/shared/resourceCatalogDisplay'

/**
 * 资源目录页「列表侧」的读数与命令口。
 *
 * 列表数据在 `ResourceCatalog` 里（分区切换、排序、筛选、分页全是它本地做的），
 * 这一层只做两件事：记住它上报的读数（分区计数 / 已选筛选 / 页码），
 * 以及把工具条上的操作转发给它暴露出来的方法。本层不发请求。
 */
export function useResourceCatalogListing() {
  const catalogRef = ref<InstanceType<typeof ResourceCatalog> | null>(null)

  /** 排序选中项：工具条与列表实例两边一起改，切换不重新取数。 */
  const selectedSort = ref<CatalogSort>(CATALOG_SORT_OPTIONS[0])

  // 工具条上的三块状态都由 ResourceCatalog 上报（数据在它那里，切换分区 / 排序仍是本地过滤）
  const listingCounts = ref<{ free: number; paid: number }>({ free: 0, paid: 0 })
  const activeFilterChips = ref<CatalogFilterChip[]>([])
  const pageState = ref<CatalogPageState>({
    current: 1,
    total: 1,
    hasPrev: false,
    hasNext: false,
    totalItems: 0,
  })

  /**
   * 列表是否至少上报过一次。
   *
   * 工具条上的计数、统计与分页都来自列表本地数据，而详情态下**整个列表不渲染**
   * （见模板里的主从单栏）。冷启动直接带 `?resource=<id>` 打开时列表没跑过，
   * 这里若照旧渲染，工具条会显示一个假的「共 0 个」；所以上报过之前一律不显示这些数字。
   * 从列表点进详情的情形不受影响：上一次上报的值仍在，返回时也不会闪一下 0。
   */
  const listingReported = ref(false)

  /** 多页时才出现的页码胶囊（收口规则见 `@/shared/resourceCatalogDisplay`）。 */
  const pageNumbers = computed(() =>
    buildCatalogPageNumbers(pageState.value.current, pageState.value.total),
  )

  function setCatalogSort(sort: CatalogSort) {
    selectedSort.value = sort
    catalogRef.value?.setSort(sort)
  }

  function handleSortCommand(command: unknown) {
    const sort = String(command)
    if (CATALOG_SORT_OPTIONS.includes(sort as CatalogSort)) {
      setCatalogSort(sort as CatalogSort)
    }
  }

  function handlePageStateChange(state: CatalogPageState) {
    pageState.value = state
    listingReported.value = true
  }

  function handleListingCounts(counts: { free: number; paid: number }) {
    listingCounts.value = counts
    listingReported.value = true
  }

  function handleFiltersChange(chips: CatalogFilterChip[]) {
    activeFilterChips.value = chips
  }

  function removeFilterChip(chip: CatalogFilterChip) {
    catalogRef.value?.removeFilter(chip.sectionId, chip.tag)
  }

  function clearAllFilters() {
    catalogRef.value?.clearFilters()
  }

  function goToPage(page: number) {
    catalogRef.value?.goToPage(page)
  }

  function goPrevPage() {
    catalogRef.value?.prevPage()
  }

  function goNextPage() {
    catalogRef.value?.nextPage()
  }

  return {
    catalogRef,
    selectedSort,
    listingCounts,
    activeFilterChips,
    pageState,
    listingReported,
    pageNumbers,
    handleSortCommand,
    handlePageStateChange,
    handleListingCounts,
    handleFiltersChange,
    removeFilterChip,
    clearAllFilters,
    goToPage,
    goPrevPage,
    goNextPage,
  }
}
