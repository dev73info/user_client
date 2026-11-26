import { describe, expect, it } from 'vitest'

import { splitFailureReasonLabel, splitStatusLabel } from '@/shared/resourceSale'

describe('售出订单的分账状态', () => {
  it('按分账状态给出中文口径', () => {
    expect(splitStatusLabel({ split_status: 'none' })).toBe('未分账')
    expect(splitStatusLabel({ split_status: '' })).toBe('未分账')
    expect(splitStatusLabel({ split_status: null })).toBe('未分账')
    expect(splitStatusLabel({ split_status: 'pending' })).toBe('分账中')
    expect(splitStatusLabel({ split_status: 'succeeded' })).toBe('分账成功')
    expect(splitStatusLabel({ split_status: 'failed' })).toBe('分账失败')
  })

  it('积分单没有现金分账，显示不适用', () => {
    expect(splitStatusLabel({ amount_points: 30, split_status: 'failed' })).toBe('积分单不适用')
    expect(splitFailureReasonLabel({ amount_points: 30, split_status: 'failed' })).toBe('')
  })

  it('失败原因原样展示；历史空值明确说未记录', () => {
    expect(
      splitFailureReasonLabel({
        split_status: 'failed',
        split_failure_reason: '渠道拒绝：收款账户冻结',
      }),
    ).toBe('渠道拒绝：收款账户冻结')
    expect(splitFailureReasonLabel({ split_status: 'failed' })).toBe('未记录原因（历史记录）')
    expect(splitFailureReasonLabel({ split_status: 'failed', split_failure_reason: '   ' })).toBe(
      '未记录原因（历史记录）',
    )
  })

  it('非失败状态不挂原因（哪怕底账里残留旧原因）', () => {
    expect(
      splitFailureReasonLabel({
        split_status: 'succeeded',
        split_failure_reason: '旧原因',
      }),
    ).toBe('')
    expect(
      splitFailureReasonLabel({ split_status: 'pending', split_failure_reason: '旧原因' }),
    ).toBe('')
  })
})
