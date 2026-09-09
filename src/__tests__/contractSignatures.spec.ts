import { describe, expect, it } from 'vitest'
import type { MyContractSummary } from '@/api/contracts'
import { getSignatureState } from '@/utils/contractSignatures'

const contract: MyContractSummary = {
  id: 1, contract_no: 'HT-001', title: 'Service contract', template_name: 'Service',
  status: 'pending_party_a', party_a_name: 'Alice', party_a_username: 'alice', party_a_signed_at: null,
  party_b_name: 'Bob', party_b_username: 'bob', party_b_signed_at: null, created_at: '2026-09-09 10:00:00',
}

describe('personal signing state', () => {
  it('allows either unsigned party in a pending contract', () => {
    expect(getSignatureState(contract, 'alice')).toBe('pending')
    expect(getSignatureState(contract, 'bob')).toBe('pending')
    expect(getSignatureState({ ...contract, status: 'pending_party_b' }, 'alice')).toBe('pending')
  })
  it('shows waiting after my signature, including waiting for the platform', () => {
    const signed = { ...contract, party_a_signed_at: '2026-09-09', party_b_signed_at: '2026-09-09' }
    expect(getSignatureState(signed, 'alice')).toBe('waiting')
    expect(getSignatureState(signed, 'bob')).toBe('waiting')
  })
  it('never offers signing for terminal or unsupported states', () => {
    expect(getSignatureState({ ...contract, status: 'signed' }, 'alice')).toBe('signed')
    expect(getSignatureState({ ...contract, status: 'void' }, 'alice')).toBe('void')
    expect(getSignatureState({ ...contract, status: 'draft' }, 'alice')).toBe('unavailable')
    expect(getSignatureState({ ...contract, status: 'other' }, 'alice')).toBe('unavailable')
  })
  it('does not offer signing to outsiders or an empty account', () => {
    expect(getSignatureState(contract, 'other')).toBe('unavailable')
    expect(getSignatureState(contract, '')).toBe('unavailable')
  })
})
