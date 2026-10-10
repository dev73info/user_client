/**
 * 合同：我的合同、按需求取合同、签署、爱签相关占位。
 *
 * 合同状态与需求单状态在 `db.ts` 里是对齐的：合同签完才可能进入「待付定金」。
 * 签署动作会同时更新合同状态与签署日志，签署页刷新后能看到自己那一方的签字时间。
 */

import type { ContractDetail, MyContractSummary } from '@/api/contracts'
import { CONTRACT_STATUS, type ContractSigningStatus } from '@/shared/contracts'

import { CLIENT_USERNAME, DEV_USERNAME, contractOfRequirement, contracts, findRequirement } from '../db'
import { defineRouteTable, type MockRequest, type MockRoute } from '../router'
import { errorResponse, jsonResponse, textResponse } from '../response'
import { MOCK_IDENTITY_PROFILES } from '../identity'

function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function toSummary(contract: ContractDetail): MyContractSummary {
  const attached = withAttachment(contract)
  return {
    id: attached.id,
    contract_no: attached.contract_no,
    title: attached.title,
    status: attached.status,
    party_a_name: attached.party_a_name,
    party_a_username: attached.party_a_username,
    party_a_signed_at: attached.party_a_signed_at,
    party_b_name: attached.party_b_name,
    party_b_username: attached.party_b_username,
    party_b_signed_at: attached.party_b_signed_at,
    party_c_name: attached.party_c_name,
    party_c_signed_at: attached.party_c_signed_at,
    created_at: attached.created_at,
    updated_at: attached.updated_at,
    requirement_id: attached.requirement_id,
    template_name: attached.template_name ?? 'requirement_development_contract',
    // R012：列表要能区分来源、并标出附件审核态（后端 `CONTRACT_FIELDS_SUMMARY` 同样透出这几个字段）。
    content_source: attached.content_source,
    attachment_review_status: attached.attachment_review_status,
    attachment_file_name: attached.attachment_file_name,
    attachment_file_sha256: attached.attachment_file_sha256,
  }
}

/* -------------------------------------------- R012 自定义合同附件（mock 内存态） */

/**
 * 附件在 mock 里的内存态，覆盖在 `db.ts` 那几份合同之上（不改 db 里的对象）。
 *
 * ⚠️ mock 读不到 multipart 的文件字节（`MockRequest` 对 FormData 只保留文本字段），
 * 上传/拟定只能伪造文件信息；格式、大小、魔数与 409 边界等真实校验一律以后端为准。
 */
type MockAttachment = {
  content_source: 'uploaded_file' | 'drafted_terms'
  attachment_file_name: string
  attachment_file_mime: string
  attachment_file_size: number
  attachment_file_sha256: string
  attachment_prepared_by: string
  attachment_prepared_party: 'party_a' | 'party_b'
  attachment_prepared_at: string
  attachment_review_status: 'pending' | 'approved' | 'rejected'
  attachment_reviewed_by: string | null
  attachment_reviewed_at: string | null
  attachment_review_note: string | null
  attachment_approved_sha256: string | null
}

const attachmentOverlay = new Map<number, MockAttachment>()
/** 已发起过爱签签署（渠道合同已创建）的合同：此后不能再换附件，与后端 409 边界一致。 */
const signingInitiatedContracts = new Set<number>()

/** 伪造一个稳定的 64 位十六进制指纹（真实 sha256 由后端算）。 */
function mockAttachmentSha(seed: number): string {
  return String(seed).padStart(4, '0').repeat(16)
}

function attachmentFieldsOf(contractId: number): Partial<ContractDetail> {
  const item = attachmentOverlay.get(contractId)
  if (!item) {
    return { content_source: 'platform', attachment_review_status: 'none' }
  }
  return { ...item }
}

/** 把内存态附件字段并进合同响应；db 里的合同对象本身不改。 */
function withAttachment(contract: ContractDetail): ContractDetail {
  return { ...contract, ...attachmentFieldsOf(contract.id) }
}

function currentPartyOf(request: MockRequest): 'party_a' | 'party_b' {
  return request.identity === 'dev' ? 'party_b' : 'party_a'
}

function currentUsernameOf(request: MockRequest): string {
  return request.identity === 'dev' ? DEV_USERNAME : CLIENT_USERNAME
}

/**
 * 上传 / 拟定共用的落库逻辑：挂在该需求已有的合同行上。
 *
 * 与后端同口径：没有合同行 409「请先发起合同」；已发起签署 409「需作废重签」；
 * **任何一次覆盖都把审核态重置为「待审核」**（不允许沿用旧放行）。
 */
function saveAttachment(
  request: MockRequest,
  requirementId: string,
  source: MockAttachment['content_source'],
  fileName: string,
  mime: string,
): Response {
  const contract = contractOfRequirement(requirementId)
  if (!contract) {
    return errorResponse(409, '请先发起合同')
  }
  if (signingInitiatedContracts.has(contract.id)) {
    return errorResponse(409, '已发起签署，需作废重签')
  }

  attachmentOverlay.set(contract.id, {
    content_source: source,
    attachment_file_name: fileName,
    attachment_file_mime: mime,
    attachment_file_size: 1024 * (attachmentOverlay.size + 1),
    attachment_file_sha256: mockAttachmentSha(attachmentOverlay.size + 1),
    attachment_prepared_by: currentUsernameOf(request),
    attachment_prepared_party: currentPartyOf(request),
    attachment_prepared_at: nowText(),
    attachment_review_status: 'pending',
    attachment_reviewed_by: null,
    attachment_reviewed_at: null,
    attachment_review_note: null,
    attachment_approved_sha256: null,
  })

  return jsonResponse(withAttachment(contract))
}

function contractById(contractId: string | undefined): ContractDetail | undefined {
  return contracts.find((item) => String(item.id) === contractId)
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
    return { has_contract: false, status: null, party_a_signed: false, party_b_signed: false }
  }

  return {
    // 与后端同口径：作废 6 不算有效合同，但 status 仍带回给标签展示
    has_contract: contract.status !== CONTRACT_STATUS.voided,
    status: contract.status,
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
    status: CONTRACT_STATUS.signed,
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
  /* ------------------------------- R012 自定义合同附件（上传 / 拟定 / 撤回 / 下载） */
  {
    method: 'POST',
    path: '/contracts/requirement/:requirementId/attachment',
    note: '上传自定义合同附件：mock 读不到 multipart 字节，只伪造一份文件信息',
    handler: (request, params) => saveAttachment(
      request,
      params.requirementId ?? '',
      'uploaded_file',
      'mock 上传的合同附件.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ),
  },
  {
    method: 'POST',
    path: '/contracts/requirement/:requirementId/attachment/draft',
    note: '页面内拟定条款生成附件；金额必须等于需求单预算（与后端同口径）',
    handler: (request, params) => {
      const requirementId = params.requirementId ?? ''
      const body = (request.body ?? {}) as { title?: string; amount?: number }
      const budget = findRequirement(requirementId)?.budget ?? 0
      const amount = Number(body.amount ?? 0)

      if (!Number.isFinite(amount) || amount <= 0) {
        return errorResponse(400, '拟定金额必须大于 0，且与需求单预算一致')
      }
      if (budget > 0 && Math.abs(amount - budget) > 0.001) {
        return errorResponse(400, `拟定金额必须等于需求单预算 ¥${budget.toFixed(2)}`)
      }

      const title = (body.title ?? '').trim() || '合同附件'
      return saveAttachment(
        request,
        requirementId,
        'drafted_terms',
        `${title}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
    },
  },
  {
    method: 'DELETE',
    path: '/contracts/:contractId/attachment',
    note: '撤回自定义合同附件（仅在未发起签署时允许）',
    handler: (_request, params) => {
      const contract = contractById(params.contractId)
      if (!contract) {
        return textResponse('合同不存在', 404)
      }
      if (signingInitiatedContracts.has(contract.id)) {
        return errorResponse(409, '已发起签署，需作废重签')
      }
      attachmentOverlay.delete(contract.id)
      return jsonResponse(withAttachment(contract))
    },
  },
  {
    method: 'GET',
    path: '/contracts/:contractId/attachment',
    note: '下载附件原件：mock 返回占位文本（鉴权下载与 /uploads 排除以后端为准）',
    handler: (_request, params) => {
      const contract = contractById(params.contractId)
      const item = contract ? attachmentOverlay.get(contract.id) : undefined
      return textResponse(`mock 附件占位内容：${item?.attachment_file_name ?? '无附件'}`)
    },
  },
  {
    method: 'GET',
    path: '/contracts/attachment/blank-template',
    note: '下载空白合同模板：mock 返回占位文本',
    handler: () => textResponse('mock 空白合同模板占位内容'),
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/attachment/review',
    note: '附件审核（mock 专用，方便本地走查三态；真实审核在管理端，见任务-03）',
    handler: (request, params) => {
      const contract = contractById(params.contractId)
      const item = contract ? attachmentOverlay.get(contract.id) : undefined
      if (!contract || !item) {
        return errorResponse(409, '该合同没有可审核的附件')
      }

      const body = (request.body ?? {}) as { decision?: string; note?: string }
      const decision = body.decision === 'rejected' ? 'rejected' : 'approved'
      item.attachment_review_status = decision
      item.attachment_reviewed_by = 'admin'
      item.attachment_reviewed_at = nowText()
      item.attachment_review_note = (body.note ?? '').trim() || null
      // 放行是「对某个具体版本」放行的：记下当前指纹，换过文件就不再匹配（与后端同口径）。
      item.attachment_approved_sha256 = decision === 'approved' ? item.attachment_file_sha256 : null

      return jsonResponse(withAttachment(contract))
    },
  },
  {
    method: 'GET',
    path: '/contracts/developer-agreement',
    note: '开发者入驻协议',
    handler: () => jsonResponse(developerAgreement()),
  },
]

export const contractRoutes = defineRouteTable('contracts', routes)
