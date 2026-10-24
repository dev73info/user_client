import { describe, expect, it } from 'vitest'
import { validateDevWithdrawalRequest, type CreateDevWithdrawalRequest } from '@/api/devWallet'

/** 提现只发整数分与备注：收款账户由账号中心绑定，请求体里不再有账户字段。 */
const payload: CreateDevWithdrawalRequest = {
  amount_fen: 1000,
  note: '',
}

describe('withdrawal validation', () => {
  it('accepts integer fen without recipient fields', () => {
    expect(validateDevWithdrawalRequest({ payload, withdrawableFen: 1000 })).toBeNull()
    expect(validateDevWithdrawalRequest({ payload })).toBeNull()
  })

  it('rejects invalid amounts and long notes', () => {
    expect(
      validateDevWithdrawalRequest({ payload: { ...payload, amount_fen: 0 } }),
    ).not.toBeNull()
    expect(
      validateDevWithdrawalRequest({ payload: { ...payload, amount_fen: 1.5 } }),
    ).not.toBeNull()
    expect(
      validateDevWithdrawalRequest({ payload: { ...payload, note: 'x'.repeat(201) } }),
    ).not.toBeNull()
  })

  it('rejects amounts above the withdrawable balance in fen', () => {
    expect(validateDevWithdrawalRequest({ payload, withdrawableFen: 999 })).not.toBeNull()
    expect(validateDevWithdrawalRequest({ payload, withdrawableFen: 1000 })).toBeNull()
  })

  it('applies the single-transfer limits from the contract config', () => {
    const limits = { min_fen: 2000, max_fen: 50000 }
    expect(validateDevWithdrawalRequest({ payload, limits })).toContain('不能少于')
    expect(
      validateDevWithdrawalRequest({ payload: { amount_fen: 60000 }, limits }),
    ).toContain('不能超过')
    // 0 表示不设限
    expect(
      validateDevWithdrawalRequest({ payload, limits: { min_fen: 0, max_fen: 0 } }),
    ).toBeNull()
  })
})
