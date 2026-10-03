import { describe, expect, it } from 'vitest'

import { requirementStatusLabel } from '@/shared/requirementStatus'

/**
 * `deposit_paid` 是「一码两义」：同一个状态码在两种支付模式下处在流程的不同位置。
 * 这四行断言就是四端统一的口径，改动前先想清楚是不是要动业务含义。
 */
describe('需求状态文案', () => {
  it('deposit_paid 按支付模式给不同文案', () => {
    // 电签担保：定金已进平台托管、合同还在签署中，是过渡态。
    expect(requirementStatusLabel('deposit_paid', 'platform_guarantee')).toBe('已付定金')
    // 无电签约定：没有合同也没有定金，审核通过即待开发者接单，是正式态。
    expect(requirementStatusLabel('deposit_paid', 'self_managed')).toBe('待开发')
  })

  it('拿不到支付模式时两种含义都写出来，不做单边假设', () => {
    // 筛选下拉、统计卡、跨模式列表等地方判断不了模式，两种都写才不会误导。
    expect(requirementStatusLabel('deposit_paid')).toBe('已付定金 / 待开发')
    expect(requirementStatusLabel('deposit_paid', undefined)).toBe('已付定金 / 待开发')
  })

  it('其余状态与支付模式无关，文案不变', () => {
    expect(requirementStatusLabel('pending_deposit', 'platform_guarantee')).toBe('待付定金')
    expect(requirementStatusLabel('in_development', 'self_managed')).toBe('开发中')
    expect(requirementStatusLabel('pending_settlement')).toBe('待分账')
    expect(requirementStatusLabel('completed', 'self_managed')).toBe('已完成')
    // 表里没有的状态码原样返回，便于暴露后端新增的状态。
    expect(requirementStatusLabel('whatever')).toBe('whatever')
  })
})
