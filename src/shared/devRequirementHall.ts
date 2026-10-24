/** 开发者需求大厅（`/workbench/developer/requirements/hall`）的纯函数口径。
 *
 * 从 `views/DevRequirementHallView.vue` 抽出：金额 / 摘要的展示、发布方式与保证金闸门的读法、
 * 「接单」按钮上的状态文案。取值、文案与判定顺序一字未改——这里不碰响应式状态，
 * 单测直接喂参数，视图与组件只负责排版。
 */
import type { RequirementItem } from '@/api/devRequirements'
import { requirementRichTextPreview } from '@/utils/requirementRichText'

/** 表格与窄屏卡片里需求描述的预览长度：超出截断并补省略号。 */
const REQUIREMENT_PREVIEW_MAX_LENGTH = 120

/**
 * 排序下拉的选项，顺序即下拉里的顺序。
 *
 * 只有这两个字段：契约 `RequirementResponse` 里**没有 `updated_at`**（后端 DTO 就没有这一列），
 * 原先那个「最近更新」排序读的是不存在的字段，取到的永远是 `undefined`，
 * 结果整页顺序按原始顺序排列却写着「最近更新」——比没有这个选项更误导。
 */
export const REQUIREMENT_HALL_SORT_OPTIONS = [
  { value: 'created_time', label: '发布时间' },
  { value: 'budget', label: '预算' },
] as const

export type RequirementHallSortBy = (typeof REQUIREMENT_HALL_SORT_OPTIONS)[number]['value']

/** 预算读数：没填预算写「待议价」，有值直接跟一个 ¥（本页不做千分位，与原来同口径）。 */
export function formatRequirementBudget(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
}

/** 无电签（自管）需求：不走保证金闸门。 */
export function isSelfManagedRequirement(
  requirement: Pick<RequirementItem, 'payment_mode'>,
): boolean {
  return requirement.payment_mode === 'self_managed'
}

/** 要不要过入驻协议闸门：平台担保的需求才要，自管需求直接接。 */
export function requiresAgreementGate(requirement: Pick<RequirementItem, 'payment_mode'>): boolean {
  return !isSelfManagedRequirement(requirement)
}

/** 判定「接单」按钮上那句话要用到的资格读数。 */
export type RequirementBindGate = {
  /** 开发者入驻协议是否已签署（`GET /api/auth/dev-access-status` 的 `developer_agreement_signed`） */
  agreementSigned: boolean
}

/**
 * 「接单」按钮上的字：协议没签时说明卡在哪一步，签了就写「接单」。
 *
 * 保证金与信用额度**不再参与判定**：那两个读数在当前契约里没有端点（预付保证金与 `/credit/**`
 * 都没上线），拿不到真值。担保单的保证金由后端在接单时按可提现收益冻结，不够会回 409 中文说明，
 * 前端不预判——预判只能靠编数，编出来的「可接单」比不显示更糟。
 */
export function bindButtonLabel(
  requirement: Pick<RequirementItem, 'payment_mode'>,
  gate: RequirementBindGate,
): string {
  if (!requiresAgreementGate(requirement)) {
    return '接单'
  }

  if (!gate.agreementSigned) {
    return '需先签署协议'
  }

  return '接单'
}

/** 需求描述预览：先按富文本口径取纯文本，再按长度截断（截断后去掉行尾空白再补省略号）。 */
export function requirementPreviewText(
  value?: string | null,
  fallback = '未填写',
  maxLength = REQUIREMENT_PREVIEW_MAX_LENGTH,
): string {
  const preview = requirementRichTextPreview(value, fallback)

  if (preview.length <= maxLength) {
    return preview
  }

  return `${preview.slice(0, maxLength).trimEnd()}...`
}

/** 顶条读数：自管 / 担保两种发布方式各多少条（本页只统计当前页这几行）。 */
export function countRequirementPaymentModes(rows: RequirementItem[]): {
  selfManaged: number
  guarantee: number
} {
  const selfManaged = rows.filter((item) => isSelfManagedRequirement(item)).length

  return { selfManaged, guarantee: rows.length - selfManaged }
}
