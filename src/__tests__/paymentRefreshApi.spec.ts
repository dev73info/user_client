import { describe, expect, it, vi } from 'vitest'

import { refreshPaymentOrder } from '@/api/payments'

const requestJson = vi.hoisted(() => vi.fn())

vi.mock('@/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/http')>()),
  requestJson,
}))

describe('主动刷新支付单接口', () => {
  it('按订单号调用 refresh，不伪造支付成功', async () => {
    requestJson.mockResolvedValue({ order_no: 'PAY-TEST-1', status: 'pending' })

    await refreshPaymentOrder('session-token', 'PAY-TEST-1')

    expect(requestJson).toHaveBeenCalledExactlyOnceWith(
      '/payment/orders/PAY-TEST-1/refresh',
      { method: 'POST', headers: expect.any(Headers) },
      '刷新支付单状态失败',
    )
    const headers = requestJson.mock.calls[0]?.[1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer session-token')
  })
})
