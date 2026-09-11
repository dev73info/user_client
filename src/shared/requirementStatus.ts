const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  pending_review: '待审核',
  rejected: '已拒绝',
  pending_deposit: '待付定金',
  deposit_paid: '待开发',
  in_development: '开发中',
  pending_final: '待付尾款',
  completed: '已完成',
  cancelled: '已取消',
}

export function requirementStatusLabel(status: string): string {
  return REQUIREMENT_STATUS_LABELS[status] ?? status
}
