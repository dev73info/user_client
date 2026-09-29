/**
 * 合同：我的合同、按需求取合同、签署、爱签相关占位。
 *
 * 合同状态与需求单状态在 `db.ts` 里是对齐的：合同签完才可能进入「待付定金」。
 * 签署动作会同时更新合同状态与签署日志，签署页刷新后能看到自己那一方的签字时间。
 */

import type { ContractDetail, MyContractSummary } from '@/api/contracts'
import type { ContractSigningStatus } from '@/shared/contracts'

import { CLIENT_USERNAME, DEV_USERNAME, contractOfRequirement, contracts } from '../db'
import { defineRouteTable, type MockRequest, type MockRoute } from '../router'
import { jsonResponse, textResponse } from '../response'
import { MOCK_IDENTITY_PROFILES } from '../identity'

function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function toSummary(contract: ContractDetail): MyContractSummary {
  return {
    id: contract.id,
    contract_no: contract.contract_no,
    title: contract.title,
    status: contract.status,
    party_a_name: contract.party_a_name,
    party_a_username: contract.party_a_username,
    party_a_signed_at: contract.party_a_signed_at,
    party_b_name: contract.party_b_name,
    party_b_username: contract.party_b_username,
    party_b_signed_at: contract.party_b_signed_at,
    party_c_name: contract.party_c_name,
    party_c_signed_at: contract.party_c_signed_at,
    created_at: contract.created_at,
    updated_at: contract.updated_at,
    requirement_id: contract.requirement_id,
    template_name: contract.template_name ?? 'requirement_development_contract',
  }
}

/** 我的合同：客户是甲方（party_a），开发者是乙方（party_b）。 */
function myContracts(request: MockRequest): ContractDetail[] {
  if (request.identity === 'dev') {
    return contracts.filter((item) => item.party_b_username === DEV_USERNAME)
  }

  return contracts.filter((item) => item.party_a_username === CLIENT_USERNAME)
}

function signingStatusOf(requirementId: string): ContractSigningStatus {
  const contract = contractOfRequirement(requirementId)

  if (!contract) {
    return { has_contract: false, party_a_signed: false, party_b_signed: false }
  }

  return {
    has_contract: true,
    party_a_signed: Boolean(contract.party_a_signed_at),
    party_b_signed: Boolean(contract.party_b_signed_at),
  }
}

/** 开发者入驻协议：与需求合同不是一份东西，单独造一份出来。 */
function developerAgreement(): ContractDetail {
  return {
    id: 900,
    template_name: 'developer_agreement',
    requirement_id: null,
    contract_no: 'HT-DEV-AGREEMENT-MOCK',
    title: '开发者入驻协议',
    content: [
      '（演示协议）开发者入驻平台须遵守以下约定：',
      '',
      '一、按约定工期与验收标准交付，交付物不得侵犯第三方权利。',
      '二、担保模式接单需缴纳接单保证金，结单后退回。',
      '三、平台按合同约定比例收取服务费，尾款结算后分账。',
      '',
      '关闭 mock 即可看到真实协议文本。',
    ].join('\n'),
    content_sha256: 'mock-agreement-sha256',
    status: 'signed',
    party_a_name: '柒参信息（平台）',
    party_a_username: 'admin',
    party_a_account_email: 'fanbo@73info.cn',
    party_a_signed_at: '2026-01-01 10:00:00',
    party_b_name: MOCK_IDENTITY_PROFILES.dev.nickname,
    party_b_username: DEV_USERNAME,
    party_b_account_email: MOCK_IDENTITY_PROFILES.dev.email,
    party_b_real_name: MOCK_IDENTITY_PROFILES.dev.nickname,
    party_b_id_card_no_masked: '1101**********5678',
    party_b_signed_at: '2026-01-01 10:05:00',
    created_at: '2026-01-01 09:50:00',
    updated_at: '2026-01-01 10:05:00',
    signing_logs: [],
  }
}

const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/contracts/mine',
    note: '我的合同列表（按身份取甲方或乙方）',
    handler: (request) => jsonResponse(myContracts(request).map(toSummary)),
  },
  {
    method: 'GET',
    path: '/contracts/mine/:contractId',
    note: '我的合同详情',
    handler: (request, params) => {
      const contract = myContracts(request).find((item) => String(item.id) === params.contractId)
      return contract ? jsonResponse(contract) : textResponse('合同不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/contracts/signing-status/:requirementId',
    note: '按需求查签署状态（需求方用）',
    handler: (_request, params) => jsonResponse(signingStatusOf(params.requirementId ?? '')),
  },
  {
    method: 'GET',
    path: '/dev/contracts/signing-status/:requirementId',
    note: '按需求查签署状态（开发者用）',
    handler: (_request, params) => jsonResponse(signingStatusOf(params.requirementId ?? '')),
  },
  {
    method: 'GET',
    path: '/contracts/requirement/:requirementId/my-contract',
    note: '按需求取当前用户的合同；没有合同要返回 404，前端据此判断「还没发起合同」',
    handler: (request, params) => {
      const contract = myContracts(request).find(
        (item) => item.requirement_id === params.requirementId,
      )
      return contract ? jsonResponse(contract) : textResponse('合同不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/contracts/requirement/:requirementId',
    note: '发起《需求开发合同》（幂等）',
    handler: (_request, params) => {
      const contract = contractOfRequirement(params.requirementId ?? '')
      return contract
        ? jsonResponse(contract)
        : textResponse('该需求还没有可发起的合同', 404)
    },
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/sign',
    note: '签署合同：按当前身份写自己那一方的签署时间，双方签完转 signed',
    handler: (request, params) => {
      const contract = contracts.find((item) => String(item.id) === params.contractId)
      if (!contract) {
        return textResponse('合同不存在', 404)
      }

      const signedAt = nowText()
      const isDev = request.identity === 'dev'

      if (isDev) {
        contract.party_b_signed_at = signedAt
        contract.party_b_signature_sha256 = 'mock-signature-b'
      } else {
        contract.party_a_signed_at = signedAt
        contract.party_a_signature_sha256 = 'mock-signature-a'
      }

      contract.status =
        contract.party_a_signed_at && contract.party_b_signed_at
          ? 'signed'
          : contract.party_a_signed_at
            ? 'pending_party_b'
            : 'pending_party_a'
      contract.updated_at = signedAt

      return jsonResponse(contract)
    },
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/asign-sign',
    note: '爱签签署：mock 不跳第三方，直接返回已签署的本地合同状态',
    handler: (_request, params) => {
      const contract = contracts.find((item) => String(item.id) === params.contractId)
      if (!contract) {
        return textResponse('合同不存在', 404)
      }

      return jsonResponse({
        contract_id: contract.id,
        contract_no: contract.contract_no,
        sign_url: null,
        status: contract.status,
      })
    },
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/asign-sync',
    note: '同步爱签签署状态：mock 下与本地一致',
    handler: (_request, params) => {
      const contract = contracts.find((item) => String(item.id) === params.contractId)
      return contract ? jsonResponse(contract) : textResponse('合同不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/contracts/:contractId/asign/preview',
    note: '爱签合同预览地址（mock 不提供外部链接，调用方会回退本地展示）',
    handler: () => textResponse('mock 未接入爱签预览', 404),
  },
  {
    method: 'GET',
    path: '/contracts/requirement/:requirementId/asign/preview',
    note: '按需求取爱签预览地址（mock 不提供）',
    handler: () => textResponse('mock 未接入爱签预览', 404),
  },
  {
    method: 'GET',
    path: '/contracts/developer-agreement',
    note: '开发者入驻协议',
    handler: () => jsonResponse(developerAgreement()),
  },
]

export const contractRoutes = defineRouteTable('contracts', routes)
