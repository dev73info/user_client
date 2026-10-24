import { describe, expect, it } from 'vitest'

import {
  formatTipCashTier,
  TIP_MAX_TIERS,
  tipOrderAmountLabel,
  tipReceivedCashText,
  tipStatusLabel,
  tipperDisplayLabel,
  validateTipCashTiers,
  validateTipCustomCash,
  validateTipCustomCashRange,
} from '@/shared/devTip'

/**
 * 打赏只有现金一种形态（契约 `POST /api/tips` 的金额是整数分），所以这里只测现金这一档：
 * 档位换算、自填校验、区间校验、金额 / 状态 / 显示名文案。
 *
 * 原来覆盖积分档位、积分自填、积分区间与「积分单优先」的用例已随契约一并删除：
 * `TipConfigResponse` / `TipOrderResponse` 里没有 `points_tiers` / `amount_points`。
 */
const baseConfig = {
  enabled: true,
  cash_tiers_fen: [500, 1000, 2000],
  allow_custom_cash: true,
  custom_cash_min_fen: 100,
  custom_cash_max_fen: 200000,
}

describe('devTip', () => {
  it('档位展示换算：分 → ¥x.xx', () => {
    expect(formatTipCashTier(500)).toBe('¥5.00')
    expect(formatTipCashTier(199)).toBe('¥1.99')
    expect(formatTipCashTier(null)).toBe('¥0.00')
  })

  it('现金自填校验：范围与小数位', () => {
    expect(validateTipCustomCash('5', baseConfig)).toEqual({ ok: true, fen: 500 })
    expect(validateTipCustomCash('1.5', baseConfig)).toEqual({ ok: true, fen: 150 })
    expect(validateTipCustomCash('0.5', baseConfig).ok).toBe(false)
    expect(validateTipCustomCash('1.234', baseConfig).ok).toBe(false)
    expect(validateTipCustomCash('3000', baseConfig).ok).toBe(false)
    expect(validateTipCustomCash('', baseConfig).ok).toBe(false)
    expect(validateTipCustomCash('5', { ...baseConfig, allow_custom_cash: false }).ok).toBe(false)
  })

  it('档位列表校验：数量与取值范围', () => {
    expect(validateTipCashTiers(['1', '9.99'])).toEqual({ ok: true, tiers: [100, 999] })
    expect(validateTipCashTiers(['0']).ok).toBe(false)
    expect(validateTipCashTiers(['1.234']).ok).toBe(false)
    expect(validateTipCashTiers(['']).ok).toBe(false)
    expect(validateTipCashTiers(Array.from({ length: TIP_MAX_TIERS + 1 }, () => '1')).ok).toBe(
      false,
    )
  })

  it('自填区间校验：上下限合法性与顺序', () => {
    expect(validateTipCustomCashRange('1', '20000')).toEqual({
      ok: true,
      minFen: 100,
      maxFen: 2000000,
    })
    expect(validateTipCustomCashRange('10', '5').ok).toBe(false)
    expect(validateTipCustomCashRange('0', '5').ok).toBe(false)
    expect(validateTipCustomCashRange('', '5').ok).toBe(false)
  })

  it('订单金额 / 状态 / 打赏者显示名', () => {
    expect(tipOrderAmountLabel({ amount_fen: 500 })).toBe('¥5.00')
    expect(tipStatusLabel('paid')).toBe('已支付')
    expect(tipStatusLabel('pending')).toBe('待支付')
    expect(tipStatusLabel('refunded')).toBe('已退款')
    expect(tipperDisplayLabel({ anonymous: true, tipper_display: '张三' })).toBe('匿名')
    expect(tipperDisplayLabel({ anonymous: false, tipper_display: '张三' })).toBe('张三')
    expect(tipReceivedCashText(1234)).toBe('¥12.34')
  })
})
