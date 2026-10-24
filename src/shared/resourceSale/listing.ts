import { fenToYuanText, type ResourcePurchaseOrderLike } from './price'

/** 现金标价（分 > 0）。入参一律传买断价 `buyout_price_fen`：`price_fen` 是冻结的历史值。 */
export function isPaidResource(priceFen: number | null | undefined): boolean {
  const fen = Number(priceFen ?? 0)
  return Number.isFinite(fen) && fen > 0
}

/** 积分一口价（积分 > 0）。 */

export function isPointsResource(pricePoints: number | null | undefined): boolean {
  const points = Number(pricePoints ?? 0)
  return Number.isFinite(points) && points > 0
}

/**
 * 编辑已有资源时能否设积分售价：积分价可改现金价，现金价不可改积分价。
 * 「设过现金价」看后端的 `cash_price_locked`（改回免费也算设过），旧数据没有该字段时看当前现金价。
 */

export function canSwitchToPointsPrice(
  savedPriceFen: number | null | undefined,
  cashPriceLocked?: boolean | null,
): boolean {
  return !cashPriceLocked && !isPaidResource(savedPriceFen)
}

/** 现金或积分任一标价 > 0，即需购买（或作者豁免）。 */

export function isPricedResource(
  priceFen: number | null | undefined,
  pricePoints?: number | null,
): boolean {
  return isPaidResource(priceFen) || isPointsResource(pricePoints)
}

/**
 * 门户「免费资源」列表：不含现金付费；真正免费与积分标价都进此厅。
 * 积分价资源不进付费厅、也不进积分商城商品区。
 */

export function isFreeListingResource(
  priceFen: number | null | undefined,
  _pricePoints?: number | null,
): boolean {
  return !isPaidResource(priceFen)
}

/**
 * 门户「付费资源」列表：仅现金标价（买断价 `buyout_price_fen > 0`），不含积分售价。
 */

export function isCashPaidListingResource(
  priceFen: number | null | undefined,
  pricePoints?: number | null,
): boolean {
  return isPaidResource(priceFen) && !isPointsResource(pricePoints)
}

/**
 * 积分标价资源（`price_points > 0` 且非现金付费）。
 * 展示归免费资源厅；付费厅与积分商城都不列这类项目。
 */

export function isPointsListingResource(
  priceFen: number | null | undefined,
  pricePoints?: number | null,
): boolean {
  return isPointsResource(pricePoints) && !isPaidResource(priceFen)
}

/** 门户资源目录的售价分区：写在路由 `?sale=` 上，在分类跳转间保持。 */

export type ResourceListingSale = 'free' | 'paid'

/**
 * 门户资源目录默认展示的分区。
 * 「免费资源 / 付费资源」两个导航项合并成「资源项目」后，页内切换默认落在免费。
 */

export const DEFAULT_RESOURCE_LISTING_SALE: ResourceListingSale = 'free'

/** 页内分段切换（segmented control）的两项：值 + 文案，桌面与移动端共用同一份。 */

export const RESOURCE_LISTING_SALE_OPTIONS: ReadonlyArray<{
  value: ResourceListingSale
  label: string
}> = [
  { value: 'free', label: '免费资源' },
  { value: 'paid', label: '付费资源' },
]

export function parseResourceListingSale(raw: unknown): ResourceListingSale | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'free' || value === 'paid') {
    return value
  }
  return null
}

/** 由路由 `?sale=` 解析当前分区；缺失或非法一律回落到 {@link DEFAULT_RESOURCE_LISTING_SALE}。 */

export function resolveResourceListingSale(raw: unknown): ResourceListingSale {
  return parseResourceListingSale(raw) ?? DEFAULT_RESOURCE_LISTING_SALE
}

/**
 * 列表 / 详情用的价格文案：免费 / ¥x.xx / N 积分。
 * 积分价优先于现金价（二者互斥，正常只会有一侧 > 0）。
 */

export function formatResourcePriceLabel(
  priceFen: number | null | undefined,
  pricePoints?: number | null,
): string {
  const points = Number(pricePoints ?? 0)
  if (Number.isFinite(points) && points > 0) {
    return `${Math.trunc(points)} 积分`
  }
  const fen = Number(priceFen ?? 0)
  if (!Number.isFinite(fen) || fen <= 0) {
    return '免费'
  }
  return `¥${fenToYuanText(fen)}`
}

/** 订单金额展示：积分单优先，否则现金。 */

export function formatPurchaseAmountLabel(order: ResourcePurchaseOrderLike): string {
  const points = Number(order.amount_points ?? 0)
  if (Number.isFinite(points) && points > 0) {
    return `${Math.trunc(points)} 积分`
  }
  return `¥${fenToYuanText(order.amount_fen ?? 0)}`
}

/**
 * 当前访客是否可下载（前端展示闸，最终以后端为准）。
 * 免费 / 已购 / 作者本人 → 可下；其余付费未购 → 不可。
 */
