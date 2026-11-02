/** 按版本售卖：识别、版本价标价与主按钮购买闸的纯函数口径。 */
import { describe, expect, it } from 'vitest'

import {
  formatVersionSalePriceLabel,
  isPurchasableVersion,
  isVersionSaleResource,
  needsVersionPurchase,
  resolveVersionPurchaseTarget,
  resolveVersionSaleMinPriceFen,
  resolveVersionSaleMinPriceVersion,
} from '@/shared/resourceSale'

const paidVersion = (priceFen: number, purchasable = true) => ({ price_fen: priceFen, purchasable })

describe('resourceSale 按版本售卖口径', () => {
  it('版本可购：purchasable 且版本价大于 0', () => {
    expect(isPurchasableVersion(paidVersion(1))).toBe(true)
    expect(isPurchasableVersion(paidVersion(0))).toBe(false)
    expect(isPurchasableVersion({ price_fen: 100, purchasable: false })).toBe(false)
    expect(isPurchasableVersion(null)).toBe(false)
  })

  it('资源级无买断价 / 积分价且存在可购版本时，按版本售卖', () => {
    expect(
      isVersionSaleResource({
        buyoutPriceFen: 0,
        pricePoints: 0,
        versions: [paidVersion(1)],
      }),
    ).toBe(true)
    // 资源级已有买断价或积分价：不按版本售卖处理
    expect(
      isVersionSaleResource({
        buyoutPriceFen: 9900,
        pricePoints: 0,
        versions: [paidVersion(1)],
      }),
    ).toBe(false)
    expect(
      isVersionSaleResource({
        buyoutPriceFen: 0,
        pricePoints: 50,
        versions: [paidVersion(1)],
      }),
    ).toBe(false)
    // 版本全免费 / 没有版本：不是按版本售卖
    expect(
      isVersionSaleResource({ buyoutPriceFen: 0, pricePoints: 0, versions: [paidVersion(0)] }),
    ).toBe(false)
    expect(isVersionSaleResource({ buyoutPriceFen: 0, pricePoints: 0, versions: [] })).toBe(false)
  })

  it('最低版本价取可购版本的最小值，同价保留列表靠前的较新版本', () => {
    const versions = [paidVersion(300), paidVersion(100), paidVersion(200), paidVersion(0)]
    expect(resolveVersionSaleMinPriceFen(versions)).toBe(100)
    expect(resolveVersionSaleMinPriceFen([paidVersion(0)])).toBeNull()
    expect(resolveVersionSaleMinPriceFen(null)).toBeNull()

    const samePrice = [
      { id: 2, ...paidVersion(100) },
      { id: 1, ...paidVersion(100) },
    ]
    expect(resolveVersionSaleMinPriceVersion(samePrice)?.id).toBe(2)
  })

  it('标价文案：¥x 起；没有有效版本价时回落到免费', () => {
    expect(formatVersionSalePriceLabel(1)).toBe('¥0.01 起')
    expect(formatVersionSalePriceLabel(12345)).toBe('¥123.45 起')
    expect(formatVersionSalePriceLabel(0)).toBe('免费')
    expect(formatVersionSalePriceLabel(null)).toBe('免费')
  })

  it('主按钮购买闸：按版本售卖且访客未持有权益', () => {
    const versions = [paidVersion(1), paidVersion(100)]
    expect(
      needsVersionPurchase({
        buyoutPriceFen: 0,
        pricePoints: 0,
        versions,
        purchasedByMe: false,
        isOwner: false,
      }),
    ).toBe(true)
    // 已持有任一版本权益 / 作者本人：主按钮不再要求购买
    expect(
      needsVersionPurchase({
        buyoutPriceFen: 0,
        pricePoints: 0,
        versions,
        purchasedByMe: true,
        isOwner: false,
      }),
    ).toBe(false)
    expect(
      needsVersionPurchase({
        buyoutPriceFen: 0,
        pricePoints: 0,
        versions,
        purchasedByMe: false,
        isOwner: true,
      }),
    ).toBe(false)
    // 最新版本 0 价也不能当免费：0 价版本不单卖，只能靠买断取得
    expect(
      needsVersionPurchase({
        buyoutPriceFen: 0,
        pricePoints: 0,
        versions: [paidVersion(0), paidVersion(100)],
        purchasedByMe: false,
        isOwner: false,
      }),
    ).toBe(true)
    // 买断 / 积分资源不走这个闸
    expect(
      needsVersionPurchase({
        buyoutPriceFen: 9900,
        pricePoints: 0,
        versions,
        purchasedByMe: false,
        isOwner: false,
      }),
    ).toBe(false)
  })

  it('403 转购买目标：失败版本可购就用它，否则整包或最低价可购版本', () => {
    const freeLatest = { id: 1, ...paidVersion(0) }
    const paidOlder = { id: 2, ...paidVersion(100) }
    const purchasable = { id: 3, ...paidVersion(50) }
    const versions = [freeLatest, paidOlder]

    expect(resolveVersionPurchaseTarget(purchasable, { versions })).toBe(purchasable)
    expect(
      resolveVersionPurchaseTarget(freeLatest, { buyoutPriceFen: 0, pricePoints: 0, versions }),
    ).toBe(paidOlder)
    // 资源有买断 / 积分价：按整包买，不能下单价为 0 的版本
    expect(
      resolveVersionPurchaseTarget(freeLatest, { buyoutPriceFen: 9900, pricePoints: 0, versions }),
    ).toBeNull()
    expect(
      resolveVersionPurchaseTarget(freeLatest, { buyoutPriceFen: 0, pricePoints: 50, versions }),
    ).toBeNull()
    // 没有任何可购版本：仍回落到 null（全免费资源不会走到购买面板）
    expect(
      resolveVersionPurchaseTarget(freeLatest, {
        buyoutPriceFen: 0,
        pricePoints: 0,
        versions: [freeLatest],
      }),
    ).toBeNull()
  })
})
