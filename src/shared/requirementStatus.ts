const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  pending_review: '待审核',
  rejected: '已拒绝',
  pending_deposit: '待付定金',
  deposit_paid: '待开发',
  in_development: '开发中',
  pending_final: '待付尾款',
  // 尾款已缴、等待渠道分账；分账成功后才转为「已完成」并开放售后入口。
  pending_settlement: '待分账',
  completed: '已完成',
  cancelled: '已取消',
}

export function requirementStatusLabel(status: string): string {
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
