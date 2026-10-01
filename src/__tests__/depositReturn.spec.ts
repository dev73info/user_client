import { describe, expect, it } from 'vitest'
import { validateDevWithdrawalRequest, type CreateDevWithdrawalRequest } from '@/api/devWallet'

const payload: CreateDevWithdrawalRequest = {
  amount_cny: 10,
  channel: 'adapay',
  account_name: '',
  account_no: '',
}

const validateReturn = (request = payload, balance = 100) =>
  validateDevWithdrawalRequest(request, balance, undefined, false, 'developer_order_deposit')

describe('deposit return validation', () => {
  it('does not ask for recipient details for deposit returns', () => {
    expect(validateReturn()).toBeNull()
  })

  // 收益提现的出款账户由服务端按开发者已绑定的 Adapay 收款账户补全，前端不再采集收款信息，
  // 因此留空也不拦；金额、余额与备注仍照常校验。
  it('does not ask for recipient details for income withdrawals', () => {
    expect(validateDevWithdrawalRequest(payload, 100)).toBeNull()
    expect(validateDevWithdrawalRequest({ ...payload, channel: 'wechat' }, 100)).toBeNull()
    expect(validateDevWithdrawalRequest({ ...payload, amount_cny: 0 }, 100)).not.toBeNull()
    expect(validateDevWithdrawalRequest(payload, 9)).not.toBeNull()
  })

  it('checks amount, balance and notes without recipient details', () => {
    expect(validateReturn({ ...payload, amount_cny: 0 })).not.toBeNull()
    expect(validateReturn({ ...payload, amount_cny: NaN })).not.toBeNull()
    expect(validateReturn(payload, 9)).not.toBeNull()
    expect(validateReturn({ ...payload, note: 'x'.repeat(201) })).not.toBeNull()
  })

  it('does not accept a different payout channel for deposit returns', () => {
    expect(validateReturn({ ...payload, channel: 'alipay' })).not.toBeNull()
  })
})
