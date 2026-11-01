/** 按版本售卖：识别、版本价标价与主按钮购买闸的纯函数口径。 */
import { describe, expect, it } from 'vitest'

import {
  formatVersionSalePriceLabel,
  isPurchasableVersion,
  isVersionSaleResource,
  needsVersionPurchase,
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

  it('主按钮购买闸：最新版本有价且访客未持有权益', () => {
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
    // 最新版本免费：不挡免费下载
    expect(
      needsVersionPurchase({
        buyoutPriceFen: 0,
        pricePoints: 0,
        versions: [paidVersion(0), paidVersion(100)],
        purchasedByMe: false,
        isOwner: false,
      }),
    ).toBe(false)
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
})
