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
 * 需求开发合同的甲乙双方**各自独立签署、不设先后**（2026-10-05 起），
 * 自己还没签就是「待我签署」，自己签完（连着平台那份）就是「等待他方」。
 *
 * 「等待签约 0」与「签约中 1」一样算可签：0 只是「还没有任何签署动作」，发起签署正是
 * 那第一笔动作。判成 `unavailable` 会让列表里的按钮从「去签署」变成「查看详情」，
 * 而详情页同样不给发起入口，合同就永远停在 0（见 `shared/contractSign.ts` 的说明）。
 */
export function getSignatureState(contract: MyContractSummary, username: string): SignatureState {
  if (contract.status === CONTRACT_STATUS.voided) return 'void'
  if (contract.status === CONTRACT_STATUS.signed) return 'signed'
  if (contract.status !== CONTRACT_STATUS.awaiting && contract.status !== CONTRACT_STATUS.signing) {
    return 'unavailable'
  }
  if (!username) return 'unavailable'
  // 不看对方签没签：曾经有过一道「甲方必须等 party_b_signed_at 落库」的顺序门，它在真实爱签链路
  // 上会死锁（乙方在爱签签完后本地不落该时间戳，甲方永远等不到放行），且与「双方各自独立签署」的
  // 口径冲突。这里只判自己：没签 = 待我签署，签了 = 等对方或等渠道同步。
  if (contract.party_a_username === username) {
    return contract.party_a_signed_at ? 'waiting' : 'pending'
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
export function contractWaitingMessage(contract: WaitingMessageContract, username: string): string {
  if (contract.status !== CONTRACT_STATUS.signing) return ''
  const isPartyA = contract.party_a_username === username
  const isPartyB = contract.party_b_username === username
  if (!isPartyA && !isPartyB) return ''
  const partyASigned = Boolean(contract.party_a_signed_at)
  const partyBSigned = Boolean(contract.party_b_signed_at)
  if (partyASigned && partyBSigned) return '正在同步签署状态'
  if (isPartyA) {
    // 双方各自独立签署、不设先后：甲方自己没签就提示甲方签，签完才等开发者。
    return partyASigned ? '等待开发者完成签署' : '等待您完成客户签署'
  }
  return partyBSigned ? '等待客户完成签署' : '等待您完成开发者签署'
}
