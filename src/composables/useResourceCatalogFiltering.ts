import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import {
  isCashPaidListingResource,
  isFreeListingResource,
  type ResourceListingSale,
} from '@/shared/resourceSale'
import type { FilterSectionView, McCardItem } from '@/components/resource-catalog/resourceCatalogModel'

/** 已选筛选汇总出来的一枚 chip：父页面据此渲染可逐个移除的筛选条 */
export type ActiveFilterChip = {
  key: string
  sectionId: number
  label: string
  tag: string
}

/**
 * 桌面资源列表（`ResourceCatalog.vue`）**本地**的筛选 / 排序 / 分页派生。
 *
 * 与 `useResourceCatalogListing` 不是一回事：那个是页面侧的「读数与命令口」，只记住列表
 * 上报的结果、把工具条操作转发给列表实例；这里反过来，是列表自己那套数据怎么过滤、
 * 怎么排序、怎么切页、两个分区各有多少条。
 *
 * 卡片数据与标签分组仍由列表填（`cards` / `filterSections` 是这里暴露出去的 ref），
 * 判断口径与原来逐字一致：分区判定用同一对 `isFreeListingResource` /
 * `isCashPaidListingResource`，排序在「点赞」下先比赞数再比更新时间。
 */
export function useResourceCatalogFiltering(options: {
  /** 当前免费 / 付费分区（页面从路由 `?sale=` 写下来） */
  getListingMode: () => ResourceListingSale
  pageSize?: number
}) {
  const route = useRoute()
  const pageSize = options.pageSize ?? 12

  const filterSections = ref<FilterSectionView[]>([])
  const cards = ref<McCardItem[]>([])
  const selectedSort = ref('最新')
  const currentPage = ref(1)

  const activeListingMode = computed<ResourceListingSale>(() => options.getListingMode())

  function normalizeQueryValues(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean)
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }

    return []
  }

  function applyFiltersFromQuery() {
    filterSections.value.forEach((section) => {
      section.selected = normalizeQueryValues(route.query[section.queryKey])
    })
  }

  /**
   * 免费 / 付费两个分区的计数：只遍历本地已加载的 cards，不发请求。
   * 与 `filteredCards` 用同一对判定函数，保证「计数」与「点进去看到的条数」一致。
   */
  const listingCounts = computed(() => {
    let free = 0
    let paid = 0
    for (const card of cards.value) {
      if (isCashPaidListingResource(card.priceFen, card.pricePoints)) {
        paid += 1
      } else if (isFreeListingResource(card.priceFen, card.pricePoints)) {
        free += 1
      }
    }
    return { free, paid }
  })

  /** 已选筛选的汇总（扁平化），工具条按它渲染可移除 chip */
  const activeFilterChips = computed<ActiveFilterChip[]>(() =>
    filterSections.value.flatMap((section) =>
      section.selected.map((tag) => ({
        key: `${section.id}:${tag}`,
        sectionId: section.id,
        label: section.label,
        tag,
      })),
    ),
  )

  const hasActiveFilters = computed(() => activeFilterChips.value.length > 0)

  const filteredCards = computed(() => {
    const filtered = cards.value.filter((card) => {
      if (activeListingMode.value === 'free') {
        if (!isFreeListingResource(card.priceFen, card.pricePoints)) {
          return false
        }
      } else if (!isCashPaidListingResource(card.priceFen, card.pricePoints)) {
        return false
      }

      for (const section of filterSections.value) {
        if (section.selected.length === 0) {
          continue
        }

        const groupValues = card.groupTags[section.label] ?? []
        const matched = section.selected.some((tag) => groupValues.includes(tag))
        if (!matched) {
          return false
        }
      }

      return true
    })

    if (selectedSort.value === '点赞') {
      return filtered
        .slice()
        .sort(
          (a, b) => b.likeCount - a.likeCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
        )
    }
    return filtered.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  })

  const totalPages = computed(() => {
    return Math.max(1, Math.ceil(filteredCards.value.length / pageSize))
  })

  const pagedCards = computed(() => {
    const start = (currentPage.value - 1) * pageSize
    return filteredCards.value.slice(start, start + pageSize)
  })

  function goToPage(page: number) {
    const target = Math.min(Math.max(page, 1), totalPages.value)
    currentPage.value = target
  }

  function nextPage() {
    goToPage(currentPage.value + 1)
  }

  function prevPage() {
    goToPage(currentPage.value - 1)
  }

  function setSort(sort: string) {
    if (['最新', '点赞'].includes(sort)) {
      selectedSort.value = sort
      goToPage(1)
    }
  }

  /** 移除一枚筛选并回到第一页 */
  function removeFilter(sectionId: number, tag: string) {
    const section = filterSections.value.find((item) => item.id === sectionId)
    if (!section) {
      return
    }

    section.selected = section.selected.filter((item) => item !== tag)
    goToPage(1)
  }

  /** 清空某一组筛选 */
  function clearSection(sectionId: number) {
    const section = filterSections.value.find((item) => item.id === sectionId)
    if (!section) {
      return
    }

    section.selected = []
    goToPage(1)
  }

  /** 清空全部筛选（空态主按钮 / 工具条「清除全部」共用） */
  function clearFilters() {
    filterSections.value.forEach((section) => {
      section.selected = []
    })
    goToPage(1)
  }

  /** 点一下标签：已选就取消，未选就加上（长按多选的收尾也走这里） */
  function toggleTag(sectionId: number, tag: string) {
    const section = filterSections.value.find((item) => item.id === sectionId)
    if (!section) {
      return
    }

    if (section.selected.includes(tag)) {
      section.selected = section.selected.filter((item) => item !== tag)
      return
    }

    section.selected = [...section.selected, tag]
  }

  watch(
    () => filteredCards.value.length,
    () => {
      if (currentPage.value > totalPages.value) {
        currentPage.value = totalPages.value
      }
    },
  )

  // 换分区等于换一批数据，回到第一页
  watch(activeListingMode, () => {
    goToPage(1)
  })

  return {
    filterSections,
    cards,
    selectedSort,
    currentPage,
    pageSize,
    listingCounts,
    activeFilterChips,
    hasActiveFilters,
    filteredCards,
    pagedCards,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    setSort,
    removeFilter,
    clearSection,
    clearFilters,
    toggleTag,
    applyFiltersFromQuery,
  }
}
