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

  it('keeps recipient validation for income withdrawals', () => {
    expect(validateDevWithdrawalRequest(payload, 100)).not.toBeNull()
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
