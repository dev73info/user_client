import type { MyContractSummary } from '@/api/contracts'

export type SignatureState = 'pending' | 'waiting' | 'signed' | 'void' | 'unavailable'

export const signatureStateLabels: Record<SignatureState, string> = {
  pending: '待我签署',
  waiting: '等待他方',
  signed: '已完成',
  void: '已作废',
  unavailable: '暂不可签署',
}

export function getSignatureState(contract: MyContractSummary, username: string): SignatureState {
  if (contract.status === 'void') return 'void'
  if (contract.status === 'signed') return 'signed'
  if (!['pending_party_a', 'pending_party_b'].includes(contract.status)) return 'unavailable'
  if (username && contract.party_a_username === username) {
    return contract.party_a_signed_at ? 'waiting' : 'pending'
  }
  if (username && contract.party_b_username === username) {
    return contract.party_b_signed_at ? 'waiting' : 'pending'
  }
  return 'unavailable'
}
