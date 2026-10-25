import { describe, expect, it } from 'vitest'

import type { PrepaidAccountStatement, PrepaidOrder } from '@/api/devOrderDeposit'
import { describeRequest, dispatch, toMockRequest } from '@/mock/request'

describe('保证金预付账户 mock 契约', () => {
  it('充值下单走真实 mock 分发并返回二维码内容', async () => {
    const described = await describeRequest(
      'http://localhost/api/payment/developer-order-deposit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_fen: 10000, channel: 'alipay', client_platform: 'pc' }),
      },
    )
    if (!described) {
      throw new Error('充值请求应可解析')
    }

    const response = await dispatch(toMockRequest(described))
    if (!response) {
      throw new Error('充值路由不应落到空壳响应')
    }
    const order = (await response.json()) as PrepaidOrder

    expect(response.status).toBe(200)
    expect(order.order_no).toBe('MOCK-DEPOSIT-001')
    expect(order.amount_fen).toBe(10000)
    expect(order.client_action?.qr_code).toBe('https://pay.example.test/cashier/MOCK-DEPOSIT-001')
  })

  it('账户总览返回页面实际读取的对象形状', async () => {
    const described = await describeRequest('http://localhost/api/payment/developer-order-deposit')
    if (!described) {
      throw new Error('账户请求应可解析')
    }

    const response = await dispatch(toMockRequest(described))
    if (!response) {
      throw new Error('账户路由不应落到空壳响应')
    }
    const statement = (await response.json()) as PrepaidAccountStatement

    expect(statement.account.balance_fen).toBe(0)
    expect(statement.withdrawable_fen).toBe(0)
    expect(statement.ledger).toEqual([])
  })
})
