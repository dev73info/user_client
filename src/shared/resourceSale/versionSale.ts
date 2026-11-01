import { fenToYuanText } from './price'

/**
 * 按版本售卖的资源。
 *
 * 后端下载判定（`resource/src/application/service.rs`）：资源买断价与积分价都为 0 时，
 * 版本 `price_fen > 0` 的那一版需要购买；单版本下单接口按 `version_id` 取版本价。
 * 所以「资源级标价 0 + 至少一个可购版本」就是按版本售卖，价格不能当成免费。
 */

/** 判定版本售卖需要的最小版本字段（`VersionResponse` 的超集）。 */
export type ResourceSaleVersionLike = {
  price_fen?: number | null
  purchasable?: boolean | null
}

/** 该版本可单独购买且价格有效（`purchasable` 后端即 `price_fen > 0` 的判定结果）。 */
export function isPurchasableVersion(version: ResourceSaleVersionLike | null | undefined): boolean {
  if (!version?.purchasable) {
    return false
  }
  const fen = Number(version.price_fen ?? 0)
  return Number.isFinite(fen) && fen > 0
}

/**
 * 资源是否按版本售卖：资源级没有买断价、也没有积分价，且已加载的版本里
 * 至少有一条可单独购买。
 */
export function isVersionSaleResource(input: {
  buyoutPriceFen?: number | null
  pricePoints?: number | null
  versions?: readonly ResourceSaleVersionLike[] | null
}): boolean {
  const buyout = Number(input.buyoutPriceFen ?? 0)
  if (Number.isFinite(buyout) && buyout > 0) {
    return false
  }
  const points = Number(input.pricePoints ?? 0)
  if (Number.isFinite(points) && points > 0) {
    return false
  }
  return (input.versions ?? []).some(isPurchasableVersion)
}

/**
 * 版本售卖的最低价（分），用于「¥x 起」标价；没有可购版本时返回 null。
 * 版本列表按发布时间倒序（后端 `created_at DESC`），同价时取列表靠前的较新版本。
 */
export function resolveVersionSaleMinPriceFen(
  versions?: readonly ResourceSaleVersionLike[] | null,
): number | null {
  let min: number | null = null
  for (const version of versions ?? []) {
    if (!isPurchasableVersion(version)) {
      continue
    }
    const fen = Number(version.price_fen)
    if (min === null || fen < min) {
      min = fen
    }
  }
  return min
}

/** 最低价对应的版本：购买面板的默认目标版本。 */
export function resolveVersionSaleMinPriceVersion<T extends ResourceSaleVersionLike>(
  versions?: readonly T[] | null,
): T | null {
  let picked: T | null = null
  for (const version of versions ?? []) {
    if (!isPurchasableVersion(version)) {
      continue
    }
    if (!picked || Number(version.price_fen) < Number(picked.price_fen)) {
      picked = version
    }
  }
  return picked
}

/** 版本售卖标价：「¥x 起」；没有有效版本价时回落到「免费」。 */
export function formatVersionSalePriceLabel(minPriceFen: number | null | undefined): string {
  const fen = Number(minPriceFen ?? 0)
  if (!Number.isFinite(fen) || fen <= 0) {
    return '免费'
  }
  return `¥${fenToYuanText(fen)} 起`
}

/**
 * 主下载按钮（最新版本）是否需要先购买：按版本售卖，且最新版本本身有价。
 * 最新版本免费时不挡下载——版本列表里付费版本各自走 403 转购买。
 */
export function needsVersionPurchase(input: {
  buyoutPriceFen?: number | null
  pricePoints?: number | null
  purchasedByMe?: boolean | null
  isOwner?: boolean | null
  versions?: readonly ResourceSaleVersionLike[] | null
}): boolean {
  if (input.purchasedByMe || input.isOwner) {
    return false
  }
  if (!isVersionSaleResource(input)) {
    return false
  }
  const latest = input.versions?.[0]
  const latestFen = Number(latest?.price_fen ?? 0)
  return Number.isFinite(latestFen) && latestFen > 0
}
