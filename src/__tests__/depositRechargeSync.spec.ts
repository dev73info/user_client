import { describe, expect, it, vi } from 'vitest'

import { syncInflightRecharges } from '@/api/devOrderDeposit/account'

const requestJson = vi.hoisted(() => vi.fn())

vi.mock('@/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/http')>()),
  requestJson,
}))

describe('挂起充值单对账', () => {
  it('先列挂起单，再逐单向渠道核对；单张失败不中断其它单', async () => {
    requestJson.mockReset()
    requestJson
      .mockResolvedValueOnce({
        items: [{ order_no: 'PAY-1' }, { order_no: 'PAY-2' }],
        page: 1,
        page_size: 20,
        total: 2,
      })
      .mockRejectedValueOnce(new Error('渠道尚未支付'))
      .mockResolvedValueOnce({ order_no: 'PAY-2', status: 'paid' })

    await expect(syncInflightRecharges('session-token')).resolves.toBe(true)

    expect(requestJson.mock.calls[0]?.[0]).toBe(
      '/payment/orders?status=pending&biz_type=developer_deposit_recharge&page_size=20',
    )
    expect(requestJson.mock.calls[1]?.[0]).toBe('/payment/orders/PAY-1/refresh')
    expect(requestJson.mock.calls[2]?.[0]).toBe('/payment/orders/PAY-2/refresh')
    expect(requestJson.mock.calls[1]?.[1]?.method).toBe('POST')
  })

  it('列单失败时吞掉错误，不阻断余额读取', async () => {
    requestJson.mockReset()
    requestJson.mockRejectedValueOnce(new Error('没有权限'))

    await expect(syncInflightRecharges('session-token')).resolves.toBe(false)
    expect(requestJson).toHaveBeenCalledTimes(1)
  })
})
