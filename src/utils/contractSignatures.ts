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

/** `contractWaitingMessage` 只需要这几个字段（签约页拿的是 `ContractDetail`，列表页是 `MyContractSummary`）。 */
export type WaitingMessageContract = Pick<
  MyContractSummary,
  'status' | 'party_a_username' | 'party_b_username' | 'party_a_signed_at' | 'party_b_signed_at'
>

/**
 * 「签约中」时展示的那句话：到底在等谁签，或者在等渠道回状态。
 *
 * 特意区分「等对方签」与「等渠道同步」：**双方签署时间都已落库、状态却还停在「签约中」**
 * 时，签署动作其实都完成了，页面正按 `POLL_INTERVAL_MS` 轮询 `asign-sync` 等爱签回同步——
 * 这时说「等待某方完成签署」会让人误以为对方还没签（2026-10-04 线上就出现过这个误解）。
 * 不属于任何一个签约方（如旁观者）不提示。
 */
export function contractWaitingMessage(
  contract: WaitingMessageContract,
  username: string,
): string {
  if (contract.status !== CONTRACT_STATUS.signing) return ''
  const isPartyA = contract.party_a_username === username
  const isPartyB = contract.party_b_username === username
  if (!isPartyA && !isPartyB) return ''
  const partyASigned = Boolean(contract.party_a_signed_at)
  const partyBSigned = Boolean(contract.party_b_signed_at)
  if (partyASigned && partyBSigned) return '正在同步签署状态'
  if (isPartyA) {
    // 乙方先签：乙方没签时甲方等的是开发者，签完才轮到甲方。
    if (!partyBSigned) return '等待开发者完成签署'
    return '等待您完成客户签署'
  }
  return partyBSigned ? '等待客户完成签署' : '等待您完成开发者签署'
}
