/** 价格输入 / 归一 / 展示：元与分互转、光标位置、免费与积分口径。 */
import { describe, expect, it } from 'vitest'

import {
  canSwitchToPointsPrice,
  caretAfterStripLeadingZeros,
  fenToYuanText,
  formatPurchaseAmountLabel,
  formatResourcePriceLabel,
  isPaidResource,
  isPointsResource,
  isPricedResource,
  normalizeYuanPriceText,
  parsePointsPriceInput,
  parseYuanPriceInput,
  stripLeadingZeros,
  yuanToFen,
} from '@/shared/resourceSale'

describe('resourceSale 价格输入与展示', () => {
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

  it('normalizeYuanPriceText keeps at most two decimal places', () => {
    // 末尾光标（caret = 文本长度）
    expect(normalizeYuanPriceText('0.0001', 6)).toEqual({ text: '0.00', caret: 4 })
    expect(normalizeYuanPriceText('1.234', 5)).toEqual({ text: '1.23', caret: 4 })
    expect(normalizeYuanPriceText('1.2', 3)).toEqual({ text: '1.2', caret: 3 })
    expect(normalizeYuanPriceText('00100', 5)).toEqual({ text: '100', caret: 3 })
    expect(normalizeYuanPriceText('.5', 2)).toEqual({ text: '0.5', caret: 3 })
    expect(normalizeYuanPriceText('1.2.3', 5)).toEqual({ text: '1.23', caret: 4 })
    // 非法字符（如粘贴进来的货币符号）直接丢弃
    expect(normalizeYuanPriceText('¥ 12.30', 7)).toEqual({ text: '12.30', caret: 5 })
    // 输入过程中的半成品保持原样，不把小数点吞掉
    expect(normalizeYuanPriceText('0.', 2)).toEqual({ text: '0.', caret: 2 })
    expect(normalizeYuanPriceText('', 0)).toEqual({ text: '', caret: 0 })
    // 不传光标时 caret 为 null（只做文本归一）
    expect(normalizeYuanPriceText('1.234')).toEqual({ text: '1.23', caret: null })
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
})
