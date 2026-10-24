import type { ContractDetail } from '@/api/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'

import { MOCK_IDENTITY_PROFILES } from '../identity'
import { PLATFORM_DEPOSIT_PERCENT } from './requirements'
import { REQUIREMENT_SEEDS, type RequirementSeed } from './requirementSeeds'
import { CLIENT_NICKNAME, CLIENT_USERNAME, DEV_NICKNAME, DEV_USERNAME, datetime } from './shared'

/* ------------------------------------------------------------------ 合同 */

export function buildContract(
  seed: RequirementSeed,
  status: number,
  partyASigned: boolean,
  partyBSigned: boolean,
): ContractDetail {
  const deposit = Math.round((seed.budget * PLATFORM_DEPOSIT_PERCENT) / 100)
  const created = datetime(-seed.createdDaysAgo + 1, 11, 0)

  return {
    id: 100 + seed.id,
    template_name: 'requirement_development_contract',
    requirement_id: seed.code,
    contract_no: `HT-${seed.code.replace('REQ-', '')}-${seed.id}`,
    title: `需求开发合同 · ${seed.title}`,
    content: [
      `（演示合同）甲方委托乙方开发「${seed.title}」。`,
      '',
      `合同总价：${seed.budget.toFixed(2)} 元`,
      `定金（${PLATFORM_DEPOSIT_PERCENT}%）：${deposit.toFixed(2)} 元，合同签署后支付`,
      `尾款：${(seed.budget - deposit).toFixed(2)} 元，验收通过后支付`,
      `验收标准：${seed.acceptance}`,
      '',
      '关闭 mock 即可看到真实合同内容。',
    ].join('\n'),
    content_sha256: 'mock-content-sha256',
    status,
    party_a_name: CLIENT_NICKNAME,
    party_a_username: CLIENT_USERNAME,
    party_a_account_email: MOCK_IDENTITY_PROFILES.client.email,
    party_a_real_name: CLIENT_NICKNAME,
    party_a_id_card_no_masked: '3306**********1234',
    party_a_signature_sha256: partyASigned ? 'mock-signature-a' : null,
    party_a_signed_at: partyASigned ? datetime(-seed.createdDaysAgo + 1, 12, 0) : null,
    party_b_name: DEV_NICKNAME,
    party_b_username: DEV_USERNAME,
    party_b_account_email: MOCK_IDENTITY_PROFILES.dev.email,
    party_b_real_name: DEV_NICKNAME,
    party_b_id_card_no_masked: '1101**********5678',
    party_b_signature_sha256: partyBSigned ? 'mock-signature-b' : null,
    party_b_signed_at: partyBSigned ? datetime(-seed.createdDaysAgo + 1, 11, 30) : null,
    created_by: CLIENT_USERNAME,
    created_at: created,
    updated_at: datetime(-seed.updatedDaysAgo, 15, 30),
    signing_logs: [
      {
        id: 1,
        contract_id: 100 + seed.id,
        contract_no: `HT-${seed.code.replace('REQ-', '')}-${seed.id}`,
        contract_title: `需求开发合同 · ${seed.title}`,
        action: 'create',
        from_status: null,
        to_status: CONTRACT_STATUS.awaiting,
        operator: CLIENT_USERNAME,
        signer_party: null,
        signer_real_name: null,
        signer_id_card_no_masked: null,
        signer_username: null,
        signer_email: null,
        handwritten_signature: null,
        signature_sha256: null,
        note: '发起合同',
        created_at: created,
      },
      ...(partyBSigned
        ? [
            {
              id: 2,
              contract_id: 100 + seed.id,
              contract_no: `HT-${seed.code.replace('REQ-', '')}-${seed.id}`,
              contract_title: `需求开发合同 · ${seed.title}`,
              action: 'sign',
              // 两个「待某方签署」已合并为「签约中 1」：乙方先签，前后状态同码，
              // 轮到谁签改由 party_a_signed_at / party_b_signed_at 推导。
              from_status: CONTRACT_STATUS.signing,
              to_status: CONTRACT_STATUS.signing,
              operator: DEV_USERNAME,
              signer_party: 'party_b',
              signer_real_name: DEV_NICKNAME,
              signer_id_card_no_masked: '1101**********5678',
              signer_username: DEV_USERNAME,
              signer_email: MOCK_IDENTITY_PROFILES.dev.email,
              handwritten_signature: 'mock-handwriting',
              signature_sha256: 'mock-signature-b',
              note: null,
              created_at: datetime(-seed.createdDaysAgo + 1, 11, 30),
            },
          ]
        : []),
      ...(partyASigned
        ? [
            {
              id: 3,
              contract_id: 100 + seed.id,
              contract_no: `HT-${seed.code.replace('REQ-', '')}-${seed.id}`,
              contract_title: `需求开发合同 · ${seed.title}`,
              action: 'sign',
              from_status: CONTRACT_STATUS.signing,
              to_status: CONTRACT_STATUS.signed,
              operator: CLIENT_USERNAME,
              signer_party: 'party_a',
              signer_real_name: CLIENT_NICKNAME,
              signer_id_card_no_masked: '3306**********1234',
              signer_username: CLIENT_USERNAME,
              signer_email: MOCK_IDENTITY_PROFILES.client.email,
              handwritten_signature: 'mock-handwriting',
              signature_sha256: 'mock-signature-a',
              note: null,
              created_at: datetime(-seed.createdDaysAgo + 1, 12, 0),
            },
          ]
        : []),
    ],
  }
}

/**
 * 有合同的担保需求，以及合同签到哪一步。
 * 需求单状态与合同状态必须对得上：待付定金 = 合同已签完；开发中及以后 = 合同已签完。
 */
export const contracts: ContractDetail[] = [
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 1)!, CONTRACT_STATUS.signed, true, true),
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 2)!, CONTRACT_STATUS.signed, true, true),
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 3)!, CONTRACT_STATUS.signed, true, true),
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 4)!, CONTRACT_STATUS.signed, true, true),
  // 待付定金：乙方（开发者）已签，等甲方（需求方）签（签约中 1）
  buildContract(REQUIREMENT_SEEDS.find((s) => s.id === 6)!, CONTRACT_STATUS.signing, false, true),
]

export function contractOfRequirement(code: string): ContractDetail | undefined {
  return contracts.find((item) => item.requirement_id === code)
}
