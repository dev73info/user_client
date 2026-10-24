import type { MockRoute } from '../../router'

import { CONTRACT_STATUS } from '@/shared/contracts'
import { contractOfRequirement, contracts } from '../../db'
import { jsonResponse, textResponse } from '../../response'
import {
  contractById,
  myContracts,
  nowText,
  signingInitiatedContracts,
  signingStatusOf,
  toSummary,
  withAttachment,
} from './helpers'

export const contractRoutes: MockRoute[] = [
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
      return contract ? jsonResponse(withAttachment(contract)) : textResponse('合同不存在', 404)
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
      return contract ? jsonResponse(withAttachment(contract)) : textResponse('合同不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/contracts/requirement/:requirementId',
    note: '发起《需求开发合同》（幂等）',
    handler: (_request, params) => {
      const contract = contractOfRequirement(params.requirementId ?? '')
      return contract
        ? jsonResponse(withAttachment(contract))
        : textResponse('该需求还没有可发起的合同', 404)
    },
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/sign',
    note: '签署合同：按当前身份写自己那一方的签署时间，双方签完转「已签约 2」',
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

      // 「签约中 1」覆盖「等待某一方签署」：双方都签完才转「已签约 2」。
      contract.status =
        contract.party_a_signed_at && contract.party_b_signed_at
          ? CONTRACT_STATUS.signed
          : CONTRACT_STATUS.signing
      contract.updated_at = signedAt

      return jsonResponse(withAttachment(contract))
    },
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/asign-sign',
    note: '爱签签署：mock 不跳第三方，直接返回已签署的本地合同状态',
    handler: (_request, params) => {
      const contract = contractById(params.contractId)
      if (!contract) {
        return textResponse('合同不存在', 404)
      }

      // R012：渠道合同一旦创建（已发起签署）就不能再换附件——记下来给上传接口拦 409。
      signingInitiatedContracts.add(contract.id)

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
      const contract = contractById(params.contractId)
      return contract ? jsonResponse(withAttachment(contract)) : textResponse('合同不存在', 404)
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
]
