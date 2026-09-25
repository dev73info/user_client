import { describe, expect, it } from 'vitest'

import { invoiceEntryState } from '@/shared/invoiceAvailability'

/** 判定只用这两个数：本次可开票合计、该需求已成功分账的实付合计。 */
function facts(invoiceableTotalFen: number, settledAmountFen: number) {
  return { invoiceableTotalFen, settledAmountFen }
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
})
