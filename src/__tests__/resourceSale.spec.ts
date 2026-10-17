import { describe, expect, it } from 'vitest'

import {
  canBuyerDownload,
  canDownloadResource,
  canReuseCashQrForChannel,
  canSelfRefundPurchase,
  canSellerRefundPurchase,
  canSwitchToPointsPrice,
  caretAfterStripLeadingZeros,
  fenToYuanText,
  formatPurchaseAmountLabel,
  formatResourcePriceLabel,
  isCashPaidListingResource,
  isFreeListingResource,
  isPaidResource,
  isPointsListingResource,
  isPointsPurchaseOrder,
  isPointsResource,
  isPricedResource,
  isPurchaseRequiredError,
  needsPurchase,
  normalizePromoCode,
  parsePointsPriceInput,
  parsePromoSharePercentInput,
  parseResourceListingSale,
  parseYuanPriceInput,
  promoterSplitStatusLabel,
  promoRejectReasonLabel,
  promoShareBpsLabel,
  promoShareBpsToPercentText,
  PROMO_SHARE_MAX_BPS,
  refundInitiatorLabel,
  resourcePurchaseStatusLabel,
  stripLeadingZeros,
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

  it('stripLeadingZeros drops only the integer part leading zeros', () => {
    expect(stripLeadingZeros('00100')).toBe('100')
    expect(stripLeadingZeros('0')).toBe('0')
    expect(stripLeadingZeros('00')).toBe('0')
    expect(stripLeadingZeros('000')).toBe('0')
    expect(stripLeadingZeros('0.5')).toBe('0.5')
    expect(stripLeadingZeros('001.50')).toBe('1.50')
    expect(stripLeadingZeros('')).toBe('')
    // 输入过程中的半成品（小数点后还没敲完）原样保留，不能被归一改坏
    expect(stripLeadingZeros('0.')).toBe('0.')
    expect(stripLeadingZeros('1.')).toBe('1.')
    expect(stripLeadingZeros('010')).toBe('10')
    // 已经规范的值不变，避免无谓地改写 DOM
    expect(stripLeadingZeros('100')).toBe('100')
    expect(stripLeadingZeros('1.50')).toBe('1.50')
  })

  it('caretAfterStripLeadingZeros keeps the caret where the user expects', () => {
    // 00100 → 100：末尾光标左移 2 位
    expect(caretAfterStripLeadingZeros('00100', 5)).toBe(3)
    // 光标还在被删掉的 0 里面 → 落到开头
    expect(caretAfterStripLeadingZeros('00100', 2)).toBe(0)
    expect(caretAfterStripLeadingZeros('00100', 1)).toBe(0)
    expect(caretAfterStripLeadingZeros('00100', 0)).toBe(0)
    // 没删任何字符时光标不动
    expect(caretAfterStripLeadingZeros('100', 3)).toBe(3)
    expect(caretAfterStripLeadingZeros('0', 1)).toBe(1)
    // 00 → 0：只删一个 0
    expect(caretAfterStripLeadingZeros('00', 2)).toBe(1)
    // 越界 / 负数按边界收敛
    expect(caretAfterStripLeadingZeros('00100', 99)).toBe(3)
    expect(caretAfterStripLeadingZeros('00100', -3)).toBe(0)
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
    expect(canDownloadResource({ price_fen: 0 })).toBe(true)
    expect(canDownloadResource({ price_fen: 100, purchased_by_me: true })).toBe(true)
    expect(
      canDownloadResource({ price_fen: 100, purchased_by_me: false, creator: 'dev' }, 'dev'),
    ).toBe(true)
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

  it('canReuseCashQrForChannel: 同渠道 pending 有码才复用', () => {
    const alipay = { status: 'pending', pay_channel: 'alipay' }
    const wechat = { status: 'pending', pay_channel: 'wx_pub' }
    // 同渠道 + pending + 有码 → 可复用
    expect(canReuseCashQrForChannel(alipay, 'alipay', true)).toBe(true)
    expect(canReuseCashQrForChannel(wechat, 'wechat', true)).toBe(true)
    expect(
      canReuseCashQrForChannel({ status: 'pending', pay_channel: 'wechat' }, 'wechat', true),
    ).toBe(true)
    // 换渠道 → 不可复用
    expect(canReuseCashQrForChannel(alipay, 'wechat', true)).toBe(false)
    expect(canReuseCashQrForChannel(wechat, 'alipay', true)).toBe(false)
    // status !== 'pending' → 不可复用
    expect(
      canReuseCashQrForChannel({ status: 'closed', pay_channel: 'alipay' }, 'alipay', true),
    ).toBe(false)
    expect(
      canReuseCashQrForChannel({ status: 'paid', pay_channel: 'alipay' }, 'alipay', true),
    ).toBe(false)
    // 无码 / 无单 → 不可复用
    expect(canReuseCashQrForChannel(alipay, 'alipay', false)).toBe(false)
    expect(canReuseCashQrForChannel(null, 'alipay', true)).toBe(false)
    expect(canReuseCashQrForChannel(undefined, 'wechat', true)).toBe(false)
  })

  it('parsePromoSharePercentInput: 空 / 数字 / 百分比文本 → 万分比', () => {
    expect(parsePromoSharePercentInput('')).toEqual({ ok: true, bps: 0 })
    expect(parsePromoSharePercentInput('   ')).toEqual({ ok: true, bps: 0 })
    expect(parsePromoSharePercentInput(null)).toEqual({ ok: true, bps: 0 })
    expect(parsePromoSharePercentInput(undefined)).toEqual({ ok: true, bps: 0 })
    expect(parsePromoSharePercentInput('0')).toEqual({ ok: true, bps: 0 })
    expect(parsePromoSharePercentInput(0)).toEqual({ ok: true, bps: 0 })
    expect(parsePromoSharePercentInput('10')).toEqual({ ok: true, bps: 1000 })
    expect(parsePromoSharePercentInput(10)).toEqual({ ok: true, bps: 1000 })
    expect(parsePromoSharePercentInput('10%')).toEqual({ ok: true, bps: 1000 })
    expect(parsePromoSharePercentInput(' 10% ')).toEqual({ ok: true, bps: 1000 })
    expect(parsePromoSharePercentInput('12.5')).toEqual({ ok: true, bps: 1250 })
    expect(parsePromoSharePercentInput('50')).toEqual({ ok: true, bps: 5000 })
    expect(parsePromoSharePercentInput('0.01')).toEqual({ ok: true, bps: 1 })
  })

  it('parsePromoSharePercentInput: 越界与非数字拒绝，文案统一', () => {
    // 50.005 → 取整成 5001，越界必须在取整之后判断，否则这类值会被放过
    for (const raw of ['50.01', '51', '-1', 'abc', '50.005', '%%', '1.2.3']) {
      const result = parsePromoSharePercentInput(raw)
      expect(result.ok, `期望 ${raw} 被拒绝`).toBe(false)
      if (!result.ok) {
        expect(result.message).toBe('推广分成比例必须在 0% 到 50% 之间')
      }
    }
    expect(PROMO_SHARE_MAX_BPS).toBe(5000)
  })

  it('promoShareBpsToPercentText / promoShareBpsLabel 回显与展示', () => {
    expect(promoShareBpsToPercentText(0)).toBe('')
    expect(promoShareBpsToPercentText(null)).toBe('')
    expect(promoShareBpsToPercentText(undefined)).toBe('')
    expect(promoShareBpsToPercentText(1000)).toBe('10')
    expect(promoShareBpsToPercentText(1250)).toBe('12.5')
    expect(promoShareBpsToPercentText(5000)).toBe('50')

    expect(promoShareBpsLabel(0)).toBe('未开启')
    expect(promoShareBpsLabel(null)).toBe('未开启')
    expect(promoShareBpsLabel(1000)).toBe('10%')
    expect(promoShareBpsLabel(1250)).toBe('12.5%')
    expect(promoShareBpsLabel(5000)).toBe('50%')
  })

  it('normalizePromoCode 只收 ≤32 位纯 ASCII 字母数字', () => {
    expect(normalizePromoCode('Ab12Cd34')).toBe('Ab12Cd34')
    expect(normalizePromoCode('  Ab12Cd34  ')).toBe('Ab12Cd34')
    expect(normalizePromoCode('a'.repeat(32))).toBe('a'.repeat(32))
    expect(normalizePromoCode('a'.repeat(33))).toBe(null)
    expect(normalizePromoCode('AB-12CD')).toBe(null)
    expect(normalizePromoCode('推广码1234')).toBe(null)
    expect(normalizePromoCode('')).toBe(null)
    expect(normalizePromoCode('   ')).toBe(null)
    expect(normalizePromoCode(null)).toBe(null)
    expect(normalizePromoCode(undefined)).toBe(null)
    expect(normalizePromoCode(12345678)).toBe(null)
  })

  it('promoRejectReasonLabel 覆盖后端全部取值', () => {
    expect(promoRejectReasonLabel('promo_code_invalid')).toBe('推广码无效')
    expect(promoRejectReasonLabel('promoter_is_buyer')).toBe('推广者就是本单买家')
    expect(promoRejectReasonLabel('promoter_is_seller')).toBe('推广者就是本单卖家')
    expect(promoRejectReasonLabel('promoter_not_realname')).toBe('推广者未通过实名认证')
    expect(promoRejectReasonLabel('promoter_no_settlement_account')).toBe(
      '推广者没有可用的渠道结算账户',
    )
    expect(promoRejectReasonLabel('promoter_fee_rounded_to_zero')).toBe(
      '分成金额不足 1 分，未产生分账',
    )
    expect(promoRejectReasonLabel('promoter_member_unavailable')).toBe(
      '分账时推广者的结算账户已不可用',
    )
    expect(promoRejectReasonLabel(null)).toBe('')
    expect(promoRejectReasonLabel(undefined)).toBe('')
    expect(promoRejectReasonLabel('')).toBe('')
    // 后端将来新增取值时原样展示，不吞掉信息
    expect(promoRejectReasonLabel('something_new')).toBe('something_new')
  })

  it('promoterSplitStatusLabel 映射分账状态', () => {
    expect(promoterSplitStatusLabel('none')).toBe('未产生分账')
    expect(promoterSplitStatusLabel('pending')).toBe('分账中')
    expect(promoterSplitStatusLabel('succeeded')).toBe('分账完成')
    expect(promoterSplitStatusLabel('failed')).toBe('分账失败')
    expect(promoterSplitStatusLabel(null)).toBe('未知')
    expect(promoterSplitStatusLabel('weird')).toBe('weird')
  })
})
