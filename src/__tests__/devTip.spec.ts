import { describe, expect, it } from 'vitest'

import {
  defaultTipChannel,
  formatTipCashTier,
  formatTipPointsTier,
  TIP_MAX_TIERS,
  tipChannelAvailability,
  tipOrderAmountLabel,
  tipReceivedCashText,
  tipReceivedPointsText,
  tipStatusLabel,
  tipperDisplayLabel,
  validateTipCashTiers,
  validateTipCustomCash,
  validateTipCustomCashRange,
  validateTipCustomPoints,
  validateTipCustomPointsRange,
  validateTipPointsTiers,
} from '@/shared/devTip'

const baseConfig = {
  cash_enabled: true,
  points_enabled: true,
  cash_tiers_fen: [500, 1000, 2000],
  points_tiers: [10, 50],
  allow_custom_cash: true,
  custom_cash_min_fen: 100,
  custom_cash_max_fen: 200000,
  allow_custom_points: true,
  custom_points_min: 10,
  custom_points_max: 100000,
}

describe('devTip', () => {
  it('通道可用性：两条通道各自看自己的开关', () => {
    expect(tipChannelAvailability(null)).toEqual({ cash: false, points: false })
    expect(tipChannelAvailability(baseConfig)).toEqual({ cash: true, points: true })
    expect(tipChannelAvailability({ ...baseConfig, cash_enabled: false })).toEqual({
      cash: false,
      points: true,
    })
    expect(tipChannelAvailability({ ...baseConfig, points_enabled: false })).toEqual({
      cash: true,
      points: false,
    })
    // 两条通道都关 = 不接受打赏
    expect(tipChannelAvailability({ ...baseConfig, cash_enabled: false, points_enabled: false })).toEqual({
      cash: false,
      points: false,
    })
    expect(defaultTipChannel({ cash: false, points: true })).toBe('points')
    expect(defaultTipChannel({ cash: true, points: false })).toBe('cash')
  })

  it('档位展示换算', () => {
    expect(formatTipCashTier(500)).toBe('¥5.00')
    expect(formatTipCashTier(199)).toBe('¥1.99')
    expect(formatTipPointsTier(120)).toBe('120 积分')
    expect(formatTipPointsTier(null)).toBe('0 积分')
  })

  it('现金自填校验：范围与小数位', () => {
    expect(validateTipCustomCash('5', baseConfig)).toEqual({ ok: true, fen: 500 })
    expect(validateTipCustomCash('1.5', baseConfig)).toEqual({ ok: true, fen: 150 })
    expect(validateTipCustomCash('0.5', baseConfig).ok).toBe(false)
    expect(validateTipCustomCash('1.234', baseConfig).ok).toBe(false)
    expect(validateTipCustomCash('3000', baseConfig).ok).toBe(false)
    expect(validateTipCustomCash('5', { ...baseConfig, allow_custom_cash: false }).ok).toBe(false)
  })

  it('积分自填校验：正整数与范围', () => {
    expect(validateTipCustomPoints('20', baseConfig)).toEqual({ ok: true, fen: 20 })
    expect(validateTipCustomPoints('1.5', baseConfig).ok).toBe(false)
    expect(validateTipCustomPoints('5', baseConfig).ok).toBe(false)
    expect(validateTipCustomPoints('100001', baseConfig).ok).toBe(false)
    expect(validateTipCustomPoints('20', { ...baseConfig, allow_custom_points: false }).ok).toBe(false)
  })

  it('档位列表校验：数量与取值范围', () => {
    expect(validateTipCashTiers(['1', '9.99'])).toEqual({ ok: true, tiers: [100, 999] })
    expect(validateTipCashTiers(['0']).ok).toBe(false)
    expect(validateTipCashTiers(['1.234']).ok).toBe(false)
    expect(validateTipCashTiers(Array.from({ length: TIP_MAX_TIERS + 1 }, () => '1')).ok).toBe(false)
    expect(validateTipPointsTiers(['10', '200'])).toEqual({ ok: true, tiers: [10, 200] })
    expect(validateTipPointsTiers(['0']).ok).toBe(false)
    expect(validateTipPointsTiers(['1.5']).ok).toBe(false)
  })

  it('自填区间校验：上下限合法性与顺序', () => {
    expect(validateTipCustomCashRange('1', '20000')).toEqual({
      ok: true,
      minFen: 100,
      maxFen: 2000000,
    })
    expect(validateTipCustomCashRange('10', '5').ok).toBe(false)
    expect(validateTipCustomPointsRange('10', '100')).toEqual({
      ok: true,
      minPoints: 10,
      maxPoints: 100,
    })
    expect(validateTipCustomPointsRange('100', '10').ok).toBe(false)
  })

  it('订单金额 / 状态 / 打赏者显示名', () => {
    expect(tipOrderAmountLabel({ amount_fen: 500, amount_points: 0 })).toBe('¥5.00')
    expect(tipOrderAmountLabel({ amount_fen: 0, amount_points: 80 })).toBe('80 积分')
    expect(tipStatusLabel('paid')).toBe('已支付')
    expect(tipStatusLabel('pending')).toBe('待支付')
    expect(tipStatusLabel('refunded')).toBe('已退款')
    expect(tipperDisplayLabel({ anonymous: true, tipper_display: '张三' })).toBe('匿名')
    expect(tipperDisplayLabel({ anonymous: false, tipper_display: '张三' })).toBe('张三')
    expect(tipReceivedCashText(1234)).toBe('¥12.34')
    expect(tipReceivedPointsText(30)).toBe('30 积分')
  })
})
