import type { ContractDetail } from '@/api/contracts'
import {
  ARCHIVED_WRITE_BLOCKED_MESSAGE,
  type RequirementArchiveState,
} from '@/shared/requirementArchive'
import { ATTACHMENT_REVIEW_STATUS, CONTRACT_STATUS } from '@/shared/contracts'

/**
 * 合同签署页的**纯展示口径**（R047 从 `ContractSignView` 迁出）。
 *
 * 这里只做「合同事实 → 页面文案 / 可用性」的换算，不碰路由、请求与定时器；
 * 视图与区块组件都读同一份口径，避免拆分后两边各判一次、判得不一样。
 */

/** 签署主体：甲方（需求方 / 平台）/ 乙方（开发者）。 */
export type ContractParty = 'party_a' | 'party_b'

/** 签约方展示行（甲方 / 乙方）。 */
export type PartyDisplay = {
  party: ContractParty
  label: string
  role: string
  legalName: string
  idCardNo: string
  username: string
  email: string
  signedAt: string | null
}

function displayText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim()
  return text ? text : fallback
}

/**
 * 当前账号在这份合同里的签署主体。
 *
 * 合同只记 `party_a_username` / `party_b_username`，不在其中就返回 null——
 * 页面据此既不给签署入口，也不显示「本次签署身份」区块。
 */
export function contractPartyOf(
  contract: ContractDetail | null,
  username: string,
): ContractParty | null {
  if (!contract || !username) return null
  if (contract.party_a_username === username) return 'party_a'
  if (contract.party_b_username === username) return 'party_b'
  return null
}

/**
 * 签约方展示行。
 *
 * 平台内置协议（开发者入驻 / 接口使用）的甲方是平台，其余合同甲方是需求方。
 */
export function contractPartyDisplay(
  contract: ContractDetail | null,
  party: ContractParty,
  platformAgreement: boolean,
): PartyDisplay | null {
  if (!contract) return null

  if (party === 'party_a') {
    return {
      party,
      label: '甲方',
      role: platformAgreement ? '平台' : '需求方',
      legalName: displayText(contract.party_a_real_name ?? contract.party_a_name, '未完成实名认证'),
      idCardNo: displayText(contract.party_a_id_card_no_masked, '未完成实名认证'),
      username: displayText(contract.party_a_username, '未绑定账号'),
      email: displayText(contract.party_a_account_email, '未绑定邮箱'),
      signedAt: contract.party_a_signed_at,
    }
  }

  return {
    party,
    label: '乙方',
    role: '开发者',
    legalName: displayText(contract.party_b_real_name ?? contract.party_b_name, '未完成实名认证'),
    idCardNo: displayText(contract.party_b_id_card_no_masked, '未完成实名认证'),
    username: displayText(contract.party_b_username, '未绑定账号'),
    email: displayText(contract.party_b_account_email, '未绑定邮箱'),
    signedAt: contract.party_b_signed_at,
  }
}

/** 签署身份是否可用于发起签署：实名姓名与身份证号都得有。 */
export function signerIdentityReady(signer: PartyDisplay | null): boolean {
  return Boolean(signer?.legalName && signer?.idCardNo && signer.idCardNo !== '未完成实名认证')
}

/**
 * 是否能签：只有「签约中 1」可签，且本人这一方还没签。
 *
 * 双方各自独立签署，不设先后顺序（爱签侧同样是无序签约 signOrder=1）：
 * 谁还没签谁就能签，双方都签完后由爱签同步置为「已签约 2」。
 */
export function canSignContract(
  contract: ContractDetail | null,
  currentParty: ContractParty | null,
): boolean {
  if (!contract || !currentParty) return false
  if (contract.status !== CONTRACT_STATUS.signing) return false
  return currentParty === 'party_a' ? !contract.party_a_signed_at : !contract.party_b_signed_at
}

/** 是否存在自定义合同附件（`content_source != platform`）。 */
export function hasCustomAttachment(contract: ContractDetail | null): boolean {
  return (contract?.content_source ?? 'platform') !== 'platform'
}

/**
 * 附件是否已放行到**当前这一版**。
 *
 * 放行是「对某个具体版本」放行的：审核通过时后端把当次附件指纹记进 `attachment_approved_sha256`，
 * 只有它与 `attachment_file_sha256` 一致才视为已放行——放行后重传/重新拟定会改指纹，旧放行自动失效。
 * 没有自定义附件（平台生成）时不受这道闸门约束。
 */
export function attachmentApproved(contract: ContractDetail | null): boolean {
  if (!contract || !hasCustomAttachment(contract)) return true
  if (contract.attachment_review_status !== ATTACHMENT_REVIEW_STATUS.approved) return false
  return (
    Boolean(contract.attachment_file_sha256) &&
    contract.attachment_approved_sha256 === contract.attachment_file_sha256
  )
}

/** 附件未放行时给出的中文说明；为空表示不拦签署。 */
export function attachmentGateMessage(contract: ContractDetail | null): string {
  if (attachmentApproved(contract)) return ''
  const status = contract?.attachment_review_status ?? ATTACHMENT_REVIEW_STATUS.none
  if (status === ATTACHMENT_REVIEW_STATUS.rejected) {
    return '自定义合同附件已被平台驳回，请修改后重新提交并等待审核'
  }
  return '自定义合同附件待平台审核通过后才能发起签署'
}

/** 归档态下签署按钮旁的中文说明（清除态无「锁定期」可言，单独一句）。 */
export function archiveSignBlockedMessage(state: RequirementArchiveState): string {
  return state === 'cleared' ? '合同资料已清除，不能再发起签署。' : ARCHIVED_WRITE_BLOCKED_MESSAGE
}

/**
 * 状态 chip 的语义色 token。
 *
 * 数字状态码不进 CSS 类名（`.contract-status-chip--1` 这种名字既读不懂又不好加档），
 * 样式里只认这些语义档；未知码回退到最中性的 `waiting` 档。
 */
const CONTRACT_STATUS_TONES: Record<number, string> = {
  [CONTRACT_STATUS.awaiting]: 'waiting',
  [CONTRACT_STATUS.signing]: 'signing',
  [CONTRACT_STATUS.signed]: 'signed',
  [CONTRACT_STATUS.expired]: 'expired',
  [CONTRACT_STATUS.rejected]: 'rejected',
  [CONTRACT_STATUS.voided]: 'void',
  [CONTRACT_STATUS.revoked]: 'revoked',
}

export function contractStatusTone(status: number): string {
  return CONTRACT_STATUS_TONES[status] ?? 'waiting'
}

/** 签署记录里每个动作的中文说明；后端给了 `note` 时优先用 `note`。 */
const SIGNING_LOG_LABELS: Record<string, string> = {
  created: '合同已创建',
  updated: '合同已更新',
  party_a_signed: '甲方已签署',
  party_b_signed: '乙方已签署',
  party_c_signed: '丙方已签署',
  asign_sign_initiated: '已发起电子签署',
  asign_sign_completed: '电子签署完成',
  signed: '签署已完成',
  void: '合同已作废',
}

/** 签署记录行的说明文案（`note` → 动作映射 → 通用兜底）。 */
export function signingLogLabel(log: { action: string; note?: string | null }): string {
  return log.note || SIGNING_LOG_LABELS[log.action] || '合同状态已更新'
}
