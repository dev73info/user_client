import type { MyContractSummary } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'

export type SignatureState = 'pending' | 'waiting' | 'signed' | 'void' | 'unavailable'

export const signatureStateLabels: Record<SignatureState, string> = {
  pending: '待我签署',
  waiting: '等待他方',
  signed: '已完成',
  void: '已作废',
  unavailable: '暂不可签署',
}

/**
 * 「当前该谁签」不再由状态编码，而由签署时间推导：
 * 需求开发合同固定**乙方（开发者）先签、甲方（需求方）后签**，
 * 只有「签约中 1」可签，其余状态（0/2/3/4/6/7）都不能签。
 */
export function getSignatureState(contract: MyContractSummary, username: string): SignatureState {
  if (contract.status === CONTRACT_STATUS.voided) return 'void'
  if (contract.status === CONTRACT_STATUS.signed) return 'signed'
  if (contract.status !== CONTRACT_STATUS.signing) return 'unavailable'
  if (!username) return 'unavailable'
  if (contract.party_a_username === username) {
    if (contract.party_a_signed_at) return 'waiting'
    // 需求开发合同乙方先签：乙方没签之前，甲方只能等（与后端签署顺序门一致）。
    // 甲方是平台的协议（没有 requirement_id，如入驻协议由平台盖章）不受此限。
    if (contract.requirement_id && !contract.party_b_signed_at) return 'waiting'
    return 'pending'
  }
  if (contract.party_b_username === username) {
    return contract.party_b_signed_at ? 'waiting' : 'pending'
  }
  return 'unavailable'
}
