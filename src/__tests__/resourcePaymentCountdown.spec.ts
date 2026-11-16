import { describe, expect, it } from 'vitest'

import {
  RESOURCE_PAYMENT_GUIDANCE_MS,
  resourcePaymentCountdownText,
} from '@/shared/resourcePaymentCountdown'

const CREATED_AT = '2026-11-16 10:00:00'
const CREATED_AT_MS = Date.parse('2026-11-16T10:00:00+08:00')

function countdown(overrides: Partial<Parameters<typeof resourcePaymentCountdownText>[0]> = {}) {
  return resourcePaymentCountdownText({
    createdAt: CREATED_AT,
    status: 'pending',
    hasQr: true,
    now: CREATED_AT_MS + 1000,
    ...overrides,
  })
}

describe('resourcePaymentCountdownText', () => {
  it('按订单创建时间展示 15 分钟建议窗口的剩余时间', () => {
    expect(countdown()).toBe('建议在 00:14:59 内完成支付')
  })

  it('没有二维码或订单不是 pending 时不展示倒计时', () => {
    expect(countdown({ hasQr: false })).toBe('')
    expect(countdown({ status: 'paid' })).toBe('')
  })

  it('超过建议窗口后提示切换渠道，不声称渠道已过期', () => {
    expect(countdown({ now: CREATED_AT_MS + RESOURCE_PAYMENT_GUIDANCE_MS })).toBe(
      '支付码已生成较久，可切换渠道刷新',
    )
  })

  it('创建时间缺失或非法时不展示倒计时', () => {
    expect(countdown({ createdAt: '' })).toBe('')
    expect(countdown({ createdAt: 'not-a-date' })).toBe('')
  })
})
