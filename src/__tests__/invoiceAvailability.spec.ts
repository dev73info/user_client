import { describe, expect, it } from 'vitest'

import { invoiceEntryState } from '@/shared/invoiceAvailability'

/**
 * 判定只用这两个数：本次可开票合计、该需求已成功分账的实付合计。
 *
 * 第三个参数是后端新增的结单闸门（`invoiceAvailable` / `requirementStatus`）；不传就是 mock 与旧后端的
 * 样子（字段缺失），此时闸门不参与判定。
 */
function facts(
  invoiceableTotalFen: number,
  settledAmountFen: number,
  gate: { invoiceAvailable?: boolean; requirementStatus?: string } = {},
) {
  return { invoiceableTotalFen, settledAmountFen, ...gate }
}

describe('「获取发票」入口的可点性', () => {
  it('有可开票金额才能点', () => {
    expect(invoiceEntryState('platform_guarantee', facts(20000, 100000))).toEqual({ enabled: true, reason: '' })
  })

  it('已成功分账但能开的票都申请过：置灰并说明去「我的发票」看进度', () => {
    expect(invoiceEntryState('platform_guarantee', facts(0, 100000))).toEqual({
      enabled: false,
      reason: '本需求能开的发票都已申请过，到「我的发票」可查看进度',
    })
  })

  it('还没有成功分账的结算：置灰并说明要等分账', () => {
    expect(invoiceEntryState('platform_guarantee', facts(0, 0))).toEqual({
      enabled: false,
      reason: '本需求还没有成功分账的结算，分账完成后才能开票',
    })
  })

  it('无担保模式没有资金流，不用等汇总就置灰', () => {
    expect(invoiceEntryState('self_managed', facts(20000, 100000)).enabled).toBe(false)
    expect(invoiceEntryState('self_managed', undefined).enabled).toBe(false)
  })

  it('汇总还没回来时不拦：预取失败不该让入口看起来像丢了', () => {
    expect(invoiceEntryState('platform_guarantee', undefined)).toEqual({ enabled: true, reason: '' })
    expect(invoiceEntryState('platform_guarantee', null)).toEqual({ enabled: true, reason: '' })
  })

  it('需求未结单时入口置灰，并写明要等结单与当前状态', () => {
    expect(
      invoiceEntryState('platform_guarantee', facts(0, 100000, {
        invoiceAvailable: false,
        requirementStatus: 'in_development',
      })),
    ).toEqual({ enabled: false, reason: '需求结单后才能申请开票（当前：开发中）' })
  })

  it('未结单且停在 deposit_paid 时，状态文案按支付模式消歧', () => {
    // 电签担保：定金已进托管、还在等合同签完，是过渡态。
    expect(
      invoiceEntryState('platform_guarantee', facts(0, 0, {
        invoiceAvailable: false,
        requirementStatus: 'deposit_paid',
      })).reason,
    ).toBe('需求结单后才能申请开票（当前：已付定金）')
    // 无担保模式本就不涉及开票，入口原因仍是「无担保模式」那一句，不会被闸门抢走。
    expect(
      invoiceEntryState('self_managed', facts(0, 0, {
        invoiceAvailable: false,
        requirementStatus: 'deposit_paid',
      })).reason,
    ).toBe('无担保模式不涉及付款与开票')
  })

  it('已结单（闸门放行）时按金额判定，不被闸门多拦一道', () => {
    expect(
      invoiceEntryState('platform_guarantee', facts(20000, 100000, {
        invoiceAvailable: true,
        requirementStatus: 'completed',
      })),
    ).toEqual({ enabled: true, reason: '' })
  })

  it('闸门字段缺失（mock / 旧后端）时不做闸门判断', () => {
    // `undefined` 只代表后端没给这个信息，不代表闸门关闭：照旧按可开票金额判定。
    expect(
      invoiceEntryState('platform_guarantee', facts(20000, 100000, { invoiceAvailable: undefined })),
    ).toEqual({ enabled: true, reason: '' })
    expect(
      invoiceEntryState('platform_guarantee', facts(0, 0, { requirementStatus: 'in_development' })),
    ).toEqual({ enabled: false, reason: '本需求还没有成功分账的结算，分账完成后才能开票' })
  })
})
