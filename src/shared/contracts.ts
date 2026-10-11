export type ContractSigningStatus = {
  has_contract: boolean
  /** 最新合同状态码（0/1/2/3/4/6/7）；尚无合同时为空 */
  status?: number | null
  party_b_signed: boolean
  party_a_signed: boolean
  party_c_signed?: boolean
}

/**
 * 合同状态：整数枚举（与后端 `models::contract::CONTRACT_STATUSES` 同一份值域，没有 5）。
 *
 * - 0 等待签约：已建单但还没发起签署（旧 `draft`）
 * - 1 签约中：已发起、等待某一方签署（旧 `pending_party_a` / `pending_party_b`）
 * - 2 已签约：双方签署完成（旧 `signed`）
 * - 3 过期 / 4 拒签 / 6 作废（旧 `void`）/ 7 撤销
 *
 * ⚠️ 签署顺序不再由状态编码：两个「待某方签署」已合并为「签约中 1」，
 * 轮到谁签改由 `party_a_signed_at` / `party_b_signed_at` 推导（见 `getSignatureState`）。
 */
export const CONTRACT_STATUS = {
  /** 0 等待签约 */
  awaiting: 0,
  /** 1 签约中（可签） */
  signing: 1,
  /** 2 已签约 */
  signed: 2,
  /** 3 过期 */
  expired: 3,
  /** 4 拒签 */
  rejected: 4,
  /** 6 作废 */
  voided: 6,
  /** 7 撤销 */
  revoked: 7,
} as const

/** 状态码 → 中文标签，文案与后端 `contract_status_label` 逐字一致。 */
const CONTRACT_STATUS_LABELS: Record<number, string> = {
  [CONTRACT_STATUS.awaiting]: '等待签约',
  [CONTRACT_STATUS.signing]: '签约中',
  [CONTRACT_STATUS.signed]: '已签约',
  [CONTRACT_STATUS.expired]: '过期',
  [CONTRACT_STATUS.rejected]: '拒签',
  [CONTRACT_STATUS.voided]: '作废',
  [CONTRACT_STATUS.revoked]: '撤销',
}

/** 合同状态中文标签；未知值回退 `状态 ${n}`（与后端同一口径）。 */
export function contractStatusLabel(status: number): string {
  return CONTRACT_STATUS_LABELS[status] ?? `状态 ${status}`
}

/**
 * 合同有效期截止文案（R014，担保需求）。
 *
 * 后端在**双方签署完成**（`status = 2`）时写入 `effective_until`（东八区 `YYYY-MM-DD HH:mm:ss`），
 * 值 = `max(party_a_signed_at, party_b_signed_at)` + 开发周期天。未签署完成时后端给 `null`，
 * 这时页面写「待双方签署完成后计算」，不要显示空值。
 *
 * 已签署完成却没有截止时间的是**非担保合同**（`self_managed` 不建合同、也不设有效期），
 * 按平台规则展示「不设有效期」，避免读成「还没算出来」。
 */
export function contractEffectiveUntilLabel(
  status: number,
  effectiveUntil: string | null | undefined,
): string {
  const value = effectiveUntil?.trim()
  if (value) {
    return value
  }
  if (status === CONTRACT_STATUS.signed) {
    return '按平台规则不设有效期'
  }
  return '待双方签署完成后计算'
}

/**
 * 合同正文来源（与后端 `contract.content_source` 逐字一致）。
 *
 * - `platform`：平台按《需求开发合同》模板生成的正文，**唯一被签署的主文件**；
 * - `uploaded_file`：当事人上传的自定义合同附件（方案 A）；
 * - `drafted_terms`：当事人在页面内拟定、由平台渲染成的附件（方案 B）。
 *
 * 后两者都只是主合同的附件，资金与期限仍按需求单与平台规则执行。
 */
export const CONTRACT_CONTENT_SOURCE = {
  platform: 'platform',
  uploaded: 'uploaded_file',
  drafted: 'drafted_terms',
} as const

export type ContractContentSource =
  (typeof CONTRACT_CONTENT_SOURCE)[keyof typeof CONTRACT_CONTENT_SOURCE]

const CONTENT_SOURCE_LABELS: Record<ContractContentSource, string> = {
  platform: '平台生成',
  uploaded_file: '上传附件',
  drafted_terms: '页面拟定',
}

/** 合同来源中文标签（合同列表用来区分平台生成 / 上传附件 / 页面拟定）。 */
export function contractContentSourceLabel(
  source: ContractContentSource | null | undefined,
): string {
  if (!source) {
    return CONTENT_SOURCE_LABELS.platform
  }
  return CONTENT_SOURCE_LABELS[source] ?? CONTENT_SOURCE_LABELS.platform
}

/**
 * 自定义合同附件的平台审核态（与后端 `contract.attachment_review_status` 逐字一致）。
 *
 * 单独一条状态轴、**不塞进合同状态**：合同状态是整数枚举（0/1/2/3/4/6/7），
 * 附件审核是 `none` / `pending` / `approved` / `rejected` 四态。
 */
export const ATTACHMENT_REVIEW_STATUS = {
  none: 'none',
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
} as const

export type ContractAttachmentReviewStatus =
  (typeof ATTACHMENT_REVIEW_STATUS)[keyof typeof ATTACHMENT_REVIEW_STATUS]

/** 附件提交方：`party_a` 甲方（需求方）/ `party_b` 乙方（开发者）。 */
export type ContractAttachmentParty = 'party_a' | 'party_b'

const ATTACHMENT_REVIEW_LABELS: Record<ContractAttachmentReviewStatus, string> = {
  none: '未准备',
  pending: '待审核',
  approved: '已放行',
  rejected: '已驳回',
}

/** 附件审核态中文标签；缺省（无附件）按「未准备」。 */
export function attachmentReviewStatusLabel(
  status: ContractAttachmentReviewStatus | null | undefined,
): string {
  if (!status) {
    return ATTACHMENT_REVIEW_LABELS.none
  }
  return ATTACHMENT_REVIEW_LABELS[status] ?? ATTACHMENT_REVIEW_LABELS.none
}
