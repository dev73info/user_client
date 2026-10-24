import type { ContractDetail, MyContractSummary } from '@/api/contracts'
import type { ContractSigningStatus } from '@/shared/contracts'
import { CONTRACT_STATUS } from '@/shared/contracts'
import { CLIENT_USERNAME, DEV_USERNAME, contractOfRequirement, contracts } from '../../db'
import { MOCK_IDENTITY_PROFILES } from '../../identity'
import { errorResponse, jsonResponse } from '../../response'
import type { MockRequest } from '../../router'

export function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export function toSummary(contract: ContractDetail): MyContractSummary {
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

export const attachmentOverlay = new Map<number, MockAttachment>()
/** 已发起过爱签签署（渠道合同已创建）的合同：此后不能再换附件，与后端 409 边界一致。 */
export const signingInitiatedContracts = new Set<number>()

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
export function withAttachment(contract: ContractDetail): ContractDetail {
  return { ...contract, ...attachmentFieldsOf(contract.id) }
}

export function currentPartyOf(request: MockRequest): 'party_a' | 'party_b' {
  return request.identity === 'dev' ? 'party_b' : 'party_a'
}

export function currentUsernameOf(request: MockRequest): string {
  return request.identity === 'dev' ? DEV_USERNAME : CLIENT_USERNAME
}

/**
 * 上传 / 拟定共用的落库逻辑：挂在该需求已有的合同行上。
 *
 * 与后端同口径：没有合同行 409「请先发起合同」；已发起签署 409「需作废重签」；
 * **任何一次覆盖都把审核态重置为「待审核」**（不允许沿用旧放行）。
 */
export function saveAttachment(
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

export function contractById(contractId: string | undefined): ContractDetail | undefined {
  return contracts.find((item) => String(item.id) === contractId)
}

/** 我的合同：客户是甲方（party_a），开发者是乙方（party_b）。 */
export function myContracts(request: MockRequest): ContractDetail[] {
  if (request.identity === 'dev') {
    return contracts.filter((item) => item.party_b_username === DEV_USERNAME)
  }

  return contracts.filter((item) => item.party_a_username === CLIENT_USERNAME)
}

export function signingStatusOf(requirementId: string): ContractSigningStatus {
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
export function developerAgreement(): ContractDetail {
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
