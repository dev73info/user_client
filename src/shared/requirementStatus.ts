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
