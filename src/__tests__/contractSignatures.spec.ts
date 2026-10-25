import { describe, expect, it } from 'vitest'
import type { MyContractSummary } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'
import { getSignatureState, contractWaitingMessage } from '@/utils/contractSignatures'

const contract: MyContractSummary = {
  id: 1,
  contract_no: 'HT-001',
  title: 'Service contract',
  template_name: 'Service',
  status: CONTRACT_STATUS.signing,
  party_a_name: 'Alice',
  party_a_username: 'alice',
  party_a_signed_at: null,
  party_b_name: 'Bob',
  party_b_username: 'bob',
  party_b_signed_at: null,
  created_at: '2026-09-09 10:00:00',
}

/** 需求开发合同（带 requirement_id）：甲乙双方各自独立签署，不设先后。 */
const requirementContract: MyContractSummary = { ...contract, requirement_id: 'REQ-001' }

describe('personal signing state', () => {
  it('allows either unsigned party in a pending contract', () => {
    expect(getSignatureState(contract, 'alice')).toBe('pending')
    expect(getSignatureState(contract, 'bob')).toBe('pending')
  })
  it('lets party A sign the requirement contract before party B does', () => {
    // 曾经甲方要等 party_b_signed_at 落库才能签，而乙方在爱签签完后本地并不落这个时间戳——甲方于是
    // 永远等不到放行，双方互相等待。现在两人谁先签都可以，各看自己那一个签名时间。
    expect(getSignatureState(requirementContract, 'alice')).toBe('pending')
    expect(getSignatureState(requirementContract, 'bob')).toBe('pending')
    const partyBSigned = { ...requirementContract, party_b_signed_at: '2026-09-09 10:00:00' }
    expect(getSignatureState(partyBSigned, 'alice')).toBe('pending')
    expect(getSignatureState(partyBSigned, 'bob')).toBe('waiting')
    const partyASigned = { ...requirementContract, party_a_signed_at: '2026-09-09 10:00:00' }
    expect(getSignatureState(partyASigned, 'alice')).toBe('waiting')
    expect(getSignatureState(partyASigned, 'bob')).toBe('pending')
  })
  it('shows waiting after my signature, including waiting for the platform', () => {
    const signed = { ...contract, party_a_signed_at: '2026-09-09', party_b_signed_at: '2026-09-09' }
    expect(getSignatureState(signed, 'alice')).toBe('waiting')
    expect(getSignatureState(signed, 'bob')).toBe('waiting')
  })
  it('offers signing while the contract still sits at "awaiting 0"', () => {
    // 0 的含义是「合同已建出来、还没有任何签署动作」，发起签署正是那第一笔动作。
    // 早先这里判成不可签，而唯一的发起入口又挂在这个判定上，合同就永远停在 0。
    const awaiting = { ...contract, status: CONTRACT_STATUS.awaiting }
    expect(getSignatureState(awaiting, 'alice')).toBe('pending')
    expect(getSignatureState(awaiting, 'bob')).toBe('pending')
    // 已经签过的一方在 0 状态下仍是「等待他方」，与「签约中 1」同一口径。
    expect(getSignatureState({ ...awaiting, party_a_signed_at: '2026-09-09' }, 'alice')).toBe(
      'waiting',
    )
  })
  it('never offers signing for terminal or unsupported states', () => {
    expect(getSignatureState({ ...contract, status: CONTRACT_STATUS.signed }, 'alice')).toBe(
      'signed',
    )
    expect(getSignatureState({ ...contract, status: CONTRACT_STATUS.voided }, 'alice')).toBe('void')
    // 3 过期 / 4 拒签 / 7 撤销 / 未知码都不可签。
    expect(getSignatureState({ ...contract, status: CONTRACT_STATUS.expired }, 'alice')).toBe(
      'unavailable',
    )
    expect(getSignatureState({ ...contract, status: CONTRACT_STATUS.rejected }, 'alice')).toBe(
      'unavailable',
    )
    expect(getSignatureState({ ...contract, status: CONTRACT_STATUS.revoked }, 'alice')).toBe(
      'unavailable',
    )
    expect(getSignatureState({ ...contract, status: 99 }, 'alice')).toBe('unavailable')
  })
  it('does not offer signing to outsiders or an empty account', () => {
    expect(getSignatureState(contract, 'other')).toBe('unavailable')
    expect(getSignatureState(contract, '')).toBe('unavailable')
  })
})

describe('waiting message', () => {
  it('tells the unsigned party to sign, and the signed one to wait', () => {
    expect(contractWaitingMessage(contract, 'bob')).toBe('等待您完成开发者签署')
    const mineSigned = { ...contract, party_b_signed_at: '2026-09-09 10:00:00' }
    expect(contractWaitingMessage(mineSigned, 'bob')).toBe('等待客户完成签署')
    // 不设签署顺序：谁没签就提示谁签，双方都签完后交给状态同步。
    expect(contractWaitingMessage(contract, 'alice')).toBe('等待您完成客户签署')
    expect(
      contractWaitingMessage({ ...contract, party_a_signed_at: '2026-09-09 10:00:00' }, 'alice'),
    ).toBe('等待开发者完成签署')
    expect(contractWaitingMessage(mineSigned, 'alice')).toBe('等待您完成客户签署')
  })
  it('says it is syncing when both sides signed while the status is still signing', () => {
    // 双方签署时间都落库、状态还停在「签约中」= 页面正在轮询等爱签回同步。
    const bothSigned = {
      ...contract,
      party_a_signed_at: '2026-09-09 10:00:00',
      party_b_signed_at: '2026-09-09 10:01:00',
    }
    expect(contractWaitingMessage(bothSigned, 'alice')).toBe('正在同步签署状态')
    expect(contractWaitingMessage(bothSigned, 'bob')).toBe('正在同步签署状态')
  })
  it('stays silent for terminal states and for outsiders', () => {
    expect(contractWaitingMessage({ ...contract, status: CONTRACT_STATUS.signed }, 'alice')).toBe(
      '',
    )
    expect(contractWaitingMessage({ ...contract, status: CONTRACT_STATUS.voided }, 'bob')).toBe('')
    expect(contractWaitingMessage(contract, 'other')).toBe('')
    expect(contractWaitingMessage(contract, '')).toBe('')
  })
})
