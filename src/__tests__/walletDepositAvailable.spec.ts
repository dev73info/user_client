import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDevWalletDeposit } from '@/composables/useDevWalletDeposit'

const mocks = vi.hoisted(() => ({
  statement: vi.fn(),
  sync: vi.fn(),
  credit: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthed: true, token: 'test-token' }),
}))

vi.mock('@/api/devOrderDeposit', () => ({
  getPrepaidAccountStatement: mocks.statement,
  syncInflightRecharges: mocks.sync,
  createPrepaidWithdrawal: vi.fn(),
}))

vi.mock('@/api/devCredit', () => ({
  getDevCreditSelf: mocks.credit,
}))

describe('保证金读数（C12）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sync.mockResolvedValue(undefined)
    mocks.credit.mockRejectedValue(new Error('信用额度不可用'))
  })

  it('可用保证金取 available_fen，不再用固定为 0 的 withdrawable_fen', async () => {
    mocks.statement.mockResolvedValue({
      account: {
        username: 'dev_c12',
        balance_fen: 120000,
        frozen_fen: 0,
        refunding_fen: 0,
        legacy_settled_fen: 0,
        legacy_frozen_fen: 0,
        total_recharged_fen: 120000,
        total_refunded_fen: 0,
        total_withdrawn_fen: 0,
        created_time: '2026-11-06 10:00:00',
        updated_time: '2026-11-06 10:00:00',
      },
      pending_withdrawal_fen: 0,
      withdrawable_fen: 0,
      available_fen: 120000,
      ledger: [],
    })

    const { deposit, load } = useDevWalletDeposit()
    await load()

    expect(deposit.value?.availableFen).toBe(120000)
    expect(deposit.value).not.toHaveProperty('withdrawableFen')
  })
})
