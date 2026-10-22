import type { ContractAttachmentParty } from '@/shared/contracts'

/** 允许上传的扩展名（与后端任务-01 的格式判定一致：pdf / doc / docx，不收图片）。 */
export const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx']
export const ACCEPTED_ATTR = ACCEPTED_EXTENSIONS.join(',')

/**
 * 拟定金额预校验：必须等于需求单预算、且大于 0（后端仍会再校验一次）。
 *
 * 拿不到需求单预算时不做金额拦截——交给后端判定，避免把「信息没加载出来」误报成「金额不合法」。
 * 返回空串表示通过。
 */
export function validateAttachmentDraftAmount(amount: number, budget: number | null): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '拟定金额必须大于 0，且与需求单预算一致'
  }
  if (budget != null && Math.abs(amount - budget) > 0.001) {
    return `拟定金额必须等于需求单预算 ¥${budget.toFixed(2)}（当前填写 ¥${amount.toFixed(2)}）`
  }
  return ''
}

/**
 * 自定义合同附件面板的展示层纯函数（R047 从 `components/ContractAttachmentPanel.vue` 下沉）。
 *
 * 只做「字节数 → 人能读的大小」与「当事人枚举 → 中文」，不碰状态、不发请求。
 */

export function formatAttachmentSize(bytes: number | null | undefined): string {
  const size = bytes ?? 0
  if (size <= 0) {
    return '未知大小'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

export function attachmentPartyLabel(party: ContractAttachmentParty | null | undefined): string {
  if (party === 'party_a') return '甲方（需求方）'
  if (party === 'party_b') return '乙方（开发者）'
  return '未知提交方'
}
