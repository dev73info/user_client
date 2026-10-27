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

export type ContractDetail = ContractAttachmentFields & {
  id: number
  template_name?: string
  requirement_id?: string | null
  contract_no: string
  channel_contract_no?: string | null
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

export type MyContractSummary = Pick<
  ContractDetail,
  | 'id'
  | 'contract_no'
  | 'title'
  | 'status'
  | 'party_a_name'
  | 'party_a_username'
  | 'party_a_signed_at'
  | 'party_b_name'
  | 'party_b_username'
  | 'party_b_signed_at'
  | 'party_c_name'
  | 'party_c_signed_at'
  | 'created_at'
  | 'updated_at'
  | 'requirement_id'
  // 列表要能区分来源、并标出附件审核态（后端 `CONTRACT_FIELDS_SUMMARY` 一并透出这几个字段）。
  | 'content_source'
  | 'attachment_review_status'
  | 'attachment_file_name'
  | 'attachment_file_sha256'
  // R014：列表展示合同有效期截止（担保需求）。
  | 'effective_until'
  | 'development_cycle_days'
> & { template_name: string }

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

/** 下载到的文件：blob 与建议文件名（后端未给文件名时用调用方传入的兜底名）。 */
export type DownloadedContractFile = {
  blob: Blob
  fileName: string
}
