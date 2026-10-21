/**
 * 资源目录页展示层的纯函数与契约类型。
 *
 * 从 `views/ResourceCatalogView.vue` 抽出来，供视图、工具条与分页组件共用：
 * 页码收口、`?resource=` 深链解析、专区回退、query 改写、视口分档。
 * 只做「值 → 值」的映射，不读 store、不发请求，便于单测。
 */
import type { LocationQueryRaw } from 'vue-router'

import type { McProcessedTagTree, McTagCatalogRoot } from '@/api/resourceTags'
import type { ResourceListingSale } from '@/shared/resourceSale'

/** 专区下拉的一档（根分区）：切专区沿着它的第一个子分区落点走。 */
export type CatalogRootTab = {
  slug: string
  label: string
  firstEntrySlug: string | null
}

/** 已选筛选汇总出来的一枚 chip（由 ResourceCatalog 上报，点击可逐个移除） */
export type CatalogFilterChip = {
  key: string
  sectionId: number
  label: string
  tag: string
}

/** 列表上报的分页读数：计数、页码与前后是否可翻都在里面。 */
export type CatalogPageState = {
  current: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  totalItems: number
}

/** 排序档（顺序即下拉顺序）：排序在列表本地做，切换不重新取数。 */
export const CATALOG_SORT_OPTIONS = ['最新', '点赞'] as const

export type CatalogSort = (typeof CATALOG_SORT_OPTIONS)[number]

/** 窄屏分档：≤900px 走移动端列表，与 `styles/resource-catalog.css` 的断点同一档。 */
export const CATALOG_MOBILE_MAX_WIDTH = 900

export function isCatalogMobileWidth(width: number): boolean {
  return width <= CATALOG_MOBILE_MAX_WIDTH
}

/** 多页时才出现的页码胶囊：页数多时用「…」收口，只留首尾与当前附近 */
export function buildCatalogPageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 1) {
    return []
  }
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const keep = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...keep].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)
  const numbers: Array<number | '…'> = []
  let previous = 0
  for (const page of sorted) {
    if (previous !== 0 && page - previous > 1) {
      numbers.push('…')
    }
    numbers.push(page)
    previous = page
  }
  return numbers
}

/** `?resource=<id>` 深链解析：非法 / 缺省一律当作未选中。 */
export function parseResourceIdParam(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  const id = Number.parseInt(String(raw ?? ''), 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * 专区落点：地址上的 rootSlug 认得出来就用它，
 * 否则退回第一个有子分区的专区（空专区点了没内容可看），再退回第一档。
 */
export function resolveCatalogRoot(
  tree: McProcessedTagTree,
  rootSlug: string,
): McTagCatalogRoot | null {
  if (rootSlug) {
    const matched = tree.roots.find((root) => root.key === rootSlug)
    if (matched) {
      return matched
    }
  }

  return tree.roots.find((root) => root.entries.length > 0) ?? tree.roots[0] ?? null
}

/** 分类跳转沿用的 query：分区（`?sale=`）始终带上，切根 / 二级分区也不丢。 */
export function withSaleQuery(
  query: LocationQueryRaw,
  sale: ResourceListingSale,
): LocationQueryRaw {
  return { ...query, sale }
}

/**
 * 摘掉页内详情带来的 `resource` 与推广码 `promo`。
 *
 * 选中项只在当前列表里成立，换专区 / 子分区 / 免费付费分区时一起摘掉
 * （否则会出现「地址上选中的是付费资源、左边却在看免费分区」这种对不上的状态）；
 * R029：推广码只对分享链接指向的那条资源有效，跟着选中项一起改写会把别人的订单记成这条资源带来的。
 */
export function withoutSelectionQuery(query: LocationQueryRaw): LocationQueryRaw {
  const next = { ...query }
  delete next.resource
  delete next.promo
  return next
}
