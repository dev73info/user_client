/**
 * 签署身份的来源：必须是本人实名资料，不能依赖合同响应里的 `party_*_real_name`。
 *
 * 钉住的是「真实环境下签署页恒显示未完成实名认证、开始签署永久置灰」那次故障——
 * 后端 2.0 的 `ContractResponse` 根本不带 `party_a_real_name` / `party_*_id_card_no_masked`，
 * 前端拿 undefined 去比 '未完成实名认证'，`signerIdentityReady` 永远为假。
 */
import { describe, expect, it } from 'vitest'

import type { ContractDetail } from '@/api/contracts'
import {
  contractPartyDisplay,
  signerIdentityReady,
  signerRealnameFrom,
} from '@/shared/contractSign'
import { CONTRACT_STATUS } from '@/shared/contracts'

/** 真实后端返回形状：没有实名字段。 */
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
  party_b_name: 'dev_flow_03562487',
  party_b_username: 'dev_flow_03562487',
  party_b_signed_at: null,
  created_at: '2026-10-25 08:37:02',
}

describe('signerRealnameFrom', () => {
  it('实名已通过时取到姓名与脱敏证件号', () => {
    expect(
      signerRealnameFrom({
        status: 'approved',
        real_name: '测试开发者',
        id_card_no_masked: '******19920415****',
      }),
    ).toEqual({ realName: '测试开发者', idCardNoMasked: '******19920415****' })
  })

  it('审核中 / 被驳回不算可用实名', () => {
    expect(
      signerRealnameFrom({
        status: 'pending',
        real_name: '测试开发者',
        id_card_no_masked: '******19920415****',
      }),
    ).toBeNull()
    expect(
      signerRealnameFrom({
        status: 'rejected',
        real_name: '测试开发者',
        id_card_no_masked: '******19920415****',
      }),
    ).toBeNull()
  })

  it('企业主体用经办人姓名与证件号，不会因为缺个人证件号被判成未实名', () => {
    expect(
      signerRealnameFrom({
        status: 'approved',
        operator_name: '经办人',
        operator_id_card_no_masked: '******19880101****',
      }),
    ).toEqual({ realName: '经办人', idCardNoMasked: '******19880101****' })
  })

  it('缺姓名或证件号时为 null，没有实名记录时也是 null', () => {
    expect(signerRealnameFrom({ status: 'approved', real_name: '张三' })).toBeNull()
    expect(
      signerRealnameFrom({ status: 'approved', id_card_no_masked: '******1992****' }),
    ).toBeNull()
    expect(signerRealnameFrom(null)).toBeNull()
  })
})

describe('contractPartyDisplay 的签署身份', () => {
  it('合同本身不带实名字段时，靠本人实名资料仍能判定为可签', () => {
    const signer = contractPartyDisplay(contract, 'party_b', true, {
      realName: '测试开发者',
      idCardNoMasked: '******19920415****',
    })
    expect(signer?.legalName).toBe('测试开发者')
    expect(signer?.idCardNo).toBe('******19920415****')
    expect(signerIdentityReady(signer ?? null)).toBe(true)
  })

  it('没有实名资料时保持「未完成实名认证」且不可签', () => {
    const signer = contractPartyDisplay(contract, 'party_b', true, null)
    expect(signer?.legalName).toBe('dev_flow_03562487')
    expect(signer?.idCardNo).toBe('未完成实名认证')
    expect(signerIdentityReady(signer ?? null)).toBe(false)
  })
})
