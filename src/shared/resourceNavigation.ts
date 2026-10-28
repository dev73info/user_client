/**
 * 门户资源导航落点：资源详情统一在「资源列表页的页内详情态」打开
 * （`/<rootSlug>/<entrySlug>?sale=<free|paid>&resource=<id>`，见 ResourceCatalogView）。
 *
 * 独立资源详情页（`/resources/<作者>--<id>` 与 `/<根分区>/<子分区>/<作者>--<id>`）已废弃，
 * 这里给各入口提供同一份落点构造，避免各处再硬拼 slug / 路由段，
 * 也保证免费 / 付费分区跟着资源自身的售卖类型走。
 */
import type { RouteLocationRaw } from 'vue-router'

import type { McResourcePayload } from '@/api/mcResources'
import { getResourceDetailSlug } from '@/api/resourceTags'
import type { RequirementItem } from '@/api/requirements'
import { isApiResourceKind } from '@/shared/resourceApi'
import { isCashPaidListingResource, type ResourceListingSale } from '@/shared/resourceSale'

/** 资源在门户目录里的售卖分区：现金定价 → 付费厅；免费与积分价 → 免费厅（与列表取数口径一致）。 */
export function resourceListingSaleOf(
  priceFen: number | null | undefined,
  pricePoints?: number | null,
): ResourceListingSale {
  return isCashPaidListingResource(priceFen, pricePoints) ? 'paid' : 'free'
}

/** 公开详情只覆盖已上架与需求关联资源；接口资源没有公开预览页。 */
export function canPreviewResource(
  resource: Pick<McResourcePayload, 'visibility' | 'requirement_id' | 'resource_kind'> | null,
): boolean {
  if (!resource || isApiResourceKind(resource.resource_kind)) {
    return false
  }
  return resource.visibility === 'published' || Boolean(resource.requirement_id)
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

/**
 * 需求行绑定资源的深链 slug（`<作者>--<id>`），跳 `/resources/:resourceSlug` 用。
 *
 * 需求行里没有关联资源的售卖类型与分类段，推不出页内详情需要的 `?sale=` / `:rootSlug` / `:entrySlug`，
 * 所以统一走这条轻量重定向（见 ResourceDetailRedirectView），由它拉了资源再落到页内详情态。
 *
 * 作者口径与拆分前逐字一致：需求发布人 → 当前登录用户 → 资源作者 → 需求标题。
 */
export function requirementBoundResourceSlug(
  item: Pick<RequirementItem, 'creator' | 'title' | 'bound_resource_id' | 'bound_resource_author'>,
  currentUsername?: string,
): string {
  const ownerName =
    item.creator?.trim() || currentUsername || item.bound_resource_author?.trim() || item.title
  return getResourceDetailSlug(item.bound_resource_id as number, ownerName)
}
