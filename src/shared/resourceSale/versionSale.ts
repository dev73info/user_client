import { fenToYuanText } from './price'

/**
 * 按版本售卖的资源。
 *
 * 后端下载判定（`resource/src/application/service.rs`）：资源买断价、积分价、任一未删除
 * 版本的 `price_fen` 只要有一项大于 0，下载**任何**版本都需要权益；版本价为零表示该版本
 * 不单卖，只能靠买断权益取得。单版本下单接口按 `version_id` 取版本价。
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

/**
 * 403 转购买时选下单目标版本。
 *
 * 0 价版本不可单卖：失败版本本身可购就用它；否则资源有买断价 / 积分价时按整包买（null）；
 * 剩下的是版本售卖资源，回落到最低价可购版本。
 */
export function resolveVersionPurchaseTarget<T extends ResourceSaleVersionLike>(
  failedVersion: T | null | undefined,
  input: {
    buyoutPriceFen?: number | null
    pricePoints?: number | null
    versions?: readonly T[] | null
  },
): T | null {
  if (failedVersion && isPurchasableVersion(failedVersion)) {
    return failedVersion
  }
  const buyout = Number(input.buyoutPriceFen ?? 0)
  const points = Number(input.pricePoints ?? 0)
  if ((Number.isFinite(buyout) && buyout > 0) || (Number.isFinite(points) && points > 0)) {
    return null
  }
  return resolveVersionSaleMinPriceVersion(input.versions)
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
 * 主下载按钮（最新版本）是否需要先购买：按版本售卖且访客未持有权益就一律先购买。
 *
 * 0 价版本不单卖（只能靠买断取得），所以不能因为它「最新且免费」就放行下载；
 * 版本列表的按钮仍先试下载，403 后按失败版本转购买。
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
  return isVersionSaleResource(input)
}
