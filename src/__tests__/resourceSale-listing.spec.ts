/** 售卖与退款口径：大厅免费/付费/积分分档、下载闸门、自助与卖家退款、渠道与状态文案。 */
import { describe, expect, it } from 'vitest'

import {
  canBuyerDownload,
  canDownloadResource,
  canSelfRefundPurchase,
  canSellerRefundPurchase,
  isCashPaidListingResource,
  isFreeListingResource,
  isPointsListingResource,
  isPointsPurchaseOrder,
  isPurchaseRequiredError,
  needsPurchase,
  parseResourceListingSale,
  refundInitiatorLabel,
  resourcePurchaseStatusLabel,
  toResourcePayChannel,
} from '@/shared/resourceSale'

describe('resourceSale 售卖与退款口径', () => {
  it('portal listing: free hall includes points; paid / mall exclude points', () => {
    expect(isFreeListingResource(0, 0)).toBe(true)
    expect(isFreeListingResource(0, 50)).toBe(true)
    expect(isFreeListingResource(100, 0)).toBe(false)
    expect(isCashPaidListingResource(100, 0)).toBe(true)
    expect(isCashPaidListingResource(0, 50)).toBe(false)
    expect(isCashPaidListingResource(100, 50)).toBe(false)
    expect(isCashPaidListingResource(0, 0)).toBe(false)
    expect(isPointsListingResource(0, 50)).toBe(true)
    expect(isPointsListingResource(100, 0)).toBe(false)
    expect(isPointsListingResource(100, 50)).toBe(false)
    expect(isPointsListingResource(0, 0)).toBe(false)
    expect(parseResourceListingSale('paid')).toBe('paid')
    expect(parseResourceListingSale('free')).toBe('free')
    expect(parseResourceListingSale('all')).toBe(null)
  })

  it('download gate branches for cash and points', () => {
    // 售卖判定只认买断价 `buyout_price_fen`；`price_fen` 是冻结的历史值，不参与判定
    expect(canDownloadResource({ buyout_price_fen: 0 })).toBe(true)
    expect(canDownloadResource({ buyout_price_fen: 100, purchased_by_me: true })).toBe(true)
    expect(
      canDownloadResource({ buyout_price_fen: 100, purchased_by_me: false, creator: 'dev' }, 'dev'),
    ).toBe(true)
    expect(
      canDownloadResource(
        { buyout_price_fen: 100, purchased_by_me: false, creator: 'dev' },
        'buyer',
      ),
    ).toBe(false)
    expect(canDownloadResource({ price_fen: 100, purchased_by_me: false }, 'buyer')).toBe(true)
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

  it('seller refund gate covers cash paid orders with remaining balance', () => {
    const base = {
      status: 'paid',
      amount_points: 0,
      within_refund_window: true,
      refundable_amount_fen: 1000,
    }
    expect(canSellerRefundPurchase(base)).toBe(true)
    // 已下载也能退：卖家通道不受买家自助退的「已下载」限制
    expect(canSellerRefundPurchase({ ...base, first_downloaded_at: '2026-10-08' })).toBe(true)
    // 部分退后仍有余额 → 仍可再退
    expect(canSellerRefundPurchase({ ...base, refundable_amount_fen: 400 })).toBe(true)
    // 退满 / 超窗口 / 非 paid / 积分单 → 不给按钮
    expect(canSellerRefundPurchase({ ...base, refundable_amount_fen: 0 })).toBe(false)
    expect(canSellerRefundPurchase({ ...base, within_refund_window: false })).toBe(false)
    expect(canSellerRefundPurchase({ ...base, status: 'refunded' })).toBe(false)
    expect(canSellerRefundPurchase({ ...base, amount_points: 80, amount_fen: 0 })).toBe(false)
    expect(isPointsPurchaseOrder({ amount_points: 80 })).toBe(true)
    expect(isPointsPurchaseOrder({ amount_points: 0 })).toBe(false)
    expect(refundInitiatorLabel('seller')).toBe('卖家')
    expect(refundInitiatorLabel('admin')).toBe('平台')
    expect(refundInitiatorLabel(null)).toBe('未知')
  })

  it('maps pay channel and status labels', () => {
    expect(toResourcePayChannel('wechat')).toBe('wx_pub')
    expect(toResourcePayChannel('alipay')).toBe('alipay')
    expect(resourcePurchaseStatusLabel('paid')).toBe('已购买')
    expect(resourcePurchaseStatusLabel('pending')).toBe('待支付')
  })
})
