/**
 * 门户资源导航落点：资源详情统一在「资源列表页的页内详情态」打开
 * （`/<rootSlug>/<entrySlug>?sale=<free|paid>&resource=<id>`，见 ResourceCatalogView）。
 *
 * 独立资源详情页（`/resources/<作者>--<id>` 与 `/<根分区>/<子分区>/<作者>--<id>`）已废弃，
 * 这里给各入口提供同一份落点构造，避免各处再硬拼 slug / 路由段，
 * 也保证免费 / 付费分区跟着资源自身的售卖类型走。
 */
import type { RouteLocationRaw } from 'vue-router'

import { isCashPaidListingResource, type ResourceListingSale } from '@/shared/resourceSale'

/** 资源在门户目录里的售卖分区：现金定价 → 付费厅；免费与积分价 → 免费厅（与列表取数口径一致）。 */
export function resourceListingSaleOf(
  priceFen: number | null | undefined,
  pricePoints?: number | null,
): ResourceListingSale {
  return isCashPaidListingResource(priceFen, pricePoints) ? 'paid' : 'free'
}

/** 页内详情落点：资源列表页带 `?sale=` 与 `?resource=` 打开选中项。 */
export function resourceDetailLocation(input: {
  resourceId: number
  rootSlug: string
  entrySlug: string
  sale: ResourceListingSale
}): RouteLocationRaw {
  return {
    name: 'resource-catalog',
    params: { rootSlug: input.rootSlug, entrySlug: input.entrySlug },
    query: { sale: input.sale, resource: String(input.resourceId) },
  }
}
