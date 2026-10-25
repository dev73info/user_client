/**
 * `canSignContract`：合同能不能签。
 *
 * 这里钉住的是「合同停在等待签约 0 就永远签不了」那次死锁的修复口径——
 * 发起签署本身就是合同的第一笔签署动作，0 必须放行，否则唯一的发起入口会把自己藏掉。
 *
 * 第二个入参是「本人在这份合同里的签署主体」，由 `contractPartyOf` 从用户名换算而来，
 * 不是用户名本身。
 */
import { describe, expect, it } from 'vitest'

import type { ContractDetail } from '@/api/contracts'
import { canSignContract } from '@/shared/contractSign'
import { CONTRACT_STATUS } from '@/shared/contracts'

const contract: ContractDetail = {
  id: 1,
  contract_no: 'C-001',
  title: '开发者入驻协议',
  content: '正文',
  content_sha256: 'hash',
  status: CONTRACT_STATUS.awaiting,
  party_a_name: '73Info 平台',
  party_a_username: 'platform',
  party_a_signed_at: null,
  party_b_name: 'dev',
  party_b_username: 'dev_flow',
  party_b_signed_at: null,
  created_at: '2026-10-25 08:37:02',
}

describe('canSignContract', () => {
  it('合同停在「等待签约 0」时也能发起签署', () => {
    expect(canSignContract({ ...contract, status: CONTRACT_STATUS.awaiting }, 'party_b')).toBe(true)
    expect(canSignContract({ ...contract, status: CONTRACT_STATUS.awaiting }, 'party_a')).toBe(true)
  })

  it('「签约中 1」未签的一方可以签', () => {
    expect(canSignContract({ ...contract, status: CONTRACT_STATUS.signing }, 'party_b')).toBe(true)
    expect(canSignContract({ ...contract, status: CONTRACT_STATUS.signing }, 'party_a')).toBe(true)
  })

  it('自己已经签过就不再给签署入口', () => {
    const signedByB = {
      ...contract,
      status: CONTRACT_STATUS.signing,
      party_b_signed_at: '2026-10-25 09:00:00',
    }
    expect(canSignContract(signedByB, 'party_b')).toBe(false)
    // 甲方还没签，甲方仍可签。
    expect(canSignContract(signedByB, 'party_a')).toBe(true)

    const bothSigned = { ...signedByB, party_a_signed_at: '2026-10-25 09:10:00' }
    expect(canSignContract(bothSigned, 'party_b')).toBe(false)
    expect(canSignContract(bothSigned, 'party_a')).toBe(false)
  })

  it('终态一律不可签', () => {
    for (const status of [
      CONTRACT_STATUS.signed,
      CONTRACT_STATUS.expired,
      CONTRACT_STATUS.rejected,
      CONTRACT_STATUS.voided,
      CONTRACT_STATUS.revoked,
    ]) {
      expect(canSignContract({ ...contract, status }, 'party_b')).toBe(false)
    }
  })

  it('不是当事人或没有合同时不可签', () => {
    expect(canSignContract(contract, null)).toBe(false)
    expect(canSignContract(null, 'party_a')).toBe(false)
  })
})
