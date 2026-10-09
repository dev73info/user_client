import { describe, expect, it } from 'vitest'

import {
  canBuyerDownload,
  canDownloadResource,
  canSelfRefundPurchase,
  canSwitchToPointsPrice,
  fenToYuanText,
  formatPurchaseAmountLabel,
  formatResourcePriceLabel,
  isPaidResource,
  isPointsResource,
  isPricedResource,
  isPurchaseRequiredError,
  needsPurchase,
  parsePointsPriceInput,
  parseYuanPriceInput,
  resourcePurchaseStatusLabel,
  toResourcePayChannel,
  yuanToFen,
} from '@/shared/resourceSale'

describe('resourceSale', () => {
  it('yuanToFen / fenToYuanText round-trip', () => {
    expect(yuanToFen(1.23)).toBe(123)
    expect(yuanToFen('9.99')).toBe(999)
    expect(yuanToFen(-1)).toBe(0)
    expect(yuanToFen('abc')).toBe(0)
    expect(fenToYuanText(199)).toBe('1.99')
    expect(fenToYuanText(0)).toBe('0.00')
  })

  it('parseYuanPriceInput validates form input', () => {
    expect(parseYuanPriceInput('')).toEqual({ ok: true, fen: 0 })
    expect(parseYuanPriceInput('1.5')).toEqual({ ok: true, fen: 150 })
    expect(parseYuanPriceInput('1.234').ok).toBe(false)
    expect(parseYuanPriceInput('-1').ok).toBe(false)
  })

  it('canSwitchToPointsPrice blocks cash → points only', () => {
    expect(canSwitchToPointsPrice(990)).toBe(false)
    expect(canSwitchToPointsPrice(0)).toBe(true)
    expect(canSwitchToPointsPrice(null)).toBe(true)
    expect(canSwitchToPointsPrice(undefined)).toBe(true)
  })

  it('canSwitchToPointsPrice keeps blocking after cash price was cleared to free', () => {
    expect(canSwitchToPointsPrice(0, true)).toBe(false)
    expect(canSwitchToPointsPrice(0, false)).toBe(true)
    expect(canSwitchToPointsPrice(990, false)).toBe(false)
  })

  it('parsePointsPriceInput validates integer points', () => {
    expect(parsePointsPriceInput('')).toEqual({ ok: true, points: 0 })
    expect(parsePointsPriceInput('100')).toEqual({ ok: true, points: 100 })
    expect(parsePointsPriceInput('1.5').ok).toBe(false)
    expect(parsePointsPriceInput('-1').ok).toBe(false)
  })

  it('formats free / cash / points labels', () => {
    expect(formatResourcePriceLabel(0)).toBe('免费')
    expect(formatResourcePriceLabel(null)).toBe('免费')
    expect(formatResourcePriceLabel(500)).toBe('¥5.00')
    expect(formatResourcePriceLabel(0, 120)).toBe('120 积分')
    expect(formatResourcePriceLabel(500, 120)).toBe('120 积分')
    expect(isPaidResource(0)).toBe(false)
    expect(isPaidResource(1)).toBe(true)
    expect(isPointsResource(0)).toBe(false)
    expect(isPointsResource(10)).toBe(true)
    expect(isPricedResource(0, 0)).toBe(false)
    expect(isPricedResource(1, 0)).toBe(true)
    expect(isPricedResource(0, 1)).toBe(true)
  })

  it('formats purchase amount labels', () => {
    expect(formatPurchaseAmountLabel({ status: 'paid', amount_fen: 199, amount_points: 0 })).toBe(
      '¥1.99',
    )
    expect(formatPurchaseAmountLabel({ status: 'paid', amount_fen: 0, amount_points: 80 })).toBe(
      '80 积分',
    )
  })

  it('download gate branches for cash and points', () => {
    expect(canDownloadResource({ price_fen: 0 })).toBe(true)
    expect(canDownloadResource({ price_fen: 100, purchased_by_me: true })).toBe(true)
    expect(canDownloadResource({ price_fen: 100, purchased_by_me: false, creator: 'dev' }, 'dev')).toBe(
      true,
    )
    expect(
      canDownloadResource({ price_fen: 100, purchased_by_me: false, creator: 'dev' }, 'buyer'),
    ).toBe(false)
    expect(
      canDownloadResource({ price_points: 50, purchased_by_me: false, creator: 'dev' }, 'buyer'),
    ).toBe(false)
    expect(canBuyerDownload({ priceFen: 100, purchasedByMe: false, isOwner: false })).toBe(false)
    expect(canBuyerDownload({ priceFen: 100, purchasedByMe: false, isOwner: true })).toBe(true)
    expect(canBuyerDownload({ pricePoints: 50, purchasedByMe: false, isOwner: false })).toBe(false)
    expect(needsPurchase({ priceFen: 100, purchasedByMe: false, isOwner: false })).toBe(true)
    expect(needsPurchase({ pricePoints: 50, purchasedByMe: false, isOwner: false })).toBe(true)
    expect(needsPurchase({ pricePoints: 50, purchasedByMe: true, isOwner: false })).toBe(false)
    expect(needsPurchase({ priceFen: 0, pricePoints: 0 })).toBe(false)
  })

  it('purchase-required error detection', () => {
    expect(isPurchaseRequiredError('请先购买该资源后再下载')).toBe(true)
    expect(isPurchaseRequiredError('网络错误')).toBe(false)
  })

  it('self-refund only for paid undownloaded orders', () => {
    expect(canSelfRefundPurchase({ status: 'paid', first_downloaded_at: null })).toBe(true)
    expect(canSelfRefundPurchase({ status: 'paid', first_downloaded_at: '2026-10-08' })).toBe(false)
    expect(canSelfRefundPurchase({ status: 'refunded', first_downloaded_at: null })).toBe(false)
  })

  it('maps pay channel and status labels', () => {
    expect(toResourcePayChannel('wechat')).toBe('wx_pub')
    expect(toResourcePayChannel('alipay')).toBe('alipay')
    expect(resourcePurchaseStatusLabel('paid')).toBe('已购买')
    expect(resourcePurchaseStatusLabel('pending')).toBe('待支付')
  })
})
