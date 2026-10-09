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
