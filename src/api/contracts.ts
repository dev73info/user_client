import {
  apiUrl,
  authHeader,
  HttpError,
  readErrorMessage,
  requestJson,
  requestVoid,
} from '@/api/http'
import type { ContractSigningStatus } from '@/shared/contracts'

export type { ContractSigningStatus } from '@/shared/contracts'
export {
  ATTACHMENT_REVIEW_STATUS,
  CONTRACT_CONTENT_SOURCE,
  attachmentReviewStatusLabel,
  contractContentSourceLabel,
} from '@/shared/contracts'
export type {
  ContractAttachmentParty,
  ContractAttachmentReviewStatus,
  ContractContentSource,
} from '@/shared/contracts'

import type {
  ContractAttachmentParty,
  ContractAttachmentReviewStatus,
  ContractContentSource,
} from '@/shared/contracts'

/**
 * 自定义合同附件的字段集合。
 *
 * 字段由后端 `CONTRACT_FIELDS_FULL` / `CONTRACT_FIELDS_SUMMARY` 透出；未准备附件（或已撤回）时
 * `content_source = 'platform'`、`attachment_review_status = 'none'`、其余附件字段为空。
 *
 * ⚠️ `attachment_file_sha256` 是**附件文件字节**的 sha256，与正文的运行期指纹 `content_sha256`
 * 是两回事；`attachment_approved_sha256` 是平台放行时记下的那一版指纹，只有它与
 * `attachment_file_sha256` 一致、且 `attachment_review_status = 'approved'`，才视为「当前版本已放行」。
 */
export type ContractAttachmentFields = {
  content_source?: ContractContentSource | null
  attachment_file_path?: string | null
  attachment_file_name?: string | null
  attachment_file_mime?: string | null
  attachment_file_size?: number | null
  attachment_file_sha256?: string | null
  attachment_prepared_by?: string | null
  attachment_prepared_party?: ContractAttachmentParty | null
  attachment_prepared_at?: string | null
  attachment_review_status?: ContractAttachmentReviewStatus | null
  attachment_reviewed_by?: string | null
  attachment_reviewed_at?: string | null
  attachment_review_note?: string | null
  attachment_approved_sha256?: string | null
}

export type ContractDetail = ContractAttachmentFields & {
  id: number
  template_name?: string
  requirement_id?: string | null
  contract_no: string
  title: string
  content: string
  content_sha256: string
  /** 整数合同状态（值域见 `CONTRACT_STATUS`，没有 5）。 */
  status: number
  party_a_name: string
  party_a_username: string | null
  party_a_account_email?: string | null
  party_a_real_name?: string | null
  party_a_id_card_no_masked?: string | null
  party_a_signature_sha256?: string | null
  party_a_signed_at: string | null
  party_b_name: string
  party_b_username: string | null
  party_b_account_email?: string | null
  party_b_real_name?: string | null
  party_b_id_card_no_masked?: string | null
  party_b_signature_sha256?: string | null
  party_b_signed_at: string | null
  party_c_name?: string
  party_c_username?: string | null
  party_c_signed_at?: string | null
  created_by?: string
  created_at: string
  updated_at?: string
  /**
   * 合同有效期截止时间（东八区 `YYYY-MM-DD HH24:MI:SS`，R014）：担保需求在双方签署完成时写入，
   * 值 = `max(party_a_signed_at, party_b_signed_at)` + 开发周期天。非担保需求或尚未签署完成时为 `null`。
   */
  effective_until?: string | null
  /** 签约时快照的开发周期（天，R014）；非担保需求或未签时为 `null`。 */
  development_cycle_days?: number | null
  signing_logs?: SigningLogItem[]
}

export type MyContractSummary = Pick<ContractDetail,
  'id' | 'contract_no' | 'title' | 'status' | 'party_a_name' | 'party_a_username' |
  'party_a_signed_at' | 'party_b_name' | 'party_b_username' | 'party_b_signed_at' |
  'party_c_name' | 'party_c_signed_at' | 'created_at' | 'updated_at' | 'requirement_id' |
  // 列表要能区分来源、并标出附件审核态（后端 `CONTRACT_FIELDS_SUMMARY` 一并透出这几个字段）。
  'content_source' | 'attachment_review_status' | 'attachment_file_name' | 'attachment_file_sha256' |
  // R014：列表展示合同有效期截止（担保需求）。
  'effective_until' | 'development_cycle_days'
> & { template_name: string }

export function listMyContracts(token: string): Promise<MyContractSummary[]> {
  return requestJson<MyContractSummary[]>('/contracts/mine',
    { headers: authHeader(token) }, '获取我的合同失败')
}

export function fetchMyContract(token: string, contractId: number): Promise<ContractDetail> {
  return requestJson<ContractDetail>(`/contracts/mine/${contractId}`,
    { headers: authHeader(token) }, '获取合同详情失败')
}

export type SigningLogItem = {
  id: number
  contract_id: number
  contract_no: string
  contract_title: string
  action: string
  /** 签署前后的整数状态（值域同 `CONTRACT_STATUS`）；无变更时可为 null。 */
  from_status?: number | null
  to_status?: number | null
  operator: string
  signer_party?: string | null
  signer_real_name?: string | null
  signer_id_card_no_masked?: string | null
  signer_username?: string | null
  signer_email?: string | null
  handwritten_signature?: string | null
  signature_sha256?: string | null
  note?: string | null
  created_at: string
}

export type SignContractPayload = {
  handwritten_signature: string
}

export type SignContractInitiateResponse = {
  contract_id: number
  contract_no: string
  sign_url: string | null
  /** 发起签署后的整数合同状态。 */
  status: number
}

export async function fetchContractSigningStatus(
  token: string,
  requirementId: string,
): Promise<ContractSigningStatus> {
  return requestJson<ContractSigningStatus>(
    `/contracts/signing-status/${encodeURIComponent(requirementId)}`,
    { headers: authHeader(token) },
    '获取合同签署状态失败',
  )
}

export async function fetchDevContractSigningStatus(
  token: string,
  requirementId: string,
): Promise<ContractSigningStatus> {
  return requestJson<ContractSigningStatus>(
    `/dev/contracts/signing-status/${encodeURIComponent(requirementId)}`,
    { headers: authHeader(token) },
    '获取合同签署状态失败',
  )
}

export async function fetchMyRequirementContract(
  token: string,
  requirementId: string,
): Promise<ContractDetail | null> {
  const res = await fetch(
    apiUrl(`/contracts/requirement/${encodeURIComponent(requirementId)}/my-contract`),
    { headers: authHeader(token), credentials: 'omit' },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('获取合同失败')
  return res.json() as Promise<ContractDetail>
}

export async function signContract(
  token: string,
  contractId: number,
  payload: SignContractPayload,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/${contractId}/sign`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '签署合同失败',
  )
}

export async function initiateAsignSign(
  token: string,
  contractId: number,
  notice = false,
): Promise<SignContractInitiateResponse> {
  return requestJson<SignContractInitiateResponse>(
    `/contracts/${contractId}/asign-sign`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notice }),
    },
    '发起爱签签署失败',
  )
}

export async function fetchDeveloperAgreement(
  token: string,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    '/contracts/developer-agreement',
    { headers: authHeader(token) },
    '获取开发者入驻协议失败',
  )
}

/**
 * 由需求方或已接单开发者主动发起《需求开发合同》。
 * 接单不再自动建合同，双方任一当事人均可发起（幂等）。
 */
export async function createRequirementContract(
  token: string,
  requirementId: string,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/requirement/${encodeURIComponent(requirementId)}`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    '发起合同失败',
  )
}

/**
 * 用户端同步爱签签署状态到本地合同。
 *
 * 场景：用户已在爱签页面完成签署，但爱签回调可能延迟/丢失
 * （本地开发环境回调发到生产域名，本地收不到），导致本地合同仍停留在
 * 「签约中 1」。前端在签约页加载/轮询时调用本接口，主动向爱签查询签署状态，
 * 若爱签侧已完成则更新本地合同为已签署。
 */
export async function syncAsignSignStatus(
  token: string,
  contractId: number,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/${contractId}/asign-sync`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '同步签署状态失败',
  )
}

/**
 * 获取爱签合同预览链接（previewContract）。
 *
 * 合同已在爱签侧创建（已发起过签署）时返回预览链接，前端跳转即可查看
 * 签署完成后的合同样式；未发起或爱签异常时接口报错，调用方回退本地合同展示。
 */
export async function fetchAsignContractPreviewUrl(
  token: string,
  contractId: number,
): Promise<string> {
  const res = await requestJson<{ preview_url: string }>(
    `/contracts/${contractId}/asign/preview`,
    { headers: authHeader(token) },
    '获取合同预览失败',
  )
  return res.preview_url
}

/**
 * 按需求获取爱签合同预览链接。
 */
export async function fetchAsignRequirementPreviewUrl(
  token: string,
  requirementId: string,
): Promise<string> {
  const res = await requestJson<{ preview_url: string }>(
    `/contracts/requirement/${encodeURIComponent(requirementId)}/asign/preview`,
    { headers: authHeader(token) },
    '获取合同预览失败',
  )
  return res.preview_url
}

/* ------------------------------------------------------------------ 自定义合同附件 */

/**
 * 页面内拟定条款（方案 B）的提交体。
 *
 * 字段名与后端任务-01 的 `/contract/requirement/{id}/attachment/draft` 请求体对齐；
 * 「金额必须等于需求单预算」由后端强制校验（不允许为 0、不允许与预算不一致），
 * 前端只用需求单预算做提交前的预校验并给出提示，最终以后端为准。
 */
export type DraftContractAttachmentPayload = {
  /** 附件标题（默认预填合同标题）。 */
  title: string
  /** 拟定金额（元），必须等于需求单预算。 */
  amount: number
  /** 付款节点说明。 */
  payment_terms: string
  /** 验收标准（默认预填需求单验收标准）。 */
  acceptance_criteria: string
  /** 知识产权约定。 */
  intellectual_property: string
  /** 违约与争议解决。 */
  breach_and_dispute: string
  /** 补充条款（纯文本）。 */
  supplementary_terms: string
}

/**
 * 上传自定义合同附件（方案 A）。
 *
 * 挂在该需求**已有生效合同行**上（附件不单独建合同）：需求还没发起合同时后端返回 409「请先发起合同」；
 * 只收 pdf / doc / docx；发起爱签签署之后（`asign_contract_no` 非空）再上传返回 409「需作废重签」。
 * 任意一次上传/拟定都会把审核态重置为「待审核」——不允许沿用旧放行。
 */
export async function uploadContractAttachment(
  token: string,
  requirementId: string,
  file: File,
): Promise<ContractDetail> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<ContractDetail>(
    `/contracts/requirement/${encodeURIComponent(requirementId)}/attachment`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: formData,
    },
    '上传合同附件失败',
  )
}

/**
 * 在页面内拟定条款并由平台渲染成附件（方案 B）。
 *
 * 与上传共用同一组字段与同一个审核状态机：一笔合同只有一份附件，拟定与上传互相覆盖。
 */
export async function draftContractAttachment(
  token: string,
  requirementId: string,
  payload: DraftContractAttachmentPayload,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/requirement/${encodeURIComponent(requirementId)}/attachment/draft`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '提交合同条款失败',
  )
}

/**
 * 撤回自定义合同附件。
 *
 * 与上传同一道边界：只在渠道合同尚未创建（`asign_contract_no IS NULL`）时允许；
 * 撤回后 `content_source` 回 `platform`、附件字段清空、审核态回 `none`。
 */
export async function deleteContractAttachment(
  token: string,
  contractId: number,
): Promise<void> {
  await requestVoid(
    `/contracts/${contractId}/attachment`,
    {
      method: 'DELETE',
      headers: authHeader(token),
    },
    '撤回合同附件失败',
  )
}

/** 下载到的文件：blob 与建议文件名（后端未给文件名时用调用方传入的兜底名）。 */
export type DownloadedContractFile = {
  blob: Blob
  fileName: string
}

/** 从 `Content-Disposition` 还原文件名（UTF-8 优先，其次普通 filename）。 */
function fileNameFromDisposition(disposition: string | null): string {
  const value = disposition ?? ''
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim()
    } catch {
      return utf8Match[1].trim()
    }
  }
  const plainMatch = value.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1]?.trim() ?? ''
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

/**
 * 附件与空白模板的**鉴权下载**。
 *
 * 附件按任务-01 被排除在 `/uploads/**` 公开静态目录之外，只能走带令牌的接口取字节；
 * 后端有两种既有返回风格（原始字节流 / `{ file_name, file_content }` 的 base64 JSON，
 * 与爱签合同下载同风格），这里按 `Content-Type` 兼容两者，前端不必假定是哪一种。
 */
async function fetchAuthedContractFile(
  token: string,
  path: string,
  fallbackFileName: string,
  fallbackError: string,
): Promise<DownloadedContractFile> {
  const resp = await fetch(apiUrl(path), {
    headers: authHeader(token),
    credentials: 'omit',
  })
  if (!resp.ok) {
    throw new HttpError(resp.status, await readErrorMessage(resp, fallbackError))
  }

  const contentType = (resp.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.includes('application/json')) {
    const payload = (await resp.json()) as { file_name?: string | null; file_content?: string | null }
    const base64 = (payload.file_content ?? '').trim()
    if (!base64) {
      throw new Error(`${fallbackError}：接口未返回文件内容`)
    }
    const fileName = (payload.file_name ?? '').trim() || fallbackFileName
    return { blob: base64ToBlob(base64, ''), fileName }
  }

  const dispositionName = fileNameFromDisposition(resp.headers.get('content-disposition'))
  return { blob: await resp.blob(), fileName: dispositionName || fallbackFileName }
}

/** 下载合同附件原件（走鉴权接口，不是 `/uploads/**` 裸链）。 */
export function downloadContractAttachment(
  token: string,
  contractId: number,
  fallbackFileName = '合同附件',
): Promise<DownloadedContractFile> {
  return fetchAuthedContractFile(
    token,
    `/contracts/${contractId}/attachment`,
    fallbackFileName,
    '下载合同附件失败',
  )
}

/** 下载空白合同模板 docx（登录即可，供双方在本地整理条款后再上传）。 */
export function downloadBlankContractTemplate(
  token: string,
): Promise<DownloadedContractFile> {
  return fetchAuthedContractFile(
    token,
    '/contracts/attachment/blank-template',
    '需求开发合同模板.docx',
    '下载合同模板失败',
  )
}
