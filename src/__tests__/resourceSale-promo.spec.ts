/** 推广分成与支付二维码复用：分成比例万分比、推广码归一、分账与拒单文案。 */
import { describe, expect, it } from 'vitest'

import {
  canReuseCashQrForChannel,
  normalizePromoCode,
  parsePromoSharePercentInput,
  PROMO_SHARE_MAX_BPS,
  promoterSplitStatusLabel,
  promoRejectReasonLabel,
  promoShareBpsLabel,
  promoShareBpsToPercentText,
} from '@/shared/resourceSale'

describe('resourceSale 推广分成与支付复用', () => {
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
