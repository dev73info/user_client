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

/** 排序下拉的选项：服务端按这三个字段排，顺序即下拉里的顺序。 */
export const REQUIREMENT_HALL_SORT_OPTIONS = [
  { value: 'updated_at', label: '最近更新' },
  { value: 'created_time', label: '创建时间' },
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

/** 要不要过保证金闸门：平台担保的需求才要，自管需求直接接。 */
export function requiresDepositGate(requirement: Pick<RequirementItem, 'payment_mode'>): boolean {
  return !isSelfManagedRequirement(requirement)
}

/** 预算是否在信用额度之内。留 0.0001 的余量，避免浮点比较把「刚好等于额度」判成超限。 */
function isBudgetWithinCap(budget: number | null | undefined, cap: number): boolean {
  return (budget ?? 0) <= cap + 0.0001
}

/** 判定「接单」按钮上那句话要用到的资格读数。 */
export type RequirementBindGate = {
  /** 开发者入驻协议是否已签署 */
  agreementSigned: boolean
  /** 保证金够不够接单（后端给的 can_bind_requirement） */
  canTakeOrders: boolean
  /** 可用保证金（元） */
  availableCny: number
  /** 信用额度上限（元）；没有强制额度时传 `Number.POSITIVE_INFINITY` */
  orderCap: number
}

/**
 * 「接单」按钮上的字：资格不够时说明卡在哪一步，够就写「接单」。
 * 判定顺序即提示优先级：协议 → 保证金 → 信用额度，与原来一致（先拦最早该办的那件事）。
 */
export function bindButtonLabel(
  requirement: Pick<RequirementItem, 'payment_mode' | 'budget'>,
  gate: RequirementBindGate,
): string {
  if (!requiresDepositGate(requirement)) {
    return '接单'
  }

  if (!gate.agreementSigned) {
    return '需先签署协议'
  }

  if (!gate.canTakeOrders || (requirement.budget ?? 0) > gate.availableCny) {
    return '保证金不足'
  }

  if (!isBudgetWithinCap(requirement.budget, gate.orderCap)) {
    return '信用不足'
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
