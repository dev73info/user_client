import type { RequirementPaymentMode } from '@/api/requirements'

/** 与支付模式无关的状态文案；`deposit_paid` 一码两义，见下面的 `DEPOSIT_PAID_LABELS`。 */
const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  pending_review: '待审核',
  rejected: '已拒绝',
  pending_deposit: '待付定金',
  in_development: '开发中',
  pending_final: '待付尾款',
  // 尾款已缴、等待渠道分账；分账成功后才转为「已完成」并开放解除合作入口。
  pending_settlement: '待分账',
  completed: '已完成',
  cancelled: '已取消',
}

/**
 * `deposit_paid` 是「一码两义」：同一个状态码在两种支付模式下处在流程的不同位置。
 *
 * - 电签担保（`platform_guarantee`）：定金已进平台托管、合同还在签署中，是**过渡态**——写「已付定金」；
 * - 无电签约定（`self_managed`）：没有合同也没有定金，审核通过即等开发者接单，是**正式态**——写「待开发」。
 *
 * 所以调用点**能拿到该需求的 `payment_mode` 就要传进来**，只写「待开发」会被读成「已经付了定金」，
 * 只写「已付定金」又会让人以为自管模式也有定金。
 */
const DEPOSIT_PAID_LABELS: Record<RequirementPaymentMode, string> = {
  platform_guarantee: '已付定金',
  self_managed: '待开发',
}

/**
 * 拿不到支付模式时的回退：两种含义一起写出来。
 *
 * 这些地方判断不了模式——状态筛选下拉、统计卡、跨模式列表，或者调用方手上只有状态码。
 * 回退成任意单边都是替用户做假设：写成「已付定金」会让自管需求凭空多出一笔定金，
 * 写成「待开发」又会让担保需求的用户以为定金还没付。两种都写虽然长一点，但不会误导。
 */
const DEPOSIT_PAID_UNKNOWN_MODE_LABEL = '已付定金 / 待开发'

/**
 * 需求状态码 → 中文文案。
 *
 * `paymentMode` 可选：只有 `deposit_paid` 需要它来消歧（见上），其余状态给了也不影响结果。
 * 传了未知 / 缺失的模式时按「未知模式回退」处理，不猜单边含义。状态码本身不在表里时原样返回。
 */
export function requirementStatusLabel(status: string, paymentMode?: RequirementPaymentMode): string {
  if (status === 'deposit_paid') {
    return (paymentMode && DEPOSIT_PAID_LABELS[paymentMode]) || DEPOSIT_PAID_UNKNOWN_MODE_LABEL
  }

  return REQUIREMENT_STATUS_LABELS[status] ?? status
}

/**
 * 「在途接单」的状态集合：从待付定金一路走到待分账。
 *
 * 两个终止态（`rejected` / `cancelled`）与结单（`completed`）都不算在途。
 * 侧边栏「我的接单」角标与工作台总览的「进行中项目」共用这一份口径，
 * 两个地方各写一份列表一定会漂移。
 */
const ACTIVE_REQUIREMENT_STATUSES: ReadonlyArray<string> = [
  'pending_deposit',
  'deposit_paid',
  'in_development',
  'pending_final',
  'pending_settlement',
]

export function isActiveRequirement(status: string): boolean {
  return ACTIVE_REQUIREMENT_STATUSES.includes(status)
}

/**
 * 接单状态 → 流程进度百分比。
 *
 * 后端没有「完成度」这种字段，这里表达的是「流程走到哪一步」的位置刻度，
 * 只用于总览页进度条，不要拿它当工作量或交付比例。
 */
const REQUIREMENT_PROGRESS_PERCENT: Record<string, number> = {
  pending_review: 0,
  pending_deposit: 20,
  deposit_paid: 40,
  in_development: 60,
  pending_final: 90,
  pending_settlement: 95,
  completed: 100,
  rejected: 0,
  cancelled: 0,
}

export function requirementProgressPercent(status: string): number {
  return REQUIREMENT_PROGRESS_PERCENT[status] ?? 0
}
